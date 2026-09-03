"""
企業級 Web 版報價與商務管理系統 - 後端 API
入口點: api/index.py (相容 Vercel Serverless Function & PostgreSQL)
"""

import os
import re
import math
import json
import time
import secrets
import base64
import hashlib
import hmac
from uuid import uuid4
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, Dict, List, Optional
from contextlib import contextmanager

from fastapi import FastAPI, Header, HTTPException, Query, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import psycopg2
from psycopg2 import pool
from psycopg2.extras import RealDictCursor

# -----------------------------------------------------------------------------
# 1. 常數與設定 (CONSTANTS & CONFIGURATION)
# -----------------------------------------------------------------------------
# 支援 Vercel Postgres / Neon / Heroku / AWS RDS 各種環境變數名稱
POSTGRES_URL = (
    os.getenv("POSTGRES_URL") or 
    os.getenv("POSTGRES_PRISMA_URL") or 
    os.getenv("DATABASE_URL") or 
    os.getenv("POSTGRES_URL_NON_POOLING") or 
    ""
)
INIT_DB_TOKEN = os.getenv("INIT_DB_TOKEN", "")
AUTH_SECRET = os.getenv("AUTH_SECRET", "")
# Serverless 每次冷啟動都跑完整 DDL 會拖慢 API，正式環境改由受保護的 /api/init-db 執行。
AUTO_INIT_SCHEMA = os.getenv("AUTO_INIT_SCHEMA", "").lower() == "true"
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
    if origin.strip()
]

DEFAULT_PAGE_SIZE = 10
MAX_PAGE_SIZE = 100

# 建立 FastAPI 實例
app = FastAPI(
    title="Quotation & Commerce Management API",
    description="企業級報價單與商務管理系統後端 API (PostgreSQL + FastAPI)",
    version="2.0.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json"
)

# 支援跨來源資源共享 (CORS)
app.add_middleware(
    CORSMiddleware,
    # Cookie/Authorization credential requests cannot safely use a wildcard origin.
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------------------------------------------------------
# 2. 資料庫連線池與交易管理 (DATABASE & TRANSACTION MANAGEMENT)
# -----------------------------------------------------------------------------
DB_POOL: Optional[pool.SimpleConnectionPool] = None
IS_INITIALIZED = False

PUBLIC_API_PATHS = {"/api/health", "/api/auth/login", "/api/init-db", "/api/docs", "/api/openapi.json"}
API_MENU_PATHS = {
    "/api/customers": "customers", "/api/vendors": "vendors", "/api/products": "products",
    "/api/quotations": "quotations", "/api/transactions": "transactions", "/api/companies": "company",
    "/api/company": "company", "/api/users": "users", "/api/audit-logs": "audit_logs",
    "/api/audit_logs": "audit_logs", "/api/metrics": "dashboard",
}
AUDIT_MODULES = {
    "/api/customers": ("customers", "客戶管理"),
    "/api/vendors": ("vendors", "廠商管理"),
    "/api/products": ("products", "產品管理"),
    "/api/quotations": ("quotations", "報價單管理"),
    "/api/transactions": ("transactions", "交易管理"),
    "/api/companies": ("company", "公司基本資料"),
    "/api/users": ("users", "使用者與權限管理"),
}
AUDIT_ACTIONS = {"POST": ("CREATE", "新增"), "PUT": ("UPDATE", "修改"), "DELETE": ("DELETE", "刪除")}


def createAccessToken(user: Dict[str, Any]) -> str:
    """建立短效、簽章驗證的 API 存取權杖，避免信任前端 localStorage 的角色資料。"""
    expiresAt = int(time.time()) + 8 * 60 * 60
    payload = json.dumps({
        "sub": user["id"], "role": user["role"],
        "name": user["name"],
        "menus": user.get("allowed_menus", "").split(","), "exp": expiresAt
    }, separators=(",", ":")).encode("utf-8")
    encodedPayload = base64.urlsafe_b64encode(payload).rstrip(b"=")
    signature = hmac.new(AUTH_SECRET.encode("utf-8"), encodedPayload, hashlib.sha256).digest()
    return f"{encodedPayload.decode('ascii')}.{base64.urlsafe_b64encode(signature).rstrip(b'=').decode('ascii')}"


def verifyAccessToken(token: str) -> Optional[Dict[str, Any]]:
    try:
        encodedPayload, encodedSignature = token.split(".", 1)
        expected = hmac.new(AUTH_SECRET.encode("utf-8"), encodedPayload.encode("ascii"), hashlib.sha256).digest()
        supplied = base64.urlsafe_b64decode(encodedSignature + "=" * (-len(encodedSignature) % 4))
        if not hmac.compare_digest(expected, supplied):
            return None
        payload = json.loads(base64.urlsafe_b64decode(encodedPayload + "=" * (-len(encodedPayload) % 4)))
        return payload if payload.get("exp", 0) > time.time() else None
    except (ValueError, TypeError, json.JSONDecodeError):
        return None


@app.middleware("http")
async def enforceApiAuthorization(request: Request, callNext):
    path = request.url.path
    if not path.startswith("/api/") or request.method == "OPTIONS" or path in PUBLIC_API_PATHS:
        return await callNext(request)
    if not AUTH_SECRET:
        return createApiResponse(False, message="伺服器未設定 AUTH_SECRET", statusCode=status.HTTP_503_SERVICE_UNAVAILABLE)
    authorization = request.headers.get("Authorization", "")
    token = authorization.removeprefix("Bearer ").strip()
    claims = verifyAccessToken(token) if token else None
    if not claims:
        return createApiResponse(False, message="登入已失效或未提供有效憑證", statusCode=status.HTTP_401_UNAUTHORIZED)
    requiredMenu = next((menu for prefix, menu in API_MENU_PATHS.items() if path.startswith(prefix)), None)
    if requiredMenu and claims.get("role") != "ADMIN" and requiredMenu not in claims.get("menus", []):
        return createApiResponse(False, message="您沒有存取此功能的權限", statusCode=status.HTTP_403_FORBIDDEN)
    request.state.user = claims
    return await callNext(request)

def getDbPool() -> Optional[pool.SimpleConnectionPool]:
    """獲取或初始化資料庫連線池 (Lazy initialization)"""
    global DB_POOL
    if not POSTGRES_URL:
        return None
    
    if DB_POOL is None or DB_POOL.closed:
        try:
            # 針對 Serverless 限制連線數，避免耗盡連線
            DB_POOL = pool.SimpleConnectionPool(
                minconn=1,
                maxconn=10,
                dsn=POSTGRES_URL,
                sslmode="require" if "vercel-storage" in POSTGRES_URL or "neon.tech" in POSTGRES_URL or "amazonaws.com" in POSTGRES_URL else "prefer"
            )
        except Exception as err:
            print(f"[DB_ERROR] 初始化連線池失敗: {err}")
            return None
    return DB_POOL


@contextmanager
def getDbConnection():
    """
    提供資料庫連線 Context Manager
    確保連線能正常釋放，並自動維護連線狀態
    """
    if not POSTGRES_URL:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="伺服器未設定 POSTGRES_URL / DATABASE_URL 環境變數，請於 Vercel 設定中綁定 PostgreSQL 資料庫。"
        )
    
    connectionPool = getDbPool()
    conn = None
    try:
        if connectionPool:
            conn = connectionPool.getconn()
        else:
            conn = psycopg2.connect(
                POSTGRES_URL,
                sslmode="require" if "vercel-storage" in POSTGRES_URL or "neon.tech" in POSTGRES_URL else "prefer"
            )
        yield conn
    except Exception:
        # 同一筆寫入流程任一步失敗都必須復原，避免 UI 顯示失敗但資料已部分寫入。
        if conn and not conn.closed:
            conn.rollback()
        raise
    finally:
        if conn:
            if connectionPool:
                connectionPool.putconn(conn)
            else:
                conn.close()


def writeAuditLog(module: str, moduleTitle: str, actionType: str, actionTitle: str,
                  targetId: Optional[str], operator: str, ipAddress: Optional[str]) -> None:
    """使用獨立連線寫入成功的異動；審計失敗不可回頭影響已完成的商務交易。"""
    try:
        with getDbConnection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO audit_logs (
                        module, module_title, action_type, action_title, target_id,
                        target_name, operator, details, ip_address
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s);
                """, (
                    module, moduleTitle, actionType, actionTitle, targetId,
                    targetId or moduleTitle, operator,
                    f"{actionTitle}{moduleTitle}" + (f"（目標 ID：{targetId}）" if targetId else ""),
                    ipAddress or ""
                ))
            conn.commit()
    except Exception as err:
        print(f"[AUDIT_LOG] 寫入失敗：{err}")


@app.middleware("http")
async def recordSuccessfulMutations(request: Request, callNext):
    response = await callNext(request)
    if request.method not in AUDIT_ACTIONS or response.status_code >= 400:
        return response

    matchedPath = next((path for path in AUDIT_MODULES if request.url.path.startswith(path)), None)
    if not matchedPath:
        return response

    module, moduleTitle = AUDIT_MODULES[matchedPath]
    actionType, actionTitle = AUDIT_ACTIONS[request.method]
    pathSegments = request.url.path.rstrip("/").split("/")
    targetId = pathSegments[-1] if pathSegments[-1].isdigit() else None
    claims = getattr(request.state, "user", {})
    operator = claims.get("name") or f"使用者 #{claims.get('sub', '未知')}"
    writeAuditLog(module, moduleTitle, actionType, actionTitle, targetId, operator, request.client.host if request.client else None)
    return response


def autoEnsureSchema():
    """僅在明確開啟時執行 Schema 自動初始化，避免 Serverless 冷啟動阻塞一般 API。"""
    global IS_INITIALIZED
    if IS_INITIALIZED or not POSTGRES_URL:
        return
    if not AUTO_INIT_SCHEMA:
        IS_INITIALIZED = True
        return
    try:
        executeInitDb()
        IS_INITIALIZED = True
    except Exception as e:
        print(f"[SCHEMA_INIT] 自動初始化綱要略過或發生警告: {e}")


# -----------------------------------------------------------------------------
# 3. 統一回應格式輔助函式 (STANDARD RESPONSE HELPER)
# -----------------------------------------------------------------------------
def createApiResponse(
    isSuccess: bool,
    data: Any = None,
    message: str = "",
    errorMessage: Optional[str] = None,
    pagination: Optional[Dict[str, Any]] = None,
    statusCode: int = status.HTTP_200_OK
) -> JSONResponse:
    content = {
        "success": isSuccess,
        "data": data,
        "message": message,
        "error": errorMessage,
        "pagination": pagination
    }
    # PostgreSQL 回傳的 datetime、Decimal 等型別需先轉為 JSON 相容格式，
    # 否則資料已 commit 後仍可能因回應序列化失敗而讓前端誤顯示建立失敗。
    return JSONResponse(status_code=statusCode, content=jsonable_encoder(content))


def canManageQuotation(request: Request, salesRep: Optional[str]) -> bool:
    """報價資料異動僅限原帶入的聯絡窗口或系統管理者。"""
    claims = getattr(request.state, "user", {})
    if claims.get("role") == "ADMIN":
        return True
    operatorName = (claims.get("name") or "").strip()
    return bool(operatorName and salesRep and operatorName == salesRep.strip())


@app.exception_handler(RequestValidationError)
async def handleRequestValidationError(_: Request, exc: RequestValidationError):
    """將 FastAPI 預設 detail 格式轉為系統統一錯誤信封。"""
    fields = {
        ".".join(str(part) for part in error.get("loc", [])[1:]): error.get("msg", "欄位格式不正確")
        for error in exc.errors()
    }
    return createApiResponse(
        isSuccess=False,
        message="欄位資料不正確",
        errorMessage=json.dumps(fields, ensure_ascii=False),
        statusCode=status.HTTP_422_UNPROCESSABLE_ENTITY
    )


@app.exception_handler(HTTPException)
async def handleHttpException(_: Request, exc: HTTPException):
    detail = exc.detail if isinstance(exc.detail, str) else json.dumps(exc.detail, ensure_ascii=False)
    return createApiResponse(isSuccess=False, message=detail, errorMessage=detail, statusCode=exc.status_code)


# -----------------------------------------------------------------------------
# 4. Pydantic 模型定義 (DATA TRANSFER OBJECTS)
# -----------------------------------------------------------------------------
class LoginInput(BaseModel):
    username: str = Field(..., min_length=1, max_length=50)
    password: str = Field(..., min_length=1, max_length=255)

class CustomerInput(BaseModel):
    customerCode: Optional[str] = Field(None, max_length=50)
    customerName: str = Field(..., min_length=1, max_length=255)
    taxId: Optional[str] = Field(None, max_length=50)
    contactPerson: Optional[str] = Field(None, max_length=100)
    department: Optional[str] = Field(None, max_length=100)
    title: Optional[str] = Field(None, max_length=100)
    fax: Optional[str] = Field(None, max_length=50)
    email: Optional[str] = Field(None, max_length=255)
    phone: Optional[str] = Field(None, max_length=50)
    address: Optional[str] = Field(None, max_length=500)
    shippingAddress: Optional[str] = Field(None, max_length=500)
    paymentTerms: Optional[str] = Field(None, max_length=100)
    industry: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = Field(None, max_length=1000)
    createdBy: Optional[str] = Field(None, max_length=100)
    updatedBy: Optional[str] = Field(None, max_length=100)

    class Config:
        extra = "ignore"

class VendorInput(BaseModel):
    vendorCode: Optional[str] = Field(None, max_length=50)
    vendorName: str = Field(..., min_length=1, max_length=255)
    taxId: Optional[str] = Field(None, max_length=50)
    contactPerson: Optional[str] = Field(None, max_length=100)
    phone: Optional[str] = Field(None, max_length=50)
    email: Optional[str] = Field(None, max_length=255)
    address: Optional[str] = Field(None, max_length=500)
    productsServices: Optional[str] = Field(None, max_length=1000)
    notes: Optional[str] = Field(None, max_length=1000)
    createdBy: Optional[str] = Field(None, max_length=100)
    updatedBy: Optional[str] = Field(None, max_length=100)

    class Config:
        extra = "ignore"

class ProductInput(BaseModel):
    productCode: Optional[str] = Field(None, max_length=50)
    productName: str = Field(..., min_length=1, max_length=255)
    category: Optional[str] = Field("一般商品", max_length=100)
    brand: Optional[str] = Field(None, max_length=100)
    model: Optional[str] = Field(None, max_length=100)
    vendor: Optional[str] = Field(None, max_length=255)
    vendorId: Optional[int] = None
    unit: Optional[str] = Field("件", max_length=20)
    unitPrice: Decimal = Field(..., ge=0)
    costPrice: Optional[Decimal] = Field(Decimal("0.00"), ge=0)
    stockQuantity: Optional[int] = Field(100, ge=0)
    image: Optional[str] = None
    imageUrl: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = Field("ACTIVE")
    createdBy: Optional[str] = Field(None, max_length=100)
    updatedBy: Optional[str] = Field(None, max_length=100)

    class Config:
        extra = "ignore"

class QuotationItemInput(BaseModel):
    productId: Optional[int] = None
    itemNumber: Optional[int] = 1
    itemName: str = Field(..., min_length=1, max_length=255)
    specifications: Optional[str] = None
    description: Optional[str] = None
    unit: Optional[str] = "件"
    quantity: Decimal = Field(..., gt=0)
    costPrice: Optional[Decimal] = Field(Decimal("0.00"), ge=0)
    unitPrice: Decimal = Field(..., ge=0)
    lineTotal: Optional[Decimal] = None
    subtotal: Optional[Decimal] = None
    sortOrder: int = 0
    notes: Optional[str] = None

    class Config:
        extra = "ignore"

class QuotationInput(BaseModel):
    quotationNumber: str = Field(..., min_length=3, max_length=50)
    companyId: Optional[int] = None
    companyName: Optional[str] = None
    customerId: Optional[int] = None
    customerName: str = Field(..., min_length=1, max_length=255)
    customerTaxId: Optional[str] = None
    customerContactPerson: Optional[str] = None
    customerEmail: Optional[str] = None
    customerPhone: Optional[str] = None
    customerAddress: Optional[str] = None
    shippingAddress: Optional[str] = None
    paymentTerms: Optional[str] = None
    salesRep: Optional[str] = None
    salesPhone: Optional[str] = None
    salesEmail: Optional[str] = None
    issueDate: date = Field(default_factory=date.today)
    expiryDate: Optional[date] = None
    validUntil: Optional[date] = None
    status: str = Field("DRAFT")
    taxMode: Optional[str] = Field("EXCLUSIVE")
    taxRate: Decimal = Field(Decimal("5.00"), ge=0, le=100)
    discountAmount: Optional[Decimal] = Field(Decimal("0.00"), ge=0)
    totalAmount: Optional[Decimal] = None
    totalCost: Optional[Decimal] = None
    estimatedProfit: Optional[Decimal] = None
    notes: Optional[str] = None
    createdBy: Optional[str] = None
    updatedBy: Optional[str] = None
    items: List[QuotationItemInput] = Field(..., min_items=1)

    class Config:
        extra = "ignore"

class QuotationRevisionInput(BaseModel):
    operator: Optional[str] = Field(None, max_length=100)

    class Config:
        extra = "ignore"

class InvoiceInput(BaseModel):
    id: Optional[int] = None
    invoiceNumber: str
    invoiceDate: date = Field(default_factory=date.today)
    amount: Decimal = Field(..., ge=0)
    status: str = "PENDING"
    notes: Optional[str] = None

    class Config:
        extra = "ignore"

class TransactionInput(BaseModel):
    transactionNumber: Optional[str] = None
    quotationId: Optional[int] = None
    quotationNumber: Optional[str] = None
    customerName: str = Field(..., min_length=1, max_length=255)
    customerEmail: Optional[str] = None
    transactionDate: date = Field(default_factory=date.today)
    totalAmount: Decimal = Field(..., ge=0)
    costPrice: Optional[Decimal] = Field(Decimal("0.00"), ge=0)
    paidAmount: Optional[Decimal] = Field(Decimal("0.00"), ge=0)
    paymentMethod: Optional[str] = "電匯 (Wire Transfer)"
    paymentStatus: Optional[str] = "PENDING"
    fulfillmentStatus: Optional[str] = "PROCESSING"
    notes: Optional[str] = None
    createdBy: Optional[str] = None
    updatedBy: Optional[str] = None
    invoices: Optional[List[InvoiceInput]] = Field(default_factory=list)

    class Config:
        extra = "ignore"

class CompanyInput(BaseModel):
    companyName: str = Field(..., min_length=1, max_length=255)
    taxId: Optional[str] = None
    phone: Optional[str] = None
    fax: Optional[str] = None
    address: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    bankName: Optional[str] = None
    bankAccount: Optional[str] = None
    bankAccountName: Optional[str] = None
    contactPerson: Optional[str] = None
    contactPhone: Optional[str] = None
    contactEmail: Optional[str] = None
    isDefault: Optional[bool] = False
    logoUrl: Optional[str] = None
    defaultTerms: Optional[str] = None
    createdBy: Optional[str] = None
    updatedBy: Optional[str] = None

    class Config:
        extra = "ignore"

class UserInput(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    title: Optional[str] = Field(None, max_length=100)
    username: str = Field(..., min_length=2, max_length=50)
    password: Optional[str] = None
    department: Optional[str] = "業務部"
    phone: Optional[str] = None
    email: Optional[str] = None
    role: str = Field("USER")
    allowedMenus: Optional[str] = "dashboard,customers,vendors,products,quotations,transactions,company,users,auditLogs"
    status: Optional[str] = "ACTIVE"
    createdBy: Optional[str] = None
    updatedBy: Optional[str] = None

    class Config:
        extra = "ignore"

class ChangePasswordInput(BaseModel):
    username: str = Field(..., min_length=1, max_length=50)
    oldPassword: Optional[str] = None
    newPassword: str = Field(..., min_length=4, max_length=255)

    class Config:
        extra = "ignore"


# -----------------------------------------------------------------------------
# 5. 資料庫初始化 (SCHEMA INITIALIZATION)
# -----------------------------------------------------------------------------
def executeInitDb() -> bool:
    """建立完整的所有資料表與欄位，並寫入預設初始資料"""
    schemaSql = """
    CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        customer_code VARCHAR(50) UNIQUE,
        customer_name VARCHAR(255) NOT NULL,
        tax_id VARCHAR(50),
        contact_person VARCHAR(100),
        email VARCHAR(255),
        phone VARCHAR(50),
        address VARCHAR(500),
        shipping_address VARCHAR(500),
        payment_terms VARCHAR(100),
        industry VARCHAR(100),
        notes TEXT,
        created_by VARCHAR(100),
        updated_by VARCHAR(100),
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS vendors (
        id SERIAL PRIMARY KEY,
        vendor_code VARCHAR(50) UNIQUE,
        vendor_name VARCHAR(255) NOT NULL,
        tax_id VARCHAR(50),
        contact_person VARCHAR(100),
        phone VARCHAR(50),
        email VARCHAR(255),
        address VARCHAR(500),
        products_services TEXT,
        notes TEXT,
        created_by VARCHAR(100),
        updated_by VARCHAR(100),
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        product_code VARCHAR(50) UNIQUE,
        product_name VARCHAR(255) NOT NULL,
        category VARCHAR(100) DEFAULT '一般商品',
        brand VARCHAR(100),
        model VARCHAR(100),
        vendor VARCHAR(255),
        vendor_id INTEGER REFERENCES vendors(id) ON DELETE SET NULL,
        unit VARCHAR(20) DEFAULT '件',
        unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (unit_price >= 0),
        cost_price NUMERIC(12, 2) DEFAULT 0.00 CHECK (cost_price >= 0),
        stock_quantity INTEGER DEFAULT 100 CHECK (stock_quantity >= 0),
        image TEXT,
        description TEXT,
        status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'DISCONTINUED')),
        created_by VARCHAR(100),
        updated_by VARCHAR(100),
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS companies (
        id SERIAL PRIMARY KEY,
        company_name VARCHAR(255) NOT NULL,
        tax_id VARCHAR(50),
        phone VARCHAR(50),
        fax VARCHAR(50),
        address VARCHAR(500),
        email VARCHAR(255),
        website VARCHAR(255),
        bank_name VARCHAR(100),
        bank_account VARCHAR(100),
        bank_account_name VARCHAR(255),
        contact_person VARCHAR(100),
        contact_phone VARCHAR(50),
        contact_email VARCHAR(255),
        is_default BOOLEAN DEFAULT FALSE,
        logo_url TEXT,
        default_terms TEXT,
        created_by VARCHAR(100),
        updated_by VARCHAR(100),
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS company_settings (
        id SERIAL PRIMARY KEY,
        company_name VARCHAR(255) NOT NULL DEFAULT '極簡資訊科技股份有限公司',
        tax_id VARCHAR(50) DEFAULT '28491023',
        phone VARCHAR(50) DEFAULT '(02) 2345-6789',
        fax VARCHAR(50) DEFAULT '(02) 2345-6780',
        address VARCHAR(500) DEFAULT '台北市信義區松仁路 100 號 18 樓',
        email VARCHAR(255) DEFAULT 'contact@quotationpro.com.tw',
        website VARCHAR(255) DEFAULT 'https://www.quotationpro.com.tw',
        bank_name VARCHAR(100) DEFAULT '台灣銀行 信義分行',
        bank_account VARCHAR(100) DEFAULT '012-345-678901',
        bank_account_name VARCHAR(255) DEFAULT '極簡資訊科技股份有限公司',
        default_terms TEXT,
        updated_by VARCHAR(100),
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        username VARCHAR(50) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL DEFAULT 'admin888',
        department VARCHAR(100) DEFAULT '業務部',
        phone VARCHAR(50),
        email VARCHAR(255),
        role VARCHAR(20) NOT NULL DEFAULT 'USER' CHECK (role IN ('ADMIN', 'USER')),
        allowed_menus TEXT DEFAULT 'dashboard,customers,vendors,products,quotations,transactions,company,users,auditLogs',
        status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
        created_by VARCHAR(100),
        updated_by VARCHAR(100),
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS quotations (
        id SERIAL PRIMARY KEY,
        quotation_number VARCHAR(50) NOT NULL UNIQUE,
        company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
        company_name VARCHAR(255),
        customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
        customer_name VARCHAR(255) NOT NULL,
        customer_tax_id VARCHAR(50),
        customer_contact_person VARCHAR(100),
        customer_email VARCHAR(255),
        customer_phone VARCHAR(50),
        customer_address VARCHAR(500),
        shipping_address VARCHAR(500),
        payment_terms VARCHAR(100),
        sales_rep VARCHAR(100),
        sales_phone VARCHAR(50),
        sales_email VARCHAR(255),
        issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
        expiry_date DATE,
        valid_until DATE,
        status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED')),
        tax_mode VARCHAR(20) NOT NULL DEFAULT 'EXCLUSIVE',
        subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (subtotal >= 0),
        tax_rate NUMERIC(5, 2) NOT NULL DEFAULT 5.00 CHECK (tax_rate >= 0),
        tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (tax_amount >= 0),
        discount_amount NUMERIC(12, 2) DEFAULT 0.00,
        total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (total_amount >= 0),
        total_cost NUMERIC(12, 2) DEFAULT 0.00,
        estimated_profit NUMERIC(12, 2) DEFAULT 0.00,
        notes TEXT,
        created_by VARCHAR(100),
        updated_by VARCHAR(100),
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS quotation_items (
        id SERIAL PRIMARY KEY,
        quotation_id INTEGER NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
        item_number INTEGER DEFAULT 1,
        item_name VARCHAR(255) NOT NULL,
        specifications TEXT,
        description TEXT,
        unit VARCHAR(20) DEFAULT '件',
        quantity NUMERIC(10, 2) NOT NULL DEFAULT 1.00 CHECK (quantity > 0),
        cost_price NUMERIC(12, 2) DEFAULT 0.00 CHECK (cost_price >= 0),
        unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (unit_price >= 0),
        line_total NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (line_total >= 0),
        subtotal NUMERIC(12, 2) DEFAULT 0.00,
        sort_order INTEGER NOT NULL DEFAULT 0,
        notes TEXT
    );

    CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        transaction_number VARCHAR(50) NOT NULL UNIQUE,
        quotation_id INTEGER REFERENCES quotations(id) ON DELETE SET NULL,
        quotation_number VARCHAR(50),
        customer_name VARCHAR(255) NOT NULL,
        customer_email VARCHAR(255),
        transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
        total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (total_amount >= 0),
        cost_price NUMERIC(12, 2) DEFAULT 0.00 CHECK (cost_price >= 0),
        paid_amount NUMERIC(12, 2) DEFAULT 0.00 CHECK (paid_amount >= 0),
        payment_method VARCHAR(50) DEFAULT '電匯 (Wire Transfer)',
        payment_status VARCHAR(20) DEFAULT 'PENDING' CHECK (payment_status IN ('PENDING', 'PARTIAL', 'PAID', 'REFUNDED')),
        fulfillment_status VARCHAR(20) DEFAULT 'PROCESSING' CHECK (fulfillment_status IN ('PROCESSING', 'DELIVERED', 'COMPLETED', 'CANCELLED')),
        notes TEXT,
        created_by VARCHAR(100),
        updated_by VARCHAR(100),
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS transaction_invoices (
        id SERIAL PRIMARY KEY,
        transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
        invoice_number VARCHAR(50) NOT NULL,
        invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
        amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (amount >= 0),
        status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PAID', 'PENDING', 'CANCELLED')),
        notes VARCHAR(255),
        created_by VARCHAR(100),
        updated_by VARCHAR(100),
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        module VARCHAR(50) NOT NULL,
        module_title VARCHAR(100) NOT NULL,
        action_type VARCHAR(50) NOT NULL,
        action_title VARCHAR(100) NOT NULL,
        target_id VARCHAR(50),
        target_name VARCHAR(255),
        operator VARCHAR(100) NOT NULL DEFAULT '系統使用者',
        details TEXT,
        ip_address VARCHAR(50) DEFAULT '127.0.0.1',
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- 欄位安全升級
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS tax_id VARCHAR(50);
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS shipping_address VARCHAR(500);
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS payment_terms VARCHAR(100);
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS industry VARCHAR(100);
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS created_by VARCHAR(100);
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS updated_by VARCHAR(100);

    ALTER TABLE products ADD COLUMN IF NOT EXISTS brand VARCHAR(100);
    ALTER TABLE products ADD COLUMN IF NOT EXISTS model VARCHAR(100);
    ALTER TABLE products ADD COLUMN IF NOT EXISTS vendor VARCHAR(255);
    ALTER TABLE products ADD COLUMN IF NOT EXISTS vendor_id INTEGER REFERENCES vendors(id) ON DELETE SET NULL;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS image TEXT;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS created_by VARCHAR(100);
    ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_by VARCHAR(100);

    ALTER TABLE quotations ADD COLUMN IF NOT EXISTS company_id INTEGER;
    ALTER TABLE quotations ADD COLUMN IF NOT EXISTS company_name VARCHAR(255);
    ALTER TABLE quotations ADD COLUMN IF NOT EXISTS customer_tax_id VARCHAR(50);
    ALTER TABLE quotations ADD COLUMN IF NOT EXISTS customer_contact_person VARCHAR(100);
    ALTER TABLE quotations ADD COLUMN IF NOT EXISTS customer_address VARCHAR(500);
    ALTER TABLE quotations ADD COLUMN IF NOT EXISTS shipping_address VARCHAR(500);
    ALTER TABLE quotations ADD COLUMN IF NOT EXISTS payment_terms VARCHAR(100);
    ALTER TABLE quotations ADD COLUMN IF NOT EXISTS sales_rep VARCHAR(100);
    ALTER TABLE quotations ADD COLUMN IF NOT EXISTS sales_phone VARCHAR(50);
    ALTER TABLE quotations ADD COLUMN IF NOT EXISTS sales_email VARCHAR(255);
    ALTER TABLE quotations ADD COLUMN IF NOT EXISTS valid_until DATE;
    ALTER TABLE quotations ADD COLUMN IF NOT EXISTS tax_mode VARCHAR(20) DEFAULT 'EXCLUSIVE';
    ALTER TABLE quotations ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12, 2) DEFAULT 0.00;
    ALTER TABLE quotations ADD COLUMN IF NOT EXISTS total_cost NUMERIC(12, 2) DEFAULT 0.00;
    ALTER TABLE quotations ADD COLUMN IF NOT EXISTS estimated_profit NUMERIC(12, 2) DEFAULT 0.00;
    ALTER TABLE quotations ADD COLUMN IF NOT EXISTS created_by VARCHAR(100);
    ALTER TABLE quotations ADD COLUMN IF NOT EXISTS updated_by VARCHAR(100);

    ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS item_number INTEGER DEFAULT 1;
    ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS specifications TEXT;
    ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS unit VARCHAR(20) DEFAULT '件';
    ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS cost_price NUMERIC(12, 2) DEFAULT 0.00;
    ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS subtotal NUMERIC(12, 2) DEFAULT 0.00;
    ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS notes TEXT;

    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS cost_price NUMERIC(12, 2) DEFAULT 0.00;
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(12, 2) DEFAULT 0.00;
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS created_by VARCHAR(100);
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS updated_by VARCHAR(100);

    -- 預設公司種子資料
    INSERT INTO companies (id, company_name, tax_id, phone, fax, address, email, website, bank_name, bank_account, bank_account_name, contact_person, contact_phone, contact_email, is_default, default_terms)
    VALUES 
    (1, '宏碁資訊科技有限公司', '28491023', '(02) 2789-0123', '(02) 2789-0124', '台北市南港區園區街 3-1 號 8 樓', 'contact@acer-info.com.tw', 'https://www.acer-info.com.tw', '台灣銀行 南港分行', '012-345-678901', '宏碁資訊科技有限公司', '王總監', '(02) 2789-0123 #101', 'director.wang@acer-info.com.tw', TRUE, '1. 本報價單有效期限為 30 天。\n2. 付款條件：月結 30 天電匯。\n3. 保固服務：提供一年 8x5 到府維護與技術支援。')
    ON CONFLICT (id) DO NOTHING;

    -- 預設管理者與使用者
    INSERT INTO users (id, name, username, password, department, phone, email, role, allowed_menus, status)
    VALUES
    (1, '系統管理者 (Architect)', 'admin', 'admin888', '資訊管理部', '(02) 2789-0123 #101', 'admin@acer-info.com.tw', 'ADMIN', 'dashboard,customers,vendors,products,quotations,transactions,company,users,auditLogs', 'ACTIVE'),
    (2, '陳大明 (業務經理)', 'sales_chen', 'user123', '業務一部', '(02) 2789-0123 #201', 'daming.chen@acer-info.com.tw', 'USER', 'dashboard,customers,vendors,products,quotations,transactions', 'ACTIVE'),
    (3, '林小花 (業務助理)', 'sales_lin', 'user123', '業務支援部', '(02) 2789-0123 #202', 'xiaohua.lin@acer-info.com.tw', 'USER', 'dashboard,customers,quotations', 'ACTIVE'),
    (4, '張淑芬 (財務會計)', 'finance_wang', 'user123', '財務會計部', '(02) 2789-0123 #301', 'finance@acer-info.com.tw', 'USER', 'quotations,transactions', 'ACTIVE')
    ON CONFLICT (id) DO NOTHING;
    -- 同步所有 SERIAL 主鍵序列至目前最大值，避免主鍵衝突
    SELECT setval(pg_get_serial_sequence('companies', 'id'), COALESCE((SELECT MAX(id) FROM companies), 1), true);
    SELECT setval(pg_get_serial_sequence('customers', 'id'), COALESCE((SELECT MAX(id) FROM customers), 1), true);
    SELECT setval(pg_get_serial_sequence('vendors', 'id'), COALESCE((SELECT MAX(id) FROM vendors), 1), true);
    SELECT setval(pg_get_serial_sequence('products', 'id'), COALESCE((SELECT MAX(id) FROM products), 1), true);
    SELECT setval(pg_get_serial_sequence('quotations', 'id'), COALESCE((SELECT MAX(id) FROM quotations), 1), true);
    SELECT setval(pg_get_serial_sequence('quotation_items', 'id'), COALESCE((SELECT MAX(id) FROM quotation_items), 1), true);
    SELECT setval(pg_get_serial_sequence('transactions', 'id'), COALESCE((SELECT MAX(id) FROM transactions), 1), true);
    SELECT setval(pg_get_serial_sequence('users', 'id'), COALESCE((SELECT MAX(id) FROM users), 1), true);
    """
    with getDbConnection() as conn:
        with conn.cursor() as cur:
            cur.execute(schemaSql)
            cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_tax_id_not_blank ON customers (tax_id) WHERE tax_id IS NOT NULL AND btrim(tax_id) <> '';")
            cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_vendors_tax_id_not_blank ON vendors (tax_id) WHERE tax_id IS NOT NULL AND btrim(tax_id) <> '';")
            cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_products_model_not_blank ON products (model) WHERE model IS NOT NULL AND btrim(model) <> '';")
        conn.commit()
    return True


@app.post("/api/init-db")
def initDatabase(initToken: Optional[str] = Header(None, alias="X-Init-Token")):
    """手動或自動觸發資料庫結構初始化"""
    if not INIT_DB_TOKEN:
        return createApiResponse(
            isSuccess=False,
            message="伺服器未設定 INIT_DB_TOKEN，已拒絕資料庫初始化請求",
            statusCode=status.HTTP_503_SERVICE_UNAVAILABLE
        )
    if not initToken or not secrets.compare_digest(initToken, INIT_DB_TOKEN):
        return createApiResponse(
            isSuccess=False,
            message="資料庫初始化憑證無效",
            statusCode=status.HTTP_403_FORBIDDEN
        )
    try:
        executeInitDb()
        return createApiResponse(
            isSuccess=True,
            data=None,
            message="資料庫 Schema 與初始資料已成功建立/更新！"
        )
    except Exception as err:
        return createApiResponse(
            isSuccess=False,
            data=None,
            message="資料庫初始化失敗",
            errorMessage=str(err),
            statusCode=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@app.get("/api/health")
def checkHealth():
    """健康檢查端點"""
    hasDbConfig = bool(POSTGRES_URL)
    isDbConnected = False
    if hasDbConfig:
        try:
            with getDbConnection() as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT 1;")
                    isDbConnected = True
        except Exception:
            isDbConnected = False

    return createApiResponse(
        isSuccess=True,
        data={
            "status": "healthy",
            "hasDbConfig": hasDbConfig,
            "isDbConnected": isDbConnected,
            "timestamp": datetime.utcnow().isoformat()
        },
        message="服務正常運行中"
    )


# -----------------------------------------------------------------------------
# 6. 使用者認證與登入 API (AUTH ENDPOINTS)
# -----------------------------------------------------------------------------
@app.post("/api/auth/login")
def loginUser(payload: LoginInput):
    autoEnsureSchema()
    if not AUTH_SECRET:
        return createApiResponse(isSuccess=False, message="伺服器未設定 AUTH_SECRET", statusCode=status.HTTP_503_SERVICE_UNAVAILABLE)
    try:
        with getDbConnection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT id, name, username, password, department, phone, email, role, allowed_menus, status
                    FROM users
                    WHERE username = %s;
                """, (payload.username.strip(),))
                user = cur.fetchone()

        if not user:
            return createApiResponse(
                isSuccess=False,
                message="帳號不存在，請確認後重新輸入",
                statusCode=status.HTTP_401_UNAUTHORIZED
            )

        if user["status"] != "ACTIVE":
            return createApiResponse(
                isSuccess=False,
                message="該帳號已被停用，請洽系統管理員",
                statusCode=status.HTTP_403_FORBIDDEN
            )

        if not user.get("password") or not secrets.compare_digest(user["password"], payload.password.strip()):
            return createApiResponse(
                isSuccess=False,
                message="登入密碼不正確，請重新輸入",
                statusCode=status.HTTP_401_UNAUTHORIZED
            )

        userResp = {
            "id": user["id"],
            "name": user["name"],
            "username": user["username"],
            "department": user["department"],
            "phone": user["phone"],
            "email": user["email"],
            "role": user["role"],
            "allowedMenus": user["allowed_menus"].split(",") if user.get("allowed_menus") else [],
            "status": user["status"]
        }
        userResp["accessToken"] = createAccessToken(user)

        return createApiResponse(
            isSuccess=True,
            data=userResp,
            message=f"歡迎回來，{user['name']}！"
        )
    except Exception as err:
        return createApiResponse(
            isSuccess=False,
            message="登入失敗",
            errorMessage=str(err),
            statusCode=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@app.post("/api/auth/logout")
def logoutUser():
    return createApiResponse(isSuccess=True, message="已成功安全登出")


# -----------------------------------------------------------------------------
# 7. 客戶管理 API (CUSTOMERS CRUD)
# -----------------------------------------------------------------------------
@app.get("/api/customers")
def getCustomers(
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100)
):
    autoEnsureSchema()
    try:
        with getDbConnection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                whereClauses = []
                params: List[Any] = []
                if search and search.strip():
                    whereClauses.append("(customer_name ILIKE %s OR customer_code ILIKE %s OR contact_person ILIKE %s OR tax_id ILIKE %s)")
                    s = f"%{search.strip()}%"
                    params.extend([s, s, s, s])

                whereSql = f"WHERE {' AND '.join(whereClauses)}" if whereClauses else ""
                cur.execute(f"SELECT COUNT(*) as total FROM customers {whereSql};", tuple(params))
                totalRow = cur.fetchone()
                totalCount = totalRow["total"] if totalRow else 0

                offset = (page - 1) * limit
                querySql = f"""
                    SELECT id, customer_code as "customerCode", customer_name as "customerName",
                           tax_id as "taxId", contact_person as "contactPerson", email, phone, address,
                           shipping_address as "shippingAddress", payment_terms as "paymentTerms",
                           industry, notes, created_by as "createdBy", updated_by as "updatedBy",
                           created_at::text as "createdAt", updated_at::text as "updatedAt"
                    FROM customers
                    {whereSql}
                    ORDER BY id DESC
                    LIMIT %s OFFSET %s;
                """
                cur.execute(querySql, tuple(params + [limit, offset]))
                rows = cur.fetchall()

        totalPages = math.ceil(totalCount / limit) if totalCount > 0 else 1
        return createApiResponse(
            isSuccess=True,
            data=rows,
            message="取得客戶清單成功",
            pagination={
                "page": page,
                "limit": limit,
                "total": totalCount,
                "totalPages": totalPages,
                "hasNext": page < totalPages,
                "hasPrev": page > 1
            }
        )
    except Exception as err:
        return createApiResponse(isSuccess=False, message="取得客戶清單失敗", errorMessage=str(err), statusCode=500)


@app.get("/api/customers/{customerId}")
def getCustomerById(customerId: int):
    autoEnsureSchema()
    try:
        with getDbConnection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT id, customer_code as "customerCode", customer_name as "customerName",
                           tax_id as "taxId", contact_person as "contactPerson", email, phone, address,
                           shipping_address as "shippingAddress", payment_terms as "paymentTerms",
                           industry, notes, created_by as "createdBy", updated_by as "updatedBy",
                           created_at::text as "createdAt", updated_at::text as "updatedAt"
                    FROM customers WHERE id = %s;
                """, (customerId,))
                customer = cur.fetchone()
        if not customer:
            return createApiResponse(isSuccess=False, message="找不到該客戶", statusCode=404)
        return createApiResponse(isSuccess=True, data=customer, message="成功取得客戶資料")
    except Exception as err:
        return createApiResponse(isSuccess=False, message="取得客戶資料失敗", errorMessage=str(err), statusCode=500)


@app.post("/api/customers")
def createCustomer(payload: CustomerInput):
    autoEnsureSchema()
    try:
        with getDbConnection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                taxId = payload.taxId.strip() if payload.taxId and payload.taxId.strip() else None
                if taxId:
                    cur.execute("SELECT id FROM customers WHERE tax_id = %s;", (taxId,))
                    if cur.fetchone():
                        return createApiResponse(isSuccess=False, message="此客戶統編已存在", statusCode=status.HTTP_409_CONFLICT)
                if payload.customerCode and payload.customerCode.strip():
                    code = payload.customerCode.strip()
                else:
                    cur.execute("SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM customers;")
                    r = cur.fetchone()
                    nid = r["next_id"] if r else 1
                    code = f"CUST-{nid:04d}"
                    cur.execute("SELECT 1 FROM customers WHERE customer_code = %s;", (code,))
                    if cur.fetchone():
                        code = f"CUST-{int(time.time())}"

                cur.execute("""
                    INSERT INTO customers (
                        customer_code, customer_name, tax_id, contact_person, email, phone, address,
                        shipping_address, payment_terms, industry, notes, created_by, updated_by
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id, customer_code as "customerCode", customer_name as "customerName",
                              tax_id as "taxId", contact_person as "contactPerson", email, phone, address,
                              shipping_address as "shippingAddress", payment_terms as "paymentTerms",
                              industry, notes, created_at as "createdAt";
                """, (
                    code, payload.customerName.strip(),
                    taxId,
                    payload.contactPerson.strip() if payload.contactPerson and payload.contactPerson.strip() else None,
                    payload.email.strip() if payload.email and payload.email.strip() else None,
                    payload.phone.strip() if payload.phone and payload.phone.strip() else None,
                    payload.address.strip() if payload.address and payload.address.strip() else None,
                    payload.shippingAddress.strip() if payload.shippingAddress and payload.shippingAddress.strip() else None,
                    payload.paymentTerms.strip() if payload.paymentTerms and payload.paymentTerms.strip() else None,
                    payload.industry.strip() if payload.industry and payload.industry.strip() else None,
                    payload.notes.strip() if payload.notes and payload.notes.strip() else None,
                    payload.createdBy or "系統使用者",
                    payload.updatedBy or "系統使用者"
                ))
                newCust = cur.fetchone()
            conn.commit()

        return createApiResponse(isSuccess=True, data=newCust, message="客戶建立成功", statusCode=201)
    except psycopg2.IntegrityError as err:
        return createApiResponse(isSuccess=False, message="客戶統編或編號已存在", errorMessage="請確認統編與客戶編號", statusCode=status.HTTP_409_CONFLICT)
    except Exception as err:
        return createApiResponse(isSuccess=False, message="建立客戶失敗", errorMessage=str(err), statusCode=500)


@app.put("/api/customers/{customerId}")
def updateCustomer(customerId: int, payload: CustomerInput):
    autoEnsureSchema()
    try:
        with getDbConnection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                taxId = payload.taxId.strip() if payload.taxId and payload.taxId.strip() else None
                if taxId:
                    cur.execute("SELECT id FROM customers WHERE tax_id = %s AND id != %s;", (taxId, customerId))
                    if cur.fetchone():
                        return createApiResponse(isSuccess=False, message="此客戶統編已存在", statusCode=status.HTTP_409_CONFLICT)
                cur.execute("""
                    UPDATE customers
                    SET customer_name = %s,
                        tax_id = %s,
                        contact_person = %s,
                        email = %s,
                        phone = %s,
                        address = %s,
                        shipping_address = %s,
                        payment_terms = %s,
                        industry = %s,
                        notes = %s,
                        updated_by = %s,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = %s
                    RETURNING id, customer_code as "customerCode", customer_name as "customerName",
                              tax_id as "taxId", contact_person as "contactPerson", email, phone, address,
                              shipping_address as "shippingAddress", payment_terms as "paymentTerms",
                              industry, notes, updated_at as "updatedAt";
                """, (
                    payload.customerName.strip(),
                    taxId,
                    payload.contactPerson.strip() if payload.contactPerson else None,
                    payload.email.strip() if payload.email else None,
                    payload.phone.strip() if payload.phone else None,
                    payload.address.strip() if payload.address else None,
                    payload.shippingAddress.strip() if payload.shippingAddress else None,
                    payload.paymentTerms.strip() if payload.paymentTerms else None,
                    payload.industry.strip() if payload.industry else None,
                    payload.notes.strip() if payload.notes else None,
                    payload.updatedBy or "系統使用者",
                    customerId
                ))
                updated = cur.fetchone()
                if not updated:
                    return createApiResponse(isSuccess=False, message="找不到該客戶", statusCode=404)
            conn.commit()

        return createApiResponse(isSuccess=True, data=updated, message="客戶資料更新成功")
    except Exception as err:
        return createApiResponse(isSuccess=False, message="更新客戶失敗", errorMessage=str(err), statusCode=500)


@app.delete("/api/customers/{customerId}")
def deleteCustomer(customerId: int):
    autoEnsureSchema()
    try:
        with getDbConnection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("DELETE FROM customers WHERE id = %s RETURNING id, customer_name;", (customerId,))
                deleted = cur.fetchone()
                if not deleted:
                    return createApiResponse(isSuccess=False, message="找不到該客戶", statusCode=404)
            conn.commit()

        return createApiResponse(isSuccess=True, data={"id": customerId}, message="客戶已成功刪除")
    except Exception as err:
        return createApiResponse(isSuccess=False, message="刪除客戶失敗", errorMessage=str(err), statusCode=500)


# -----------------------------------------------------------------------------
# 8. 供應商/廠商管理 API (VENDORS CRUD)
# -----------------------------------------------------------------------------
@app.get("/api/vendors")
def getVendors(
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100)
):
    autoEnsureSchema()
    try:
        with getDbConnection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                whereClauses = []
                params: List[Any] = []
                if search and search.strip():
                    whereClauses.append("(vendor_name ILIKE %s OR vendor_code ILIKE %s OR contact_person ILIKE %s OR tax_id ILIKE %s)")
                    s = f"%{search.strip()}%"
                    params.extend([s, s, s, s])

                whereSql = f"WHERE {' AND '.join(whereClauses)}" if whereClauses else ""
                cur.execute(f"SELECT COUNT(*) as total FROM vendors {whereSql};", tuple(params))
                totalRow = cur.fetchone()
                totalCount = totalRow["total"] if totalRow else 0

                offset = (page - 1) * limit
                querySql = f"""
                    SELECT id, vendor_code as "vendorCode", vendor_name as "vendorName",
                           tax_id as "taxId", contact_person as "contactPerson", phone, email, address,
                           products_services as "productsServices", notes, created_by as "createdBy", updated_by as "updatedBy",
                           created_at::text as "createdAt", updated_at::text as "updatedAt"
                    FROM vendors
                    {whereSql}
                    ORDER BY id DESC
                    LIMIT %s OFFSET %s;
                """
                cur.execute(querySql, tuple(params + [limit, offset]))
                rows = cur.fetchall()

        totalPages = math.ceil(totalCount / limit) if totalCount > 0 else 1
        return createApiResponse(
            isSuccess=True,
            data=rows,
            message="取得廠商清單成功",
            pagination={
                "page": page,
                "limit": limit,
                "total": totalCount,
                "totalPages": totalPages,
                "hasNext": page < totalPages,
                "hasPrev": page > 1
            }
        )
    except Exception as err:
        return createApiResponse(isSuccess=False, message="取得廠商清單失敗", errorMessage=str(err), statusCode=500)


@app.get("/api/vendors/{vendorId}")
def getVendorById(vendorId: int):
    autoEnsureSchema()
    try:
        with getDbConnection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT id, vendor_code as "vendorCode", vendor_name as "vendorName",
                           tax_id as "taxId", contact_person as "contactPerson", phone, email, address,
                           products_services as "productsServices", notes, created_by as "createdBy", updated_by as "updatedBy",
                           created_at::text as "createdAt", updated_at::text as "updatedAt"
                    FROM vendors WHERE id = %s;
                """, (vendorId,))
                vendor = cur.fetchone()
        if not vendor:
            return createApiResponse(isSuccess=False, message="找不到該廠商", statusCode=404)
        return createApiResponse(isSuccess=True, data=vendor, message="成功取得廠商資料")
    except Exception as err:
        return createApiResponse(isSuccess=False, message="取得廠商資料失敗", errorMessage=str(err), statusCode=500)


@app.post("/api/vendors")
def createVendor(payload: VendorInput):
    autoEnsureSchema()
    try:
        with getDbConnection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                taxId = payload.taxId.strip() if payload.taxId and payload.taxId.strip() else None
                if taxId:
                    cur.execute("SELECT id FROM vendors WHERE tax_id = %s;", (taxId,))
                    if cur.fetchone():
                        return createApiResponse(isSuccess=False, message="此廠商統編已存在", statusCode=status.HTTP_409_CONFLICT)
                if payload.vendorCode and payload.vendorCode.strip():
                    code = payload.vendorCode.strip()
                else:
                    cur.execute("SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM vendors;")
                    r = cur.fetchone()
                    nid = r["next_id"] if r else 1
                    code = f"VEND-{nid:04d}"
                    cur.execute("SELECT 1 FROM vendors WHERE vendor_code = %s;", (code,))
                    if cur.fetchone():
                        code = f"VEND-{int(time.time())}"

                cur.execute("""
                    INSERT INTO vendors (
                        vendor_code, vendor_name, tax_id, contact_person, phone, email, address,
                        products_services, notes, created_by, updated_by
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id, vendor_code as "vendorCode", vendor_name as "vendorName",
                              tax_id as "taxId", contact_person as "contactPerson", phone, email, address,
                              products_services as "productsServices", notes, created_at as "createdAt";
                """, (
                    code, payload.vendorName.strip(),
                    taxId,
                    payload.contactPerson.strip() if payload.contactPerson and payload.contactPerson.strip() else None,
                    payload.phone.strip() if payload.phone and payload.phone.strip() else None,
                    payload.email.strip() if payload.email and payload.email.strip() else None,
                    payload.address.strip() if payload.address and payload.address.strip() else None,
                    payload.productsServices.strip() if payload.productsServices and payload.productsServices.strip() else None,
                    payload.notes.strip() if payload.notes and payload.notes.strip() else None,
                    payload.createdBy or "系統使用者",
                    payload.updatedBy or "系統使用者"
                ))
                newVendor = cur.fetchone()
            conn.commit()

        return createApiResponse(isSuccess=True, data=newVendor, message="廠商建立成功", statusCode=201)
    except psycopg2.IntegrityError as err:
        return createApiResponse(isSuccess=False, message="廠商統編或編號已存在", errorMessage="請確認統編與廠商編號", statusCode=status.HTTP_409_CONFLICT)
    except Exception as err:
        return createApiResponse(isSuccess=False, message="建立廠商失敗", errorMessage=str(err), statusCode=500)


@app.put("/api/vendors/{vendorId}")
def updateVendor(vendorId: int, payload: VendorInput):
    autoEnsureSchema()
    try:
        with getDbConnection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                taxId = payload.taxId.strip() if payload.taxId and payload.taxId.strip() else None
                if taxId:
                    cur.execute("SELECT id FROM vendors WHERE tax_id = %s AND id != %s;", (taxId, vendorId))
                    if cur.fetchone():
                        return createApiResponse(isSuccess=False, message="此廠商統編已存在", statusCode=status.HTTP_409_CONFLICT)
                cur.execute("""
                    UPDATE vendors
                    SET vendor_name = %s,
                        tax_id = %s,
                        contact_person = %s,
                        phone = %s,
                        email = %s,
                        address = %s,
                        products_services = %s,
                        notes = %s,
                        updated_by = %s,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = %s
                    RETURNING id, vendor_code as "vendorCode", vendor_name as "vendorName",
                              tax_id as "taxId", contact_person as "contactPerson", phone, email, address,
                              products_services as "productsServices", notes, updated_at as "updatedAt";
                """, (
                    payload.vendorName.strip(),
                    taxId,
                    payload.contactPerson.strip() if payload.contactPerson else None,
                    payload.phone.strip() if payload.phone else None,
                    payload.email.strip() if payload.email else None,
                    payload.address.strip() if payload.address else None,
                    payload.productsServices.strip() if payload.productsServices else None,
                    payload.notes.strip() if payload.notes else None,
                    payload.updatedBy or "系統使用者",
                    vendorId
                ))
                updated = cur.fetchone()
                if not updated:
                    return createApiResponse(isSuccess=False, message="找不到該廠商", statusCode=404)
            conn.commit()

        return createApiResponse(isSuccess=True, data=updated, message="廠商資料更新成功")
    except Exception as err:
        return createApiResponse(isSuccess=False, message="更新廠商失敗", errorMessage=str(err), statusCode=500)


@app.delete("/api/vendors/{vendorId}")
def deleteVendor(vendorId: int):
    autoEnsureSchema()
    try:
        with getDbConnection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("DELETE FROM vendors WHERE id = %s RETURNING id, vendor_name;", (vendorId,))
                deleted = cur.fetchone()
                if not deleted:
                    return createApiResponse(isSuccess=False, message="找不到該廠商", statusCode=404)
            conn.commit()

        return createApiResponse(isSuccess=True, data={"id": vendorId}, message="廠商已成功刪除")
    except Exception as err:
        return createApiResponse(isSuccess=False, message="刪除廠商失敗", errorMessage=str(err), statusCode=500)


# -----------------------------------------------------------------------------
# 9. 產品管理 API (PRODUCTS CRUD)
# -----------------------------------------------------------------------------
@app.get("/api/products")
def getProducts(
    search: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    statusFilter: Optional[str] = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100)
):
    autoEnsureSchema()
    try:
        with getDbConnection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                whereClauses = []
                params = []
                if search and search.strip():
                    whereClauses.append("(product_name ILIKE %s OR product_code ILIKE %s OR brand ILIKE %s OR model ILIKE %s OR vendor ILIKE %s OR description ILIKE %s)")
                    s = f"%{search.strip()}%"
                    params.extend([s, s, s, s, s, s])
                if category and category.strip():
                    whereClauses.append("category = %s")
                    params.append(category.strip())
                if statusFilter and statusFilter.strip():
                    whereClauses.append("status = %s")
                    params.append(statusFilter.strip())

                whereSql = f"WHERE {' AND '.join(whereClauses)}" if whereClauses else ""
                cur.execute(f"SELECT COUNT(*) as total FROM products {whereSql};", tuple(params))
                totalRow = cur.fetchone()
                totalCount = totalRow["total"] if totalRow else 0

                offset = (page - 1) * limit
                querySql = f"""
                    SELECT id, product_code as "productCode", product_name as "productName",
                           category, brand, model, vendor, vendor_id as "vendorId", unit,
                           unit_price::float as "unitPrice", cost_price::float as "costPrice",
                           stock_quantity as "stockQuantity", image, description, status,
                           created_by as "createdBy", updated_by as "updatedBy",
                           created_at::text as "createdAt", updated_at::text as "updatedAt"
                    FROM products
                    {whereSql}
                    ORDER BY id DESC
                    LIMIT %s OFFSET %s;
                """
                cur.execute(querySql, tuple(params + [limit, offset]))
                rows = cur.fetchall()

        totalPages = math.ceil(totalCount / limit) if totalCount > 0 else 1
        return createApiResponse(
            isSuccess=True,
            data=rows,
            message="取得產品清單成功",
            pagination={
                "page": page,
                "limit": limit,
                "total": totalCount,
                "totalPages": totalPages,
                "hasNext": page < totalPages,
                "hasPrev": page > 1
            }
        )
    except Exception as err:
        return createApiResponse(isSuccess=False, message="取得產品清單失敗", errorMessage=str(err), statusCode=500)


@app.get("/api/products/{productId}")
def getProductById(productId: int):
    autoEnsureSchema()
    try:
        with getDbConnection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT id, product_code as "productCode", product_name as "productName",
                           category, brand, model, vendor, vendor_id as "vendorId", unit,
                           unit_price::float as "unitPrice", cost_price::float as "costPrice",
                           stock_quantity as "stockQuantity", image, description, status,
                           created_by as "createdBy", updated_by as "updatedBy",
                           created_at::text as "createdAt", updated_at::text as "updatedAt"
                    FROM products WHERE id = %s;
                """, (productId,))
                product = cur.fetchone()
        if not product:
            return createApiResponse(isSuccess=False, message="找不到該產品", statusCode=404)
        return createApiResponse(isSuccess=True, data=product, message="成功取得產品資料")
    except Exception as err:
        return createApiResponse(isSuccess=False, message="取得產品資料失敗", errorMessage=str(err), statusCode=500)


@app.post("/api/products")
def createProduct(payload: ProductInput):
    autoEnsureSchema()
    try:
        with getDbConnection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                model = payload.model.strip() if payload.model and payload.model.strip() else None
                if model:
                    cur.execute("SELECT id FROM products WHERE model = %s;", (model,))
                    if cur.fetchone():
                        return createApiResponse(isSuccess=False, message="此產品型號已存在", statusCode=status.HTTP_409_CONFLICT)
                if payload.productCode and payload.productCode.strip():
                    code = payload.productCode.strip()
                else:
                    cur.execute("SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM products;")
                    r = cur.fetchone()
                    nid = r["next_id"] if r else 1
                    code = f"PROD-{nid:04d}"
                    cur.execute("SELECT 1 FROM products WHERE product_code = %s;", (code,))
                    if cur.fetchone():
                        code = f"PROD-{int(time.time())}"

                img = (payload.image or payload.imageUrl or "").strip() or None
                cur.execute("""
                    INSERT INTO products (
                        product_code, product_name, category, brand, model, vendor, vendor_id, unit,
                        unit_price, cost_price, stock_quantity, image, description, status,
                        created_by, updated_by
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id, product_code as "productCode", product_name as "productName",
                              category, brand, model, vendor, vendor_id as "vendorId", unit,
                              unit_price::float as "unitPrice", cost_price::float as "costPrice",
                              stock_quantity as "stockQuantity", image, description, status, created_at as "createdAt";
                """, (
                    code, payload.productName.strip(),
                    payload.category.strip() if payload.category and payload.category.strip() else "一般商品",
                    payload.brand.strip() if payload.brand and payload.brand.strip() else None,
                    model,
                    payload.vendor.strip() if payload.vendor and payload.vendor.strip() else None,
                    payload.vendorId,
                    payload.unit.strip() if payload.unit and payload.unit.strip() else "件",
                    float(payload.unitPrice),
                    float(payload.costPrice or 0),
                    payload.stockQuantity if payload.stockQuantity is not None else 100,
                    img,
                    payload.description.strip() if payload.description and payload.description.strip() else None,
                    payload.status or "ACTIVE",
                    payload.createdBy or "系統使用者",
                    payload.updatedBy or "系統使用者"
                ))
                newProduct = cur.fetchone()
            conn.commit()

        return createApiResponse(isSuccess=True, data=newProduct, message="產品建立成功", statusCode=201)
    except psycopg2.IntegrityError as err:
        return createApiResponse(isSuccess=False, message="產品型號或編號已存在", errorMessage="請確認產品型號與產品編號", statusCode=status.HTTP_409_CONFLICT)
    except Exception as err:
        return createApiResponse(isSuccess=False, message="建立產品失敗", errorMessage=str(err), statusCode=500)


@app.put("/api/products/{productId}")
def updateProduct(productId: int, payload: ProductInput):
    autoEnsureSchema()
    try:
        with getDbConnection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                model = payload.model.strip() if payload.model and payload.model.strip() else None
                if model:
                    cur.execute("SELECT id FROM products WHERE model = %s AND id != %s;", (model, productId))
                    if cur.fetchone():
                        return createApiResponse(isSuccess=False, message="此產品型號已存在", statusCode=status.HTTP_409_CONFLICT)
                img = (payload.image or payload.imageUrl or "").strip() or None
                cur.execute("""
                    UPDATE products
                    SET product_name = %s,
                        category = %s,
                        brand = %s,
                        model = %s,
                        vendor = %s,
                        vendor_id = %s,
                        unit = %s,
                        unit_price = %s,
                        cost_price = %s,
                        stock_quantity = %s,
                        image = %s,
                        description = %s,
                        status = %s,
                        updated_by = %s,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = %s
                    RETURNING id, product_code as "productCode", product_name as "productName",
                              category, brand, model, vendor, vendor_id as "vendorId", unit,
                              unit_price::float as "unitPrice", cost_price::float as "costPrice",
                              stock_quantity as "stockQuantity", image, image as "imageUrl", description, status, updated_at as "updatedAt";
                """, (
                    payload.productName.strip(),
                    payload.category.strip() if payload.category else "一般商品",
                    payload.brand.strip() if payload.brand else None,
                    model,
                    payload.vendor.strip() if payload.vendor else None,
                    payload.vendorId,
                    payload.unit.strip() if payload.unit else "件",
                    float(payload.unitPrice),
                    float(payload.costPrice or 0),
                    payload.stockQuantity if payload.stockQuantity is not None else 100,
                    img,
                    payload.description.strip() if payload.description else None,
                    payload.status or "ACTIVE",
                    payload.updatedBy or "系統使用者",
                    productId
                ))
                updated = cur.fetchone()
                if not updated:
                    return createApiResponse(isSuccess=False, message="找不到該產品", statusCode=404)
            conn.commit()

        return createApiResponse(isSuccess=True, data=updated, message="產品資料更新成功")
    except Exception as err:
        return createApiResponse(isSuccess=False, message="更新產品失敗", errorMessage=str(err), statusCode=500)


@app.delete("/api/products/{productId}")
def deleteProduct(productId: int):
    autoEnsureSchema()
    try:
        with getDbConnection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("DELETE FROM products WHERE id = %s RETURNING id;", (productId,))
                deleted = cur.fetchone()
                if not deleted:
                    return createApiResponse(isSuccess=False, message="找不到該產品", statusCode=404)
            conn.commit()

        return createApiResponse(isSuccess=True, data={"id": productId}, message="產品已成功刪除")
    except Exception as err:
        return createApiResponse(isSuccess=False, message="刪除產品失敗", errorMessage=str(err), statusCode=500)


# -----------------------------------------------------------------------------
# 10. 報價單管理 API (QUOTATIONS CRUD)
# -----------------------------------------------------------------------------
@app.get("/api/quotations")
def getQuotations(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    pageSize: Optional[int] = Query(None, ge=1, le=100),
    search: Optional[str] = Query(None),
    statusFilter: Optional[str] = Query(None, alias="status"),
    legacyStatusFilter: Optional[str] = Query(None, alias="statusFilter")
):
    autoEnsureSchema()
    try:
        # `limit` / `status` 為正式契約；保留舊參數避免既有書籤或外部整合中斷。
        effectiveLimit = pageSize or limit
        effectiveStatus = statusFilter or legacyStatusFilter
        offset = (page - 1) * effectiveLimit
        conditions = []
        params: List[Any] = []

        if search and search.strip():
            s = f"%{search.strip()}%"
            conditions.append("(quotation_number ILIKE %s OR customer_name ILIKE %s OR customer_tax_id ILIKE %s OR customer_contact_person ILIKE %s OR sales_rep ILIKE %s)")
            params.extend([s, s, s, s, s])

        if effectiveStatus and effectiveStatus.strip():
            conditions.append("status = %s")
            params.append(effectiveStatus.strip().upper())

        whereClause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

        with getDbConnection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # 已核准或已拒絕屬於業務終態，不可因日期經過而改寫歷史決策。
                cur.execute("""
                    UPDATE quotations
                    SET status = 'EXPIRED', updated_at = CURRENT_TIMESTAMP
                    WHERE COALESCE(expiry_date, valid_until) < CURRENT_DATE
                      AND status IN ('DRAFT', 'SENT');
                """)
                cur.execute(f"SELECT COUNT(*) as total FROM quotations {whereClause};", tuple(params))
                totalRow = cur.fetchone()
                totalRecords = totalRow["total"] if totalRow else 0

                dataQuery = f"""
                    SELECT 
                        id, quotation_number AS "quotationNumber",
                        company_id AS "companyId", company_name AS "companyName",
                        customer_id AS "customerId", customer_name AS "customerName",
                        customer_tax_id AS "customerTaxId", customer_contact_person AS "customerContactPerson",
                        customer_email AS "customerEmail", customer_phone AS "customerPhone",
                        customer_address AS "customerAddress", shipping_address AS "shippingAddress",
                        payment_terms AS "paymentTerms", sales_rep AS "salesRep",
                        sales_phone AS "salesPhone", sales_email AS "salesEmail",
                        issue_date::text AS "issueDate", expiry_date::text AS "expiryDate",
                        valid_until::text AS "validUntil",
                        status, tax_mode AS "taxMode",
                        subtotal::float AS "subtotal", tax_rate::float AS "taxRate",
                        tax_amount::float AS "taxAmount", discount_amount::float AS "discountAmount",
                        total_amount::float AS "totalAmount", total_cost::float AS "totalCost",
                        estimated_profit::float AS "estimatedProfit", notes,
                        EXISTS (SELECT 1 FROM transactions tx WHERE tx.quotation_id = quotations.id) AS "hasTransaction",
                        created_by AS "createdBy", updated_by AS "updatedBy",
                        created_at::text AS "createdAt", updated_at::text AS "updatedAt"
                    FROM quotations
                    {whereClause}
                    ORDER BY id DESC
                    LIMIT %s OFFSET %s;
                """
                cur.execute(dataQuery, tuple(params + [effectiveLimit, offset]))
                rows = cur.fetchall()
            conn.commit()

        totalPages = math.ceil(totalRecords / effectiveLimit) if totalRecords > 0 else 1
        return createApiResponse(
            isSuccess=True,
            data=rows,
            message="成功取得報價單清單",
            pagination={
                "page": page,
                "limit": effectiveLimit,
                "total": totalRecords,
                "totalPages": totalPages,
                "hasNext": page < totalPages,
                "hasPrev": page > 1
            }
        )
    except Exception as err:
        return createApiResponse(isSuccess=False, message="讀取報價單清單失敗", errorMessage=str(err), statusCode=500)


@app.post("/api/quotations/{quotationId}/revise")
def reviseQuotation(quotationId: int, payload: QuotationRevisionInput, request: Request):
    """拒絕舊報價後，於同一交易內複製一張新的草稿，避免只完成其中一步。"""
    autoEnsureSchema()
    claims = getattr(request.state, "user", {})
    operator = claims.get("name") or "系統使用者"
    try:
        with getDbConnection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("SELECT * FROM quotations WHERE id = %s FOR UPDATE;", (quotationId,))
                original = cur.fetchone()
                if not original:
                    return createApiResponse(isSuccess=False, message="找不到該報價單", statusCode=404)
                if not canManageQuotation(request, original["sales_rep"] or original["created_by"]):
                    return createApiResponse(isSuccess=False, message="只有原報價聯絡窗口或系統管理者可以更改報價單", statusCode=403)

                cur.execute("SELECT 1 FROM transactions WHERE quotation_id = %s LIMIT 1;", (quotationId,))
                if cur.fetchone():
                    return createApiResponse(isSuccess=False, message="已轉為交易單的報價不可更改，請至交易管理處理", statusCode=409)

                revisionPrefix = f"{original['quotation_number']}-R"
                cur.execute("SELECT quotation_number FROM quotations WHERE quotation_number LIKE %s FOR UPDATE;", (f"{revisionPrefix}%",))
                revisionNumbers = [row["quotation_number"] for row in cur.fetchall()]
                revisionIndexes = [int(match.group(1)) for number in revisionNumbers if (match := re.fullmatch(re.escape(revisionPrefix) + r"(\d+)", number))]
                newQuotationNumber = f"{revisionPrefix}{max(revisionIndexes, default=0) + 1}"
                newIssueDate = date.today()
                newExpiryDate = newIssueDate + timedelta(days=30)

                cur.execute("""
                    UPDATE quotations
                    SET status = 'REJECTED', updated_by = %s, updated_at = CURRENT_TIMESTAMP
                    WHERE id = %s;
                """, (operator, quotationId))
                cur.execute("""
                    INSERT INTO quotations (
                        quotation_number, company_id, company_name, customer_id, customer_name,
                        customer_tax_id, customer_contact_person, customer_email, customer_phone,
                        customer_address, shipping_address, payment_terms, sales_rep, sales_phone, sales_email,
                        issue_date, expiry_date, valid_until, status, tax_mode, subtotal, tax_rate, tax_amount,
                        discount_amount, total_amount, total_cost, estimated_profit, notes, created_by, updated_by
                    ) VALUES (
                        %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                        %s, %s, %s, 'DRAFT', %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
                    ) RETURNING id;
                """, (
                    newQuotationNumber, original["company_id"], original["company_name"], original["customer_id"], original["customer_name"],
                    original["customer_tax_id"], original["customer_contact_person"], original["customer_email"], original["customer_phone"],
                    original["customer_address"], original["shipping_address"], original["payment_terms"], original["sales_rep"], original["sales_phone"], original["sales_email"],
                    newIssueDate, newExpiryDate, newExpiryDate, original["tax_mode"], original["subtotal"], original["tax_rate"], original["tax_amount"],
                    original["discount_amount"], original["total_amount"], original["total_cost"], original["estimated_profit"], original["notes"], operator, operator
                ))
                newQuotationId = cur.fetchone()["id"]
                cur.execute("""
                    INSERT INTO quotation_items (
                        quotation_id, product_id, item_number, item_name, specifications, description, unit,
                        quantity, cost_price, unit_price, line_total, subtotal, sort_order, notes
                    )
                    SELECT %s, product_id, item_number, item_name, specifications, description, unit,
                           quantity, cost_price, unit_price, line_total, subtotal, sort_order, notes
                    FROM quotation_items
                    WHERE quotation_id = %s
                    ORDER BY sort_order ASC, id ASC;
                """, (newQuotationId, quotationId))
            conn.commit()

        return createApiResponse(
            isSuccess=True,
            data={"id": newQuotationId, "quotationNumber": newQuotationNumber},
            message=f"已拒絕原報價單並建立新草稿 {newQuotationNumber}",
            statusCode=201
        )
    except Exception as err:
        return createApiResponse(isSuccess=False, message="建立更改版報價單失敗", errorMessage=str(err), statusCode=500)


@app.get("/api/quotations/{quotationId}")
def getQuotationById(quotationId: int):
    autoEnsureSchema()
    try:
        with getDbConnection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT 
                        id, quotation_number AS "quotationNumber",
                        company_id AS "companyId", company_name AS "companyName",
                        customer_id AS "customerId", customer_name AS "customerName",
                        customer_tax_id AS "customerTaxId", customer_contact_person AS "customerContactPerson",
                        customer_email AS "customerEmail", customer_phone AS "customerPhone",
                        customer_address AS "customerAddress", shipping_address AS "shippingAddress",
                        payment_terms AS "paymentTerms", sales_rep AS "salesRep",
                        sales_phone AS "salesPhone", sales_email AS "salesEmail",
                        issue_date::text AS "issueDate", expiry_date::text AS "expiryDate",
                        valid_until::text AS "validUntil",
                        status, tax_mode AS "taxMode",
                        subtotal::float AS "subtotal", tax_rate::float AS "taxRate",
                        tax_amount::float AS "taxAmount", discount_amount::float AS "discountAmount",
                        total_amount::float AS "totalAmount", total_cost::float AS "totalCost",
                        estimated_profit::float AS "estimatedProfit", notes,
                        EXISTS (SELECT 1 FROM transactions tx WHERE tx.quotation_id = quotations.id) AS "hasTransaction",
                        created_by AS "createdBy", updated_by AS "updatedBy",
                        created_at::text AS "createdAt", updated_at::text AS "updatedAt"
                    FROM quotations
                    WHERE id = %s;
                """, (quotationId,))
                quotation = cur.fetchone()

                if not quotation:
                    return createApiResponse(isSuccess=False, message="找不到該報價單", statusCode=404)

                cur.execute("""
                    SELECT 
                        id, quotation_id AS "quotationId", product_id AS "productId",
                        item_number AS "itemNumber", item_name AS "itemName",
                        specifications, description, unit,
                        quantity::float AS "quantity", cost_price::float AS "costPrice",
                        unit_price::float AS "unitPrice", line_total::float AS "lineTotal",
                        subtotal::float AS "subtotal", sort_order AS "sortOrder", notes
                    FROM quotation_items
                    WHERE quotation_id = %s
                    ORDER BY sort_order ASC, id ASC;
                """, (quotationId,))
                quotation["items"] = cur.fetchall()

        return createApiResponse(isSuccess=True, data=quotation, message="成功取得報價單詳細資料")
    except Exception as err:
        return createApiResponse(isSuccess=False, message="讀取報價單明細失敗", errorMessage=str(err), statusCode=500)


@app.post("/api/quotations")
def createQuotation(payload: QuotationInput, request: Request):
    autoEnsureSchema()
    claims = getattr(request.state, "user", {})
    operator = claims.get("name") or "系統使用者"
    try:
        calculatedSubtotal = Decimal("0.00")
        totalCost = Decimal("0.00")
        calculatedItems = []
        for index, item in enumerate(payload.items):
            lineTotal = (item.quantity * item.unitPrice).quantize(Decimal("0.01"))
            lineCost = (item.quantity * (item.costPrice or Decimal("0.00"))).quantize(Decimal("0.01"))
            calculatedSubtotal += lineTotal
            totalCost += lineCost
            calculatedItems.append({
                "productId": item.productId,
                "itemNumber": item.itemNumber or (index + 1),
                "itemName": item.itemName,
                "specifications": item.specifications,
                "description": item.description,
                "unit": item.unit or "件",
                "quantity": item.quantity,
                "costPrice": item.costPrice or Decimal("0.00"),
                "unitPrice": item.unitPrice,
                "lineTotal": lineTotal,
                "subtotal": lineTotal,
                "sortOrder": item.sortOrder if item.sortOrder != 0 else index,
                "notes": item.notes
            })

        taxMode = (payload.taxMode or "EXCLUSIVE").upper()
        taxRate = payload.taxRate or Decimal("5.00")
        discount = payload.discountAmount or Decimal("0.00")
        netSubtotal = max(Decimal("0.00"), calculatedSubtotal - discount)
        
        if taxMode == "INCLUSIVE":
            if payload.totalAmount is not None:
                totalAmount = Decimal(str(payload.totalAmount))
            else:
                totalAmount = netSubtotal
            untaxed = (totalAmount / (Decimal("1.00") + (taxRate / Decimal("100")))).quantize(Decimal("0.01"))
            taxAmount = totalAmount - untaxed
            subtotalDb = untaxed
        elif taxMode == "ZERO":
            taxAmount = Decimal("0.00")
            totalAmount = netSubtotal if payload.totalAmount is None else Decimal(str(payload.totalAmount))
            subtotalDb = netSubtotal
        else:
            # EXCLUSIVE
            subtotalDb = netSubtotal
            taxAmount = (netSubtotal * (taxRate / Decimal("100"))).quantize(Decimal("0.01"))
            totalAmount = netSubtotal + taxAmount if payload.totalAmount is None else Decimal(str(payload.totalAmount))

        estimatedProfit = totalAmount - totalCost

        with getDbConnection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    INSERT INTO quotations (
                        quotation_number, company_id, company_name, customer_id, customer_name,
                        customer_tax_id, customer_contact_person, customer_email, customer_phone,
                        customer_address, shipping_address, payment_terms, sales_rep, sales_phone, sales_email,
                        issue_date, expiry_date, valid_until, status, tax_mode, subtotal, tax_rate, tax_amount,
                        discount_amount, total_amount, total_cost, estimated_profit, notes, created_by, updated_by
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id;
                """, (
                    payload.quotationNumber.strip(),
                    payload.companyId,
                    payload.companyName,
                    payload.customerId,
                    payload.customerName.strip(),
                    payload.customerTaxId,
                    payload.customerContactPerson,
                    payload.customerEmail,
                    payload.customerPhone,
                    payload.customerAddress,
                    payload.shippingAddress,
                    payload.paymentTerms,
                    operator,
                    payload.salesPhone,
                    payload.salesEmail,
                    payload.issueDate,
                    payload.expiryDate or payload.validUntil,
                    payload.validUntil or payload.expiryDate,
                    payload.status or "DRAFT",
                    payload.taxMode or "EXCLUSIVE",
                    float(subtotalDb),
                    float(taxRate),
                    float(taxAmount),
                    float(discount),
                    float(totalAmount),
                    float(totalCost),
                    float(estimatedProfit),
                    payload.notes,
                    operator,
                    operator
                ))
                newId = cur.fetchone()["id"]

                for it in calculatedItems:
                    cur.execute("""
                        INSERT INTO quotation_items (
                            quotation_id, product_id, item_number, item_name, specifications,
                            description, unit, quantity, cost_price, unit_price, line_total, subtotal, sort_order, notes
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
                    """, (
                        newId, it["productId"], it["itemNumber"], it["itemName"],
                        it["specifications"], it["description"], it["unit"],
                        float(it["quantity"]), float(it["costPrice"]), float(it["unitPrice"]),
                        float(it["lineTotal"]), float(it["subtotal"]), it["sortOrder"], it["notes"]
                    ))

            conn.commit()

        return createApiResponse(isSuccess=True, data={"id": newId, "quotationNumber": payload.quotationNumber}, message="報價單建立成功", statusCode=201)
    except Exception as err:
        return createApiResponse(isSuccess=False, message="建立報價單失敗", errorMessage=str(err), statusCode=500)


@app.put("/api/quotations/{quotationId}")
def updateQuotation(quotationId: int, payload: QuotationInput, request: Request):
    autoEnsureSchema()
    claims = getattr(request.state, "user", {})
    operator = claims.get("name") or "系統使用者"
    try:
        calculatedSubtotal = Decimal("0.00")
        totalCost = Decimal("0.00")
        calculatedItems = []
        for index, item in enumerate(payload.items):
            lineTotal = (item.quantity * item.unitPrice).quantize(Decimal("0.01"))
            lineCost = (item.quantity * (item.costPrice or Decimal("0.00"))).quantize(Decimal("0.01"))
            calculatedSubtotal += lineTotal
            totalCost += lineCost
            calculatedItems.append({
                "productId": item.productId,
                "itemNumber": item.itemNumber or (index + 1),
                "itemName": item.itemName,
                "specifications": item.specifications,
                "description": item.description,
                "unit": item.unit or "件",
                "quantity": item.quantity,
                "costPrice": item.costPrice or Decimal("0.00"),
                "unitPrice": item.unitPrice,
                "lineTotal": lineTotal,
                "subtotal": lineTotal,
                "sortOrder": item.sortOrder if item.sortOrder != 0 else index,
                "notes": item.notes
            })

        taxMode = (payload.taxMode or "EXCLUSIVE").upper()
        taxRate = payload.taxRate or Decimal("5.00")
        discount = payload.discountAmount or Decimal("0.00")
        netSubtotal = max(Decimal("0.00"), calculatedSubtotal - discount)
        
        if taxMode == "INCLUSIVE":
            if payload.totalAmount is not None:
                totalAmount = Decimal(str(payload.totalAmount))
            else:
                totalAmount = netSubtotal
            untaxed = (totalAmount / (Decimal("1.00") + (taxRate / Decimal("100")))).quantize(Decimal("0.01"))
            taxAmount = totalAmount - untaxed
            subtotalDb = untaxed
        elif taxMode == "ZERO":
            taxAmount = Decimal("0.00")
            totalAmount = netSubtotal if payload.totalAmount is None else Decimal(str(payload.totalAmount))
            subtotalDb = netSubtotal
        else:
            # EXCLUSIVE
            subtotalDb = netSubtotal
            taxAmount = (netSubtotal * (taxRate / Decimal("100"))).quantize(Decimal("0.01"))
            totalAmount = netSubtotal + taxAmount if payload.totalAmount is None else Decimal(str(payload.totalAmount))

        estimatedProfit = totalAmount - totalCost

        with getDbConnection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("SELECT sales_rep, sales_phone, sales_email, created_by FROM quotations WHERE id = %s FOR UPDATE;", (quotationId,))
                original = cur.fetchone()
                if not original:
                    return createApiResponse(isSuccess=False, message="找不到該報價單", statusCode=404)
                if not canManageQuotation(request, original["sales_rep"] or original["created_by"]):
                    return createApiResponse(isSuccess=False, message="只有原報價聯絡窗口或系統管理者可以編輯報價單", statusCode=403)
                cur.execute("""
                    UPDATE quotations SET
                        quotation_number = %s, company_id = %s, company_name = %s, customer_id = %s, customer_name = %s,
                        customer_tax_id = %s, customer_contact_person = %s, customer_email = %s, customer_phone = %s,
                        customer_address = %s, shipping_address = %s, payment_terms = %s, sales_rep = %s, sales_phone = %s, sales_email = %s,
                        issue_date = %s, expiry_date = %s, valid_until = %s, status = %s, tax_mode = %s,
                        subtotal = %s, tax_rate = %s, tax_amount = %s, discount_amount = %s, total_amount = %s,
                        total_cost = %s, estimated_profit = %s, notes = %s, updated_by = %s, updated_at = CURRENT_TIMESTAMP
                    WHERE id = %s
                    RETURNING id;
                """, (
                    payload.quotationNumber.strip(), payload.companyId, payload.companyName, payload.customerId, payload.customerName.strip(),
                    payload.customerTaxId, payload.customerContactPerson, payload.customerEmail, payload.customerPhone,
                    payload.customerAddress, payload.shippingAddress, payload.paymentTerms, original["sales_rep"], original["sales_phone"], original["sales_email"],
                    payload.issueDate, payload.expiryDate or payload.validUntil, payload.validUntil or payload.expiryDate,
                    payload.status or "DRAFT", payload.taxMode or "EXCLUSIVE",
                    float(subtotalDb), float(taxRate), float(taxAmount), float(discount), float(totalAmount),
                    float(totalCost), float(estimatedProfit), payload.notes, operator, quotationId
                ))
                if not cur.fetchone():
                    return createApiResponse(isSuccess=False, message="找不到該報價單", statusCode=404)

                cur.execute("DELETE FROM quotation_items WHERE quotation_id = %s;", (quotationId,))
                for it in calculatedItems:
                    cur.execute("""
                        INSERT INTO quotation_items (
                            quotation_id, product_id, item_number, item_name, specifications,
                            description, unit, quantity, cost_price, unit_price, line_total, subtotal, sort_order, notes
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
                    """, (
                        quotationId, it["productId"], it["itemNumber"], it["itemName"],
                        it["specifications"], it["description"], it["unit"],
                        float(it["quantity"]), float(it["costPrice"]), float(it["unitPrice"]),
                        float(it["lineTotal"]), float(it["subtotal"]), it["sortOrder"], it["notes"]
                    ))

            conn.commit()

        return createApiResponse(isSuccess=True, data={"id": quotationId}, message="報價單更新成功")
    except Exception as err:
        return createApiResponse(isSuccess=False, message="更新報價單失敗", errorMessage=str(err), statusCode=500)


@app.delete("/api/quotations/{quotationId}")
def deleteQuotation(quotationId: int, request: Request):
    autoEnsureSchema()
    try:
        with getDbConnection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("SELECT sales_rep, created_by FROM quotations WHERE id = %s FOR UPDATE;", (quotationId,))
                original = cur.fetchone()
                if not original:
                    return createApiResponse(isSuccess=False, message="找不到該報價單", statusCode=404)
                if not canManageQuotation(request, original["sales_rep"] or original["created_by"]):
                    return createApiResponse(isSuccess=False, message="只有原報價聯絡窗口或系統管理者可以刪除報價單", statusCode=403)
                cur.execute("DELETE FROM quotations WHERE id = %s RETURNING id, quotation_number;", (quotationId,))
                deleted = cur.fetchone()
                if not deleted:
                    return createApiResponse(isSuccess=False, message="找不到該報價單", statusCode=404)
            conn.commit()

        return createApiResponse(isSuccess=True, data={"id": quotationId}, message="報價單已成功刪除")
    except Exception as err:
        return createApiResponse(isSuccess=False, message="刪除報價單失敗", errorMessage=str(err), statusCode=500)


# -----------------------------------------------------------------------------
# 11. 交易管理 API (TRANSACTIONS CRUD)
# -----------------------------------------------------------------------------
@app.get("/api/transactions")
def getTransactions(
    search: Optional[str] = Query(None),
    paymentStatus: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100)
):
    autoEnsureSchema()
    try:
        with getDbConnection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                whereClauses = []
                params = []
                if search and search.strip():
                    whereClauses.append("(transaction_number ILIKE %s OR customer_name ILIKE %s OR quotation_number ILIKE %s)")
                    s = f"%{search.strip()}%"
                    params.extend([s, s, s])
                if paymentStatus and paymentStatus.strip():
                    whereClauses.append("payment_status = %s")
                    params.append(paymentStatus.strip())

                whereSql = f"WHERE {' AND '.join(whereClauses)}" if whereClauses else ""
                cur.execute(f"SELECT COUNT(*) as total FROM transactions {whereSql};", tuple(params))
                totalRow = cur.fetchone()
                totalCount = totalRow["total"] if totalRow else 0

                offset = (page - 1) * limit
                querySql = f"""
                    SELECT id, transaction_number as "transactionNumber",
                           quotation_id as "quotationId", quotation_number as "quotationNumber",
                           customer_name as "customerName", customer_email as "customerEmail",
                           transaction_date::text as "transactionDate", 
                           total_amount::float as "totalAmount",
                           COALESCE(cost_price, 0.00)::float as "costPrice",
                           COALESCE(paid_amount, 0.00)::float as "paidAmount",
                           payment_method as "paymentMethod", payment_status as "paymentStatus",
                           fulfillment_status as "fulfillmentStatus", notes,
                           created_by as "createdBy", updated_by as "updatedBy",
                           created_at::text as "createdAt", updated_at::text as "updatedAt"
                    FROM transactions
                    {whereSql}
                    ORDER BY id DESC
                    LIMIT %s OFFSET %s;
                """
                cur.execute(querySql, tuple(params + [limit, offset]))
                rows = cur.fetchall()

                for tx in rows:
                    cur.execute("""
                        SELECT id, invoice_number as "invoiceNumber", invoice_date::text as "invoiceDate",
                               amount::float as "amount", status, notes,
                               created_by as "createdBy", updated_by as "updatedBy",
                               created_at::text as "createdAt", updated_at::text as "updatedAt"
                        FROM transaction_invoices
                        WHERE transaction_id = %s
                        ORDER BY id ASC;
                    """, (tx["id"],))
                    tx["invoices"] = cur.fetchall()
                    tot = float(tx.get("totalAmount") or 0)
                    cost = float(tx.get("costPrice") or 0)
                    paid = float(tx.get("paidAmount") or 0)
                    tx["remainingAmount"] = max(0.0, tot - paid)
                    tx["grossProfit"] = tot - cost
                    tx["grossMargin"] = round((tx["grossProfit"] / tot * 100), 1) if tot > 0 else 0.0

        totalPages = math.ceil(totalCount / limit) if totalCount > 0 else 1
        return createApiResponse(
            isSuccess=True,
            data=rows,
            message="取得交易清單成功",
            pagination={
                "page": page,
                "limit": limit,
                "total": totalCount,
                "totalPages": totalPages,
                "hasNext": page < totalPages,
                "hasPrev": page > 1
            }
        )
    except Exception as err:
        return createApiResponse(isSuccess=False, message="取得交易清單失敗", errorMessage=str(err), statusCode=500)


@app.get("/api/transactions/{txId}")
def getTransactionById(txId: int):
    autoEnsureSchema()
    try:
        with getDbConnection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT id, transaction_number as "transactionNumber", quotation_id as "quotationId",
                           quotation_number as "quotationNumber", customer_name as "customerName",
                           customer_email as "customerEmail", transaction_date::text as "transactionDate",
                           total_amount::float as "totalAmount", COALESCE(cost_price, 0.00)::float as "costPrice",
                           COALESCE(paid_amount, 0.00)::float as "paidAmount", payment_method as "paymentMethod",
                           payment_status as "paymentStatus", fulfillment_status as "fulfillmentStatus", notes,
                           created_by as "createdBy", updated_by as "updatedBy",
                           created_at::text as "createdAt", updated_at::text as "updatedAt"
                    FROM transactions WHERE id = %s;
                """, (txId,))
                transaction = cur.fetchone()
                if not transaction:
                    return createApiResponse(isSuccess=False, message="找不到該交易記錄", statusCode=404)
                cur.execute("""
                    SELECT id, invoice_number as "invoiceNumber", invoice_date::text as "invoiceDate",
                           amount::float as "amount", status, notes, created_by as "createdBy",
                           updated_by as "updatedBy", created_at::text as "createdAt", updated_at::text as "updatedAt"
                    FROM transaction_invoices WHERE transaction_id = %s ORDER BY id ASC;
                """, (txId,))
                transaction["invoices"] = cur.fetchall()
        return createApiResponse(isSuccess=True, data=transaction, message="成功取得交易資料")
    except Exception as err:
        return createApiResponse(isSuccess=False, message="取得交易資料失敗", errorMessage=str(err), statusCode=500)


@app.post("/api/transactions")
def createTransaction(payload: TransactionInput):
    autoEnsureSchema()
    try:
        txNumber = payload.transactionNumber or f"TX-{date.today().strftime('%Y%m%d')}-{uuid4().hex[:10].upper()}"
        creator = payload.createdBy or "系統使用者"
        updater = payload.updatedBy or creator

        with getDbConnection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    INSERT INTO transactions (
                        transaction_number, quotation_id, quotation_number, customer_name,
                        customer_email, transaction_date, total_amount, cost_price, paid_amount,
                        payment_method, payment_status, fulfillment_status, notes,
                        created_by, updated_by
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id, transaction_number as "transactionNumber", total_amount as "totalAmount",
                              cost_price as "costPrice", paid_amount as "paidAmount",
                              payment_status as "paymentStatus", fulfillment_status as "fulfillmentStatus";
                """, (
                    txNumber, payload.quotationId, payload.quotationNumber,
                    payload.customerName.strip(), payload.customerEmail,
                    payload.transactionDate, float(payload.totalAmount),
                    float(payload.costPrice or 0), float(payload.paidAmount or 0),
                    payload.paymentMethod or "電匯 (Wire Transfer)",
                    payload.paymentStatus or "PENDING",
                    payload.fulfillmentStatus or "PROCESSING",
                    payload.notes, creator, updater
                ))
                newTx = cur.fetchone()
                txId = newTx["id"]

                if payload.invoices:
                    for inv in payload.invoices:
                        cur.execute("""
                            INSERT INTO transaction_invoices (
                                transaction_id, invoice_number, invoice_date, amount, status, notes, created_by, updated_by
                            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s);
                        """, (
                            txId, inv.invoiceNumber.strip(), inv.invoiceDate, float(inv.amount),
                            inv.status or "PENDING", inv.notes, creator, updater
                        ))
            conn.commit()

        return createApiResponse(isSuccess=True, data=newTx, message="交易記錄建立成功", statusCode=201)
    except Exception as err:
        return createApiResponse(isSuccess=False, message="建立交易失敗", errorMessage=str(err), statusCode=500)


@app.post("/api/transactions/from-quotation/{quotationId}")
def convertQuotationToTransaction(quotationId: int, request: Request):
    autoEnsureSchema()
    try:
        with getDbConnection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("SELECT * FROM quotations WHERE id = %s;", (quotationId,))
                q = cur.fetchone()
                if not q:
                    return createApiResponse(isSuccess=False, message="找不到指定的報價單", statusCode=404)
                if not canManageQuotation(request, q.get("sales_rep") or q.get("created_by")):
                    return createApiResponse(isSuccess=False, message="只有原報價聯絡窗口或系統管理者可以轉為交易單", statusCode=403)

                if q["status"] != "ACCEPTED":
                    return createApiResponse(
                        isSuccess=False,
                        message="只有已核准的報價單可以轉為交易單",
                        statusCode=status.HTTP_409_CONFLICT
                    )

                cur.execute("SELECT id FROM transactions WHERE quotation_id = %s LIMIT 1;", (quotationId,))
                if cur.fetchone():
                    return createApiResponse(
                        isSuccess=False,
                        message="此報價單已轉為交易，請至交易管理查看",
                        statusCode=status.HTTP_409_CONFLICT
                    )

                cur.execute("""
                    SELECT qi.quantity, COALESCE(qi.cost_price, p.cost_price, 0.00) as cost_price
                    FROM quotation_items qi
                    LEFT JOIN products p ON qi.product_id = p.id
                    WHERE qi.quotation_id = %s;
                """, (quotationId,))
                items = cur.fetchall()
                if items:
                    totalCost = sum(float(it["quantity"]) * float(it["cost_price"]) for it in items)
                else:
                    totalCost = float(q.get("total_cost") or 0.0)

                operator = getattr(request.state, "user", {}).get("name") or "系統使用者"

                txNumber = f"TX-{date.today().strftime('%Y%m%d')}-{uuid4().hex[:10].upper()}"
                cur.execute("""
                    INSERT INTO transactions (
                        transaction_number, quotation_id, quotation_number, customer_name,
                        customer_email, transaction_date, total_amount, cost_price, paid_amount,
                        payment_method, payment_status, fulfillment_status, notes,
                        created_by, updated_by
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id, transaction_number as "transactionNumber";
                """, (
                    txNumber, quotationId, q["quotation_number"], q["customer_name"],
                    q.get("customer_email"), date.today(), float(q["total_amount"]),
                    float(totalCost), 0.0, "電匯 (Wire Transfer)", "PENDING", "PROCESSING",
                    f"由報價單 {q['quotation_number']} 自動結案轉入交易", operator, operator
                ))
                newTx = cur.fetchone()
            conn.commit()

        return createApiResponse(isSuccess=True, data=newTx, message=f"報價單 {q['quotation_number']} 已成功轉為正式交易！")
    except Exception as err:
        return createApiResponse(isSuccess=False, message="轉為交易失敗", errorMessage=str(err), statusCode=500)


@app.put("/api/transactions/{txId}")
def updateTransaction(txId: int, payload: TransactionInput):
    autoEnsureSchema()
    try:
        updater = payload.updatedBy or "系統使用者"
        with getDbConnection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    UPDATE transactions
                    SET customer_name = %s, customer_email = %s, transaction_date = %s,
                        total_amount = %s, cost_price = %s, paid_amount = %s,
                        payment_method = %s, payment_status = %s, fulfillment_status = %s,
                        notes = %s, updated_by = %s, updated_at = CURRENT_TIMESTAMP
                    WHERE id = %s
                    RETURNING id, transaction_number as "transactionNumber";
                """, (
                    payload.customerName.strip(), payload.customerEmail, payload.transactionDate,
                    float(payload.totalAmount), float(payload.costPrice or 0), float(payload.paidAmount or 0),
                    payload.paymentMethod or "電匯 (Wire Transfer)", payload.paymentStatus or "PENDING",
                    payload.fulfillmentStatus or "PROCESSING", payload.notes, updater, txId
                ))
                updated = cur.fetchone()
                if not updated:
                    return createApiResponse(isSuccess=False, message="找不到該交易記錄", statusCode=404)

                cur.execute("DELETE FROM transaction_invoices WHERE transaction_id = %s;", (txId,))
                if payload.invoices:
                    for inv in payload.invoices:
                        cur.execute("""
                            INSERT INTO transaction_invoices (
                                transaction_id, invoice_number, invoice_date, amount, status, notes, created_by, updated_by
                            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s);
                        """, (
                            txId, inv.invoiceNumber.strip(), inv.invoiceDate, float(inv.amount),
                            inv.status or "PENDING", inv.notes, updater, updater
                        ))
            conn.commit()

        return createApiResponse(isSuccess=True, data=updated, message="交易資料更新成功")
    except Exception as err:
        return createApiResponse(isSuccess=False, message="更新交易失敗", errorMessage=str(err), statusCode=500)


@app.delete("/api/transactions/{txId}")
def deleteTransaction(txId: int):
    autoEnsureSchema()
    try:
        with getDbConnection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("DELETE FROM transactions WHERE id = %s RETURNING id;", (txId,))
                deleted = cur.fetchone()
                if not deleted:
                    return createApiResponse(isSuccess=False, message="找不到該交易記錄", statusCode=404)
            conn.commit()

        return createApiResponse(isSuccess=True, data={"id": txId}, message="交易記錄已刪除")
    except Exception as err:
        return createApiResponse(isSuccess=False, message="刪除交易失敗", errorMessage=str(err), statusCode=500)


# -----------------------------------------------------------------------------
# 12. 報價公司基本資料管理 API (COMPANIES CRUD)
# -----------------------------------------------------------------------------
@app.get("/api/companies")
def listCompanies():
    autoEnsureSchema()
    try:
        with getDbConnection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT id, company_name as "companyName", tax_id as "taxId", phone, fax, address,
                           email, website, bank_name as "bankName", bank_account as "bankAccount",
                           bank_account_name as "bankAccountName", contact_person as "contactPerson",
                           contact_phone as "contactPhone", contact_email as "contactEmail",
                           is_default as "isDefault", logo_url as "logoUrl", default_terms as "defaultTerms",
                           created_by as "createdBy", updated_by as "updatedBy",
                           created_at::text as "createdAt", updated_at::text as "updatedAt"
                    FROM companies
                    ORDER BY id ASC;
                """)
                rows = cur.fetchall()

        return createApiResponse(isSuccess=True, data=rows, message="取得公司清單成功")
    except Exception as err:
        return createApiResponse(isSuccess=False, message="取得公司清單失敗", errorMessage=str(err), statusCode=500)


@app.get("/api/companies/{companyId}")
def getCompanyById(companyId: int):
    autoEnsureSchema()
    try:
        with getDbConnection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT id, company_name as "companyName", tax_id as "taxId", phone, fax, address,
                           email, website, bank_name as "bankName", bank_account as "bankAccount",
                           bank_account_name as "bankAccountName", contact_person as "contactPerson",
                           contact_phone as "contactPhone", contact_email as "contactEmail",
                           is_default as "isDefault", logo_url as "logoUrl", default_terms as "defaultTerms",
                           created_by as "createdBy", updated_by as "updatedBy",
                           created_at::text as "createdAt", updated_at::text as "updatedAt"
                    FROM companies WHERE id = %s;
                """, (companyId,))
                company = cur.fetchone()
        if not company:
            return createApiResponse(isSuccess=False, message="找不到該公司資料", statusCode=404)
        return createApiResponse(isSuccess=True, data=company, message="成功取得公司資料")
    except Exception as err:
        return createApiResponse(isSuccess=False, message="取得公司資料失敗", errorMessage=str(err), statusCode=500)


@app.get("/api/company")
def getSingleCompany():
    autoEnsureSchema()
    try:
        with getDbConnection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("SELECT * FROM companies WHERE is_default = TRUE LIMIT 1;")
                row = cur.fetchone()
                if not row:
                    cur.execute("SELECT * FROM companies ORDER BY id ASC LIMIT 1;")
                    row = cur.fetchone()

        if not row:
            return createApiResponse(isSuccess=False, message="尚未建立公司資料", statusCode=404)

        data = {
            "id": row["id"],
            "companyName": row["company_name"],
            "taxId": row["tax_id"],
            "phone": row["phone"],
            "fax": row["fax"],
            "address": row["address"],
            "email": row["email"],
            "website": row["website"],
            "bankName": row["bank_name"],
            "bankAccount": row["bank_account"],
            "bankAccountName": row["bank_account_name"],
            "defaultTerms": row["default_terms"]
        }
        return createApiResponse(isSuccess=True, data=data, message="取得公司基本資料成功")
    except Exception as err:
        return createApiResponse(isSuccess=False, message="取得公司資料失敗", errorMessage=str(err), statusCode=500)


@app.post("/api/companies")
def createCompany(payload: CompanyInput):
    autoEnsureSchema()
    try:
        with getDbConnection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                if payload.isDefault:
                    cur.execute("UPDATE companies SET is_default = FALSE;")

                cur.execute("""
                    INSERT INTO companies (
                        company_name, tax_id, phone, fax, address, email, website,
                        bank_name, bank_account, bank_account_name, contact_person, contact_phone,
                        contact_email, is_default, logo_url, default_terms, created_by, updated_by
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id, company_name as "companyName", is_default as "isDefault";
                """, (
                    payload.companyName.strip(), payload.taxId, payload.phone, payload.fax,
                    payload.address, payload.email, payload.website, payload.bankName,
                    payload.bankAccount, payload.bankAccountName, payload.contactPerson,
                    payload.contactPhone, payload.contactEmail, payload.isDefault or False,
                    payload.logoUrl, payload.defaultTerms,
                    payload.createdBy or "系統使用者", payload.updatedBy or "系統使用者"
                ))
                newComp = cur.fetchone()
            conn.commit()

        return createApiResponse(isSuccess=True, data=newComp, message="公司資料建立成功", statusCode=201)
    except Exception as err:
        return createApiResponse(isSuccess=False, message="建立公司失敗", errorMessage=str(err), statusCode=500)


@app.put("/api/companies/{companyId}")
def updateCompany(companyId: int, payload: CompanyInput):
    autoEnsureSchema()
    try:
        with getDbConnection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                if payload.isDefault:
                    cur.execute("UPDATE companies SET is_default = FALSE WHERE id != %s;", (companyId,))

                cur.execute("""
                    UPDATE companies
                    SET company_name = %s, tax_id = %s, phone = %s, fax = %s, address = %s,
                        email = %s, website = %s, bank_name = %s, bank_account = %s,
                        bank_account_name = %s, contact_person = %s, contact_phone = %s,
                        contact_email = %s, is_default = %s, logo_url = %s, default_terms = %s,
                        updated_by = %s, updated_at = CURRENT_TIMESTAMP
                    WHERE id = %s
                    RETURNING id, company_name as "companyName", is_default as "isDefault";
                """, (
                    payload.companyName.strip(), payload.taxId, payload.phone, payload.fax,
                    payload.address, payload.email, payload.website, payload.bankName,
                    payload.bankAccount, payload.bankAccountName, payload.contactPerson,
                    payload.contactPhone, payload.contactEmail, payload.isDefault or False,
                    payload.logoUrl, payload.defaultTerms,
                    payload.updatedBy or "系統使用者", companyId
                ))
                updated = cur.fetchone()
                if not updated:
                    return createApiResponse(isSuccess=False, message="找不到該公司資料", statusCode=404)
            conn.commit()

        return createApiResponse(isSuccess=True, data=updated, message="公司資料更新成功")
    except Exception as err:
        return createApiResponse(isSuccess=False, message="更新公司資料失敗", errorMessage=str(err), statusCode=500)


@app.delete("/api/companies/{companyId}")
def deleteCompany(companyId: int):
    autoEnsureSchema()
    try:
        with getDbConnection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("DELETE FROM companies WHERE id = %s RETURNING id, company_name;", (companyId,))
                deleted = cur.fetchone()
                if not deleted:
                    return createApiResponse(isSuccess=False, message="找不到該公司資料", statusCode=404)
            conn.commit()

        return createApiResponse(isSuccess=True, data={"id": companyId}, message="公司資料已刪除")
    except Exception as err:
        return createApiResponse(isSuccess=False, message="刪除公司失敗", errorMessage=str(err), statusCode=500)


# -----------------------------------------------------------------------------
# 13. 系統使用者管理 API (USERS CRUD)
# -----------------------------------------------------------------------------
@app.get("/api/users")
def listUsers():
    autoEnsureSchema()
    try:
        with getDbConnection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("SELECT id, name, username, department, phone, email, role, allowed_menus, status, created_at, updated_at FROM users ORDER BY id ASC;")
                rows = cur.fetchall()

        usersList = []
        for r in rows:
            usersList.append({
                "id": r["id"],
                "name": r["name"],
                "username": r["username"],
                "department": r["department"],
                "phone": r["phone"],
                "email": r["email"],
                "role": r["role"],
                "allowedMenus": r["allowed_menus"].split(",") if r.get("allowed_menus") else [],
                "status": r["status"],
                "createdAt": r["created_at"].isoformat() if r.get("created_at") else None,
                "updatedAt": r["updated_at"].isoformat() if r.get("updated_at") else None
            })

        return createApiResponse(isSuccess=True, data=usersList, message="成功取得使用者清單")
    except Exception as err:
        return createApiResponse(isSuccess=False, message="取得使用者清單失敗", errorMessage=str(err), statusCode=500)


@app.post("/api/users")
def createUser(payload: UserInput):
    autoEnsureSchema()
    try:
        with getDbConnection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("SELECT id FROM users WHERE username = %s;", (payload.username,))
                if cur.fetchone():
                    return createApiResponse(isSuccess=False, message="該帳號已被使用，請更換帳號", statusCode=400)

                cur.execute("""
                    INSERT INTO users (name, username, password, department, phone, email, role, allowed_menus, status, created_by, updated_by)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id, name, username, role;
                """, (
                    payload.name, payload.username, payload.password or "admin888",
                    payload.department, payload.phone, payload.email,
                    payload.role, payload.allowedMenus, payload.status or "ACTIVE",
                    payload.createdBy or "系統使用者", payload.updatedBy or "系統使用者"
                ))
                newRow = cur.fetchone()
            conn.commit()

        return createApiResponse(isSuccess=True, data=newRow, message="使用者建立成功", statusCode=201)
    except Exception as err:
        return createApiResponse(isSuccess=False, message="建立使用者失敗", errorMessage=str(err), statusCode=500)


@app.put("/api/users/{userId}")
def updateUser(userId: int, payload: UserInput):
    autoEnsureSchema()
    try:
        with getDbConnection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                if payload.password and payload.password.strip():
                    cur.execute("""
                        UPDATE users
                        SET name = %s, department = %s, phone = %s, email = %s,
                            role = %s, allowed_menus = %s, status = %s, password = %s,
                            updated_by = %s, updated_at = CURRENT_TIMESTAMP
                        WHERE id = %s
                        RETURNING id, name, username;
                    """, (
                        payload.name, payload.department, payload.phone, payload.email,
                        payload.role, payload.allowedMenus, payload.status, payload.password,
                        payload.updatedBy or "系統使用者", userId
                    ))
                else:
                    cur.execute("""
                        UPDATE users
                        SET name = %s, department = %s, phone = %s, email = %s,
                            role = %s, allowed_menus = %s, status = %s,
                            updated_by = %s, updated_at = CURRENT_TIMESTAMP
                        WHERE id = %s
                        RETURNING id, name, username;
                    """, (
                        payload.name, payload.department, payload.phone, payload.email,
                        payload.role, payload.allowedMenus, payload.status,
                        payload.updatedBy or "系統使用者", userId
                    ))
                updatedRow = cur.fetchone()
                if not updatedRow:
                    return createApiResponse(isSuccess=False, message="找不到該使用者", statusCode=404)
            conn.commit()

        return createApiResponse(isSuccess=True, data=updatedRow, message="使用者資訊已更新")
    except Exception as err:
        return createApiResponse(isSuccess=False, message="更新使用者失敗", errorMessage=str(err), statusCode=500)


@app.delete("/api/users/{userId}")
def deleteUser(userId: int):
    autoEnsureSchema()
    try:
        if userId == 1:
            return createApiResponse(isSuccess=False, message="系統預設管理員 (ID: 1) 不得刪除", statusCode=400)

        with getDbConnection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("DELETE FROM users WHERE id = %s RETURNING id, name;", (userId,))
                deleted = cur.fetchone()
                if not deleted:
                    return createApiResponse(isSuccess=False, message="找不到該使用者", statusCode=404)
            conn.commit()

        return createApiResponse(isSuccess=True, data={"id": userId, "name": deleted["name"]}, message="使用者已成功刪除")
    except Exception as err:
        return createApiResponse(isSuccess=False, message="刪除使用者失敗", errorMessage=str(err), statusCode=500)


# -----------------------------------------------------------------------------
# 14. 統計指標與審計日誌 API (METRICS & AUDIT LOGS)
# -----------------------------------------------------------------------------
@app.get("/api/metrics")
def getMetrics():
    autoEnsureSchema()
    try:
        currentYear = date.today().year
        with getDbConnection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("SELECT COUNT(*) as count FROM customers;")
                customerCount = cur.fetchone()["count"]

                cur.execute("SELECT COUNT(*) as count FROM products WHERE status = 'ACTIVE';")
                productCount = cur.fetchone()["count"]

                cur.execute("""
                    SELECT COUNT(*) as count, COALESCE(SUM(total_amount), 0) as total
                    FROM quotations
                    WHERE EXTRACT(YEAR FROM issue_date) = %s;
                """, (currentYear,))
                qRow = cur.fetchone()
                quotationCount = qRow["count"]
                quotationTotal = qRow["total"]

                cur.execute("""
                    SELECT status, COUNT(*) as count
                    FROM quotations
                    WHERE EXTRACT(YEAR FROM issue_date) = %s
                    GROUP BY status;
                """, (currentYear,))
                statusRows = cur.fetchall()
                statusCounts = {
                    "DRAFT": 0, "SENT": 0, "ACCEPTED": 0, "REJECTED": 0, "EXPIRED": 0
                }
                for sRow in statusRows:
                    if sRow["status"] in statusCounts:
                        statusCounts[sRow["status"]] = sRow["count"]

                cur.execute("""
                    SELECT COUNT(*) as count,
                           COALESCE(SUM(total_amount), 0) as revenue,
                           COALESCE(SUM(total_amount - cost_price), 0) as profit
                    FROM transactions
                    WHERE payment_status = 'PAID'
                      AND EXTRACT(YEAR FROM transaction_date) = %s;
                """, (currentYear,))
                txRow = cur.fetchone()
                transactionCount = txRow["count"]
                totalRevenue = txRow["revenue"]
                closedProfit = txRow["profit"]
                closedMargin = (closedProfit / totalRevenue * 100) if totalRevenue else 0

        return createApiResponse(
            isSuccess=True,
            data={
                "customersCount": customerCount,
                "productsCount": productCount,
                "currentYear": currentYear,
                "yearQuotationCount": quotationCount,
                "yearQuotationTotal": float(quotationTotal),
                "yearRevenue": float(totalRevenue),
                "closedProfit": float(closedProfit),
                "closedMargin": float(closedMargin),
                "transactionsCount": transactionCount,
                # 保留舊欄位，避免外部整合尚未更新時中斷。
                "quotationsCount": quotationCount,
                "quotationsTotal": float(quotationTotal),
                "totalRevenue": float(totalRevenue),
                "statusCounts": statusCounts
            },
            message="取得系統統計指標成功"
        )
    except Exception as err:
        return createApiResponse(isSuccess=False, message="取得指標失敗", errorMessage=str(err), statusCode=500)


@app.get("/api/audit-logs")
@app.get("/api/audit_logs")
def getAuditLogs(
    module: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=100)
):
    autoEnsureSchema()
    try:
        with getDbConnection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                whereClause = "WHERE module = %s" if module else ""
                params = (module,) if module else ()
                cur.execute(f"""
                    SELECT id, module, module_title as "moduleTitle", action_type as "actionType",
                           action_title as "actionTitle", target_id as "targetId", target_name as "targetName",
                           operator, details, ip_address as "ipAddress", created_at::text as "createdAt"
                    FROM audit_logs
                    {whereClause}
                    ORDER BY id DESC
                    LIMIT %s;
                """, params + (limit,))
                rows = cur.fetchall()

        return createApiResponse(isSuccess=True, data=rows, message="取得操作歷程成功")
    except Exception as err:
        return createApiResponse(isSuccess=False, message="取得歷程失敗", errorMessage=str(err), statusCode=500)
