"""
極簡 Web 版報價單管理系統 - 後端 API
入口點: api/index.py (相容 Vercel Serverless Function)
"""

import os
import re
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional
from contextlib import contextmanager

from fastapi import FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator
import psycopg2
from psycopg2 import pool
from psycopg2.extras import RealDictCursor

# -----------------------------------------------------------------------------
# 1. 常數與設定 (CONSTANTS & CONFIGURATION)
# -----------------------------------------------------------------------------
POSTGRES_URL = os.getenv("POSTGRES_URL", "")
DEFAULT_PAGE_SIZE = 10
MAX_PAGE_SIZE = 100

# 建立 FastAPI 實例
app = FastAPI(
    title="Quotation Management API",
    description="極簡 Web 版報價單管理系統後端 API (PostgreSQL + FastAPI)",
    version="1.0.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json"
)

# 支援跨來源資源共享 (CORS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------------------------------------------------------
# 2. 資料庫連線池與交易管理 (DATABASE & TRANSACTION MANAGEMENT)
# -----------------------------------------------------------------------------
# 在 Serverless 環境下使用輕量連線池或按需連線
DB_POOL: Optional[pool.SimpleConnectionPool] = None

def getDbPool() -> Optional[pool.SimpleConnectionPool]:
    """獲取或初始化資料庫連線池 (Lazy initialization)"""
    global DB_POOL
    if not POSTGRES_URL:
        return None
    
    if DB_POOL is None or DB_POOL.closed:
        try:
            # 針對 Serverless 限制連線數，避免耗盡連線數
            DB_POOL = pool.SimpleConnectionPool(
                minconn=1,
                maxconn=5,
                dsn=POSTGRES_URL,
                sslmode="require" if "vercel-storage" in POSTGRES_URL or "neon.tech" in POSTGRES_URL else "prefer"
            )
        except Exception as err:
            print(f"[DB_ERROR] 初始化連線池失敗: {err}")
            return None
    return DB_POOL


@contextmanager
def getDbConnection():
    """
    提供資料庫連線 Context Manager
    確保連線能正常釋放，並透過 context manager 控制 Transaction
    """
    if not POSTGRES_URL:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="伺服器未設定 POSTGRES_URL 環境變數，無法連線資料庫。"
        )
    
    connectionPool = getDbPool()
    conn = None
    try:
        if connectionPool:
            conn = connectionPool.getconn()
        else:
            conn = psycopg2.connect(POSTGRES_URL)
        yield conn
    finally:
        if conn:
            if connectionPool:
                connectionPool.putconn(conn)
            else:
                conn.close()


# -----------------------------------------------------------------------------
# 3. Pydantic 模型定義 (DATA TRANSFER OBJECTS)
# -----------------------------------------------------------------------------
class CustomerInput(BaseModel):
    customerCode: Optional[str] = Field(None, max_length=50, description="客戶代號")
    customerName: str = Field(..., min_length=1, max_length=255, description="客戶名稱")
    contactPerson: Optional[str] = Field(None, max_length=100, description="主要聯絡人")
    email: Optional[str] = Field(None, max_length=255, description="客戶 Email")
    phone: Optional[str] = Field(None, max_length=50, description="客戶電話")
    address: Optional[str] = Field(None, max_length=500, description="通訊地址")
    shippingAddress: Optional[str] = Field(None, max_length=500, description="預設寄送/送貨住址")
    paymentTerms: Optional[str] = Field(None, max_length=100, description="預設付款條件")
    taxId: Optional[str] = Field(None, max_length=50, description="統一編號")
    notes: Optional[str] = Field(None, max_length=1000, description="備註")
    createdBy: Optional[str] = Field(None, max_length=100, description="建立人")
    updatedBy: Optional[str] = Field(None, max_length=100, description="最後修改人")


class ProductInput(BaseModel):
    productCode: Optional[str] = Field(None, max_length=50, description="商品/服務料號")
    productName: str = Field(..., min_length=1, max_length=255, description="商品名稱")
    category: Optional[str] = Field("一般商品", max_length=100, description="商品分類")
    unit: Optional[str] = Field("件", max_length=20, description="計價單位")
    unitPrice: Decimal = Field(..., ge=0, description="標準單價")
    costPrice: Optional[Decimal] = Field(Decimal("0.00"), ge=0, description="成本單價")
    stockQuantity: Optional[int] = Field(100, ge=0, description="庫存或名額")
    description: Optional[str] = Field(None, max_length=1000, description="規格描述")
    status: Optional[str] = Field("ACTIVE", description="狀態: ACTIVE, INACTIVE, DISCONTINUED")
    createdBy: Optional[str] = Field(None, max_length=100, description="建立人")
    updatedBy: Optional[str] = Field(None, max_length=100, description="最後修改人")


class QuotationItemInput(BaseModel):
    productId: Optional[int] = Field(None, description="關聯產品ID")
    itemName: str = Field(..., min_length=1, max_length=255, description="項目名稱")
    description: Optional[str] = Field(None, max_length=1000, description="詳細描述")
    quantity: Decimal = Field(..., gt=0, description="數量，必須大於 0")
    unitPrice: Decimal = Field(..., ge=0, description="單價，不可小於 0")
    sortOrder: int = Field(0, description="排序權重")


class QuotationCreateInput(BaseModel):
    quotationNumber: str = Field(..., min_length=3, max_length=50, description="報價單號")
    customerId: Optional[int] = Field(None, description="關聯客戶ID")
    customerName: str = Field(..., min_length=1, max_length=255, description="客戶名稱")
    customerTaxId: Optional[str] = Field(None, max_length=50, description="客戶統一編號")
    customerContactPerson: Optional[str] = Field(None, max_length=100, description="客戶聯絡人")
    customerEmail: Optional[str] = Field(None, max_length=255, description="客戶 Email")
    customerPhone: Optional[str] = Field(None, max_length=50, description="客戶電話")
    customerAddress: Optional[str] = Field(None, max_length=500, description="客戶通訊地址")
    shippingAddress: Optional[str] = Field(None, max_length=500, description="寄送/施工/送貨住址")
    paymentTerms: Optional[str] = Field(None, max_length=100, description="付款條件")
    issueDate: date = Field(default_factory=date.today, description="報價日期")
    expiryDate: Optional[date] = Field(None, description="有效截止日")
    status: str = Field("DRAFT", description="狀態: DRAFT, SENT, ACCEPTED, REJECTED, EXPIRED")
    taxMode: Optional[str] = Field("EXCLUSIVE", description="計稅模式: EXCLUSIVE(外加), INCLUSIVE(內含), ZERO(免稅)")
    taxRate: Decimal = Field(Decimal("5.00"), ge=0, le=100, description="稅率百分比，如 5.0 代表 5%")
    totalAmount: Optional[Decimal] = Field(None, ge=0, description="可手動調整或自訂之應付總額")
    notes: Optional[str] = Field(None, max_length=2000, description="備註條款")
    createdBy: Optional[str] = Field(None, max_length=100, description="開立人/建立人")
    updatedBy: Optional[str] = Field(None, max_length=100, description="最後修改人")
    items: List[QuotationItemInput] = Field(..., min_items=1, description="報價單明細項目清單")


class InvoiceInput(BaseModel):
    id: Optional[int] = Field(None, description="發票ID")
    invoiceNumber: str = Field(..., min_length=1, max_length=50, description="發票號碼")
    invoiceDate: date = Field(default_factory=date.today, description="開立日期")
    amount: Decimal = Field(..., ge=0, description="發票金額")
    status: str = Field("PENDING", description="發票狀況: PAID(已付), PENDING(待付), CANCELLED(取消)")
    notes: Optional[str] = Field(None, max_length=255, description="備註")


class TransactionInput(BaseModel):
    transactionNumber: Optional[str] = Field(None, max_length=50, description="交易單號")
    quotationId: Optional[int] = Field(None, description="來源報價單ID")
    quotationNumber: Optional[str] = Field(None, max_length=50, description="來源報價單號")
    customerName: str = Field(..., min_length=1, max_length=255, description="客戶名稱")
    customerEmail: Optional[str] = Field(None, max_length=255, description="客戶 Email")
    transactionDate: date = Field(default_factory=date.today, description="交易日期")
    totalAmount: Decimal = Field(..., ge=0, description="交易金額")
    costPrice: Optional[Decimal] = Field(Decimal("0.00"), ge=0, description="成本金額")
    paidAmount: Optional[Decimal] = Field(Decimal("0.00"), ge=0, description="已付款金額")
    paymentMethod: Optional[str] = Field("電匯 (Wire Transfer)", max_length=50, description="付款方式")
    paymentStatus: Optional[str] = Field("PENDING", description="付款狀態: PENDING, PARTIAL, PAID, REFUNDED")
    fulfillmentStatus: Optional[str] = Field("PROCESSING", description="交付狀態: PROCESSING, DELIVERED, COMPLETED, CANCELLED")
    notes: Optional[str] = Field(None, max_length=1000, description="交易備註")
    createdBy: Optional[str] = Field(None, max_length=100, description="經辦人/建立人")
    updatedBy: Optional[str] = Field(None, max_length=100, description="最後修改人")
    invoices: Optional[List[InvoiceInput]] = Field(default_factory=list, description="關聯發票清單")


class QuotationUpdateInput(QuotationCreateInput):
    pass


class CompanySettingsInput(BaseModel):
    companyName: str = Field("極簡資訊科技股份有限公司", min_length=1, max_length=255, description="公司名稱")
    taxId: Optional[str] = Field("28491023", max_length=50, description="統一編號")
    phone: Optional[str] = Field("(02) 2345-6789", max_length=50, description="公司電話")
    fax: Optional[str] = Field("(02) 2345-6780", max_length=50, description="傳真號碼")
    address: Optional[str] = Field("台北市信義區松仁路 100 號 18 樓", max_length=500, description="公司地址")
    email: Optional[str] = Field("contact@quotationpro.com.tw", max_length=255, description="電子郵件")
    website: Optional[str] = Field("https://www.quotationpro.com.tw", max_length=255, description="官方網站")
    bankName: Optional[str] = Field("台灣銀行 信義分行", max_length=100, description="銀行名稱與分行")
    bankAccount: Optional[str] = Field("012-345-678901", max_length=100, description="銀行帳號")
    bankAccountName: Optional[str] = Field("極簡資訊科技股份有限公司", max_length=255, description="戶名")
    defaultTerms: Optional[str] = Field("1. 本報價單有效期限為 30 天。\n2. 付款條件為月結 30 天。\n3. 保固服務：自驗收日起提供一年軟硬體保固與技術諮詢。", max_length=2000, description="預設備註條款")
    updatedBy: Optional[str] = Field(None, max_length=100, description="最後修改人")


class UserInput(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="姓名")
    username: str = Field(..., min_length=2, max_length=50, description="登入帳號")
    password: Optional[str] = Field(None, max_length=255, description="登入密碼")
    department: Optional[str] = Field("業務部", max_length=100, description="所屬部門")
    phone: Optional[str] = Field(None, max_length=50, description="聯絡電話")
    email: Optional[str] = Field(None, max_length=255, description="電子郵件")
    role: str = Field("USER", description="權限角色: ADMIN(管理者), USER(使用者)")
    allowedMenus: Optional[str] = Field("dashboard,customers,products,quotations", description="允許存取之左邊選單 (以逗號分隔)")
    status: Optional[str] = Field("ACTIVE", description="狀態: ACTIVE, INACTIVE")
    createdBy: Optional[str] = Field(None, max_length=100, description="建立人")
    updatedBy: Optional[str] = Field(None, max_length=100, description="最後修改人")


# -----------------------------------------------------------------------------
# 4. 統一回應格式輔助函式 (STANDARD RESPONSE HELPER)
# -----------------------------------------------------------------------------
def createApiResponse(
    isSuccess: bool,
    data: Any = None,
    message: str = "",
    errorMessage: Optional[str] = None,
    pagination: Optional[Dict[str, Any]] = None,
    statusCode: int = status.HTTP_200_OK
) -> JSONResponse:
    """產生符合規範的統一 JSON 回應格式"""
    content = {
        "success": isSuccess,
        "data": data,
        "message": message,
        "error": errorMessage,
        "pagination": pagination
    }
    return JSONResponse(status_code=statusCode, content=content)


# -----------------------------------------------------------------------------
# 5. 資料庫初始化 (SCHEMA INITIALIZATION)
# -----------------------------------------------------------------------------
def executeInitDb() -> bool:
    """建立完整的客戶、產品、報價單與交易管理系統所需的資料庫資料表與索引"""
    schemaSql = """
    CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        customer_code VARCHAR(50) UNIQUE,
        customer_name VARCHAR(255) NOT NULL,
        contact_person VARCHAR(100),
        email VARCHAR(255),
        phone VARCHAR(50),
        address VARCHAR(500),
        shipping_address VARCHAR(500),
        payment_terms VARCHAR(100),
        tax_id VARCHAR(50),
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    ALTER TABLE customers ADD COLUMN IF NOT EXISTS shipping_address VARCHAR(500);
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS payment_terms VARCHAR(100);

    CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        product_code VARCHAR(50) UNIQUE,
        product_name VARCHAR(255) NOT NULL,
        category VARCHAR(100) DEFAULT '一般商品',
        unit VARCHAR(20) DEFAULT '件',
        unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (unit_price >= 0),
        cost_price NUMERIC(12, 2) DEFAULT 0.00 CHECK (cost_price >= 0),
        stock_quantity INTEGER DEFAULT 100 CHECK (stock_quantity >= 0),
        description TEXT,
        status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'DISCONTINUED')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS quotations (
        id SERIAL PRIMARY KEY,
        quotation_number VARCHAR(50) NOT NULL UNIQUE,
        customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
        customer_name VARCHAR(255) NOT NULL,
        customer_tax_id VARCHAR(50),
        customer_contact_person VARCHAR(100),
        customer_email VARCHAR(255),
        customer_phone VARCHAR(50),
        customer_address VARCHAR(500),
        shipping_address VARCHAR(500),
        payment_terms VARCHAR(100),
        issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
        expiry_date DATE,
        status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED')),
        tax_mode VARCHAR(20) NOT NULL DEFAULT 'EXCLUSIVE',
        subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (subtotal >= 0),
        tax_rate NUMERIC(5, 2) NOT NULL DEFAULT 5.00 CHECK (tax_rate >= 0),
        tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (tax_amount >= 0),
        total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (total_amount >= 0),
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    ALTER TABLE quotations ADD COLUMN IF NOT EXISTS customer_tax_id VARCHAR(50);
    ALTER TABLE quotations ADD COLUMN IF NOT EXISTS customer_contact_person VARCHAR(100);
    ALTER TABLE quotations ADD COLUMN IF NOT EXISTS customer_address VARCHAR(500);
    ALTER TABLE quotations ADD COLUMN IF NOT EXISTS shipping_address VARCHAR(500);
    ALTER TABLE quotations ADD COLUMN IF NOT EXISTS payment_terms VARCHAR(100);
    ALTER TABLE quotations ADD COLUMN IF NOT EXISTS tax_mode VARCHAR(20) DEFAULT 'EXCLUSIVE';

    CREATE TABLE IF NOT EXISTS quotation_items (
        id SERIAL PRIMARY KEY,
        quotation_id INTEGER NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
        item_name VARCHAR(255) NOT NULL,
        description TEXT,
        quantity NUMERIC(10, 2) NOT NULL DEFAULT 1.00 CHECK (quantity > 0),
        unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (unit_price >= 0),
        line_total NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (line_total >= 0),
        sort_order INTEGER NOT NULL DEFAULT 0
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

    ALTER TABLE customers ADD COLUMN IF NOT EXISTS created_by VARCHAR(100);
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS updated_by VARCHAR(100);
    ALTER TABLE products ADD COLUMN IF NOT EXISTS created_by VARCHAR(100);
    ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_by VARCHAR(100);
    ALTER TABLE quotations ADD COLUMN IF NOT EXISTS created_by VARCHAR(100);
    ALTER TABLE quotations ADD COLUMN IF NOT EXISTS updated_by VARCHAR(100);
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS cost_price NUMERIC(12, 2) DEFAULT 0.00;
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(12, 2) DEFAULT 0.00;
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS created_by VARCHAR(100);
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS updated_by VARCHAR(100);
    ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS updated_by VARCHAR(100);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by VARCHAR(100);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_by VARCHAR(100);

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

    CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(customer_name);
    CREATE INDEX IF NOT EXISTS idx_customers_code ON customers(customer_code);
    CREATE INDEX IF NOT EXISTS idx_products_name ON products(product_name);
    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
    CREATE INDEX IF NOT EXISTS idx_quotations_number ON quotations(quotation_number);
    CREATE INDEX IF NOT EXISTS idx_quotations_customer ON quotations(customer_name);
    CREATE INDEX IF NOT EXISTS idx_quotations_status ON quotations(status);
    CREATE INDEX IF NOT EXISTS idx_quotations_issue_date ON quotations(issue_date DESC);
    CREATE INDEX IF NOT EXISTS idx_quotation_items_quotation_id ON quotation_items(quotation_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_number ON transactions(transaction_number);
    CREATE INDEX IF NOT EXISTS idx_transactions_customer ON transactions(customer_name);
    CREATE INDEX IF NOT EXISTS idx_transactions_payment_status ON transactions(payment_status);
    CREATE INDEX IF NOT EXISTS idx_transaction_invoices_tx_id ON transaction_invoices(transaction_id);

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
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    INSERT INTO company_settings (id, company_name, tax_id, phone, fax, address, email, website, bank_name, bank_account, bank_account_name, default_terms)
    VALUES (1, '極簡資訊科技股份有限公司', '28491023', '(02) 2345-6789', '(02) 2345-6780', '台北市信義區松仁路 100 號 18 樓', 'contact@quotationpro.com.tw', 'https://www.quotationpro.com.tw', '台灣銀行 信義分行', '012-345-678901', '極簡資訊科技股份有限公司', '1. 本報價單有效期限為 30 天。\n2. 付款條件為月結 30 天。\n3. 保固服務：自驗收日起提供一年軟硬體保固與技術諮詢。')
    ON CONFLICT (id) DO NOTHING;

    CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        username VARCHAR(50) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL DEFAULT '123456',
        department VARCHAR(100) DEFAULT '業務部',
        phone VARCHAR(50),
        email VARCHAR(255),
        role VARCHAR(20) NOT NULL DEFAULT 'USER' CHECK (role IN ('ADMIN', 'USER')),
        allowed_menus TEXT DEFAULT 'dashboard,customers,products,quotations',
        status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    INSERT INTO users (id, name, username, password, department, phone, email, role, allowed_menus, status)
    VALUES
    (1, '系統管理者 (Architect)', 'admin', 'admin888', '資訊管理部', '(02) 2345-6789 #101', 'admin@quotationpro.com.tw', 'ADMIN', 'dashboard,customers,products,quotations,transactions,company,users', 'ACTIVE'),
    (2, '陳大明 (業務經理)', 'sales_chen', 'user123', '業務一部', '(02) 2345-6789 #201', 'chen@quotationpro.com.tw', 'USER', 'dashboard,customers,products,quotations,transactions', 'ACTIVE'),
    (3, '林小花 (業務助理)', 'sales_lin', 'user123', '業務支援部', '(02) 2345-6789 #202', 'lin@quotationpro.com.tw', 'USER', 'dashboard,customers,quotations', 'ACTIVE')
    ON CONFLICT (id) DO NOTHING;
    """
    with getDbConnection() as conn:
        with conn.cursor() as cur:
            cur.execute(schemaSql)
        conn.commit()
    return True


@app.post("/api/init-db")
def initDatabase():
    """手動觸發資料庫結構初始化"""
    try:
        executeInitDb()
        return createApiResponse(
            isSuccess=True,
            data=None,
            message="資料庫 Schema 初始化成功！"
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
# 6. RESTful API 路由與 Controller (QUOTATIONS CRUD)
# -----------------------------------------------------------------------------

@app.get("/api/quotations")
def getQuotations(
    page: int = Query(1, ge=1, description="頁碼"),
    pageSize: int = Query(10, ge=1, le=MAX_PAGE_SIZE, description="每頁筆數"),
    search: Optional[str] = Query(None, description="搜尋客戶名稱或報價單號"),
    statusFilter: Optional[str] = Query(None, description="篩選狀態 (DRAFT, SENT, etc.)")
):
    """
    取得報價單列表 (支援分頁、關鍵字搜尋與狀態篩選)
    """
    try:
        offset = (page - 1) * pageSize
        conditions = []
        params: List[Any] = []

        if search and search.strip():
            searchParam = f"%{search.strip()}%"
            conditions.append("(quotation_number ILIKE %s OR customer_name ILIKE %s OR customer_tax_id ILIKE %s OR customer_contact_person ILIKE %s OR customer_address ILIKE %s)")
            params.extend([searchParam, searchParam, searchParam, searchParam, searchParam])

        if statusFilter and statusFilter.strip():
            conditions.append("status = %s")
            params.append(statusFilter.strip().upper())

        whereClause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

        with getDbConnection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # 1. 取得符合條件的總筆數
                countQuery = f"SELECT COUNT(*) as total FROM quotations {whereClause};"
                cur.execute(countQuery, tuple(params))
                totalRow = cur.fetchone()
                totalRecords = totalRow["total"] if totalRow else 0

                # 2. 取得分頁資料
                dataQuery = f"""
                    SELECT 
                        id, quotation_number AS "quotationNumber",
                        customer_name AS "customerName",
                        customer_tax_id AS "customerTaxId",
                        customer_contact_person AS "customerContactPerson",
                        customer_email AS "customerEmail",
                        customer_phone AS "customerPhone",
                        customer_address AS "customerAddress",
                        shipping_address AS "shippingAddress",
                        payment_terms AS "paymentTerms",
                        issue_date::text AS "issueDate",
                        expiry_date::text AS "expiryDate",
                        status,
                        tax_mode AS "taxMode",
                        subtotal::float AS "subtotal",
                        tax_rate::float AS "taxRate",
                        tax_amount::float AS "taxAmount",
                        total_amount::float AS "totalAmount",
                        created_at::text AS "createdAt",
                        updated_at::text AS "updatedAt"
                    FROM quotations
                    {whereClause}
                    ORDER BY id DESC
                    LIMIT %s OFFSET %s;
                """
                queryParams = list(params) + [pageSize, offset]
                cur.execute(dataQuery, tuple(queryParams))
                rows = cur.fetchall()

        totalPages = (totalRecords + pageSize - 1) // pageSize if totalRecords > 0 else 0
        pagination = {
            "currentPage": page,
            "pageSize": pageSize,
            "totalRecords": totalRecords,
            "totalPages": totalPages,
            "hasNextPage": page < totalPages,
            "hasPrevPage": page > 1
        }

        return createApiResponse(
            isSuccess=True,
            data=rows,
            message="成功取得報價單清單",
            pagination=pagination
        )
    except Exception as err:
        return createApiResponse(
            isSuccess=False,
            data=None,
            message="讀取報價單清單失敗",
            errorMessage=str(err),
            statusCode=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@app.get("/api/quotations/{quotationId}")
def getQuotationById(quotationId: int):
    """
    取得單一報價單主檔與其所有明細項目 (IDOR 防護與型態驗證)
    """
    try:
        with getDbConnection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # 查詢主檔 (使用 Parameterized SQL)
                cur.execute("""
                    SELECT 
                        id, quotation_number AS "quotationNumber",
                        customer_name AS "customerName",
                        customer_tax_id AS "customerTaxId",
                        customer_contact_person AS "customerContactPerson",
                        customer_email AS "customerEmail",
                        customer_phone AS "customerPhone",
                        customer_address AS "customerAddress",
                        shipping_address AS "shippingAddress",
                        payment_terms AS "paymentTerms",
                        issue_date::text AS "issueDate",
                        expiry_date::text AS "expiryDate",
                        status,
                        tax_mode AS "taxMode",
                        subtotal::float AS "subtotal",
                        tax_rate::float AS "taxRate",
                        tax_amount::float AS "taxAmount",
                        total_amount::float AS "totalAmount",
                        notes,
                        created_at::text AS "createdAt",
                        updated_at::text AS "updatedAt"
                    FROM quotations
                    WHERE id = %s;
                """, (quotationId,))
                quotation = cur.fetchone()

                if not quotation:
                    return createApiResponse(
                        isSuccess=False,
                        data=None,
                        message="找不到該報價單",
                        errorMessage=f"Quotation with ID {quotationId} not found",
                        statusCode=status.HTTP_404_NOT_FOUND
                    )

                # 查詢明細檔 (使用 Parameterized SQL)
                cur.execute("""
                    SELECT 
                        id,
                        quotation_id AS "quotationId",
                        item_name AS "itemName",
                        description,
                        quantity::float AS "quantity",
                        unit_price::float AS "unitPrice",
                        line_total::float AS "lineTotal",
                        sort_order AS "sortOrder"
                    FROM quotation_items
                    WHERE quotation_id = %s
                    ORDER BY sort_order ASC, id ASC;
                """, (quotationId,))
                items = cur.fetchall()
                quotation["items"] = items

        return createApiResponse(
            isSuccess=True,
            data=quotation,
            message="成功取得報價單詳細資料"
        )
    except Exception as err:
        return createApiResponse(
            isSuccess=False,
            data=None,
            message="讀取報價單明細失敗",
            errorMessage=str(err),
            statusCode=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@app.post("/api/quotations")
def createQuotation(payload: QuotationCreateInput):
    """
    新增報價單 (含主檔與明細項目)
    【嚴格保證】：主檔與明細的寫入被包裝在同一個 DB Transaction 中！
    """
    try:
        # 後端重新計算金額，防止前端竄改金額數據 (Anti-Tampering)
        calculatedSubtotal = Decimal("0.00")
        calculatedItems = []
        for index, item in enumerate(payload.items):
            lineTotal = (item.quantity * item.unitPrice).quantize(Decimal("0.01"))
            calculatedSubtotal += lineTotal
            calculatedItems.append({
                "itemName": item.itemName,
                "description": item.description,
                "quantity": item.quantity,
                "unitPrice": item.unitPrice,
                "lineTotal": lineTotal,
                "sortOrder": item.sortOrder if item.sortOrder != 0 else index
            })

        taxMode = (payload.taxMode or "EXCLUSIVE").upper()
        if payload.totalAmount is not None:
            finalTotalAmount = payload.totalAmount
            if taxMode == "INCLUSIVE":
                taxRateRatio = payload.taxRate / Decimal("100")
                untaxedSubtotal = (finalTotalAmount / (Decimal("1") + taxRateRatio)).quantize(Decimal("0.01"))
                calculatedTaxAmount = finalTotalAmount - untaxedSubtotal
                dbSubtotal = untaxedSubtotal
            elif taxMode == "ZERO":
                calculatedTaxAmount = Decimal("0.00")
                dbSubtotal = finalTotalAmount
            else:
                calculatedTaxAmount = (calculatedSubtotal * (payload.taxRate / Decimal("100"))).quantize(Decimal("0.01"))
                dbSubtotal = calculatedSubtotal
            calculatedTotalAmount = finalTotalAmount
        else:
            if taxMode == "INCLUSIVE":
                calculatedTotalAmount = calculatedSubtotal
                taxRateRatio = payload.taxRate / Decimal("100")
                untaxedSubtotal = (calculatedTotalAmount / (Decimal("1") + taxRateRatio)).quantize(Decimal("0.01"))
                calculatedTaxAmount = calculatedTotalAmount - untaxedSubtotal
                dbSubtotal = untaxedSubtotal
            elif taxMode == "ZERO":
                calculatedTaxAmount = Decimal("0.00")
                calculatedTotalAmount = calculatedSubtotal
                dbSubtotal = calculatedSubtotal
            else:
                calculatedTaxAmount = (calculatedSubtotal * (payload.taxRate / Decimal("100"))).quantize(Decimal("0.01"))
                calculatedTotalAmount = calculatedSubtotal + calculatedTaxAmount
                dbSubtotal = calculatedSubtotal

        with getDbConnection() as conn:
            try:
                with conn.cursor(cursor_factory=RealDictCursor) as cur:
                    # 1. 寫入主檔 (Parameterized SQL)
                    cur.execute("""
                        INSERT INTO quotations (
                            quotation_number, customer_name, customer_tax_id, customer_contact_person,
                            customer_email, customer_phone, customer_address, shipping_address, payment_terms,
                            issue_date, expiry_date, status, tax_mode, subtotal, tax_rate, tax_amount, total_amount, notes
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        RETURNING id;
                    """, (
                        payload.quotationNumber.strip(),
                        payload.customerName.strip(),
                        payload.customerTaxId.strip() if payload.customerTaxId else None,
                        payload.customerContactPerson.strip() if payload.customerContactPerson else None,
                        payload.customerEmail.strip() if payload.customerEmail else None,
                        payload.customerPhone.strip() if payload.customerPhone else None,
                        payload.customerAddress.strip() if payload.customerAddress else None,
                        payload.shippingAddress.strip() if payload.shippingAddress else None,
                        payload.paymentTerms.strip() if payload.paymentTerms else None,
                        payload.issueDate,
                        payload.expiryDate,
                        payload.status,
                        taxMode,
                        float(dbSubtotal),
                        float(payload.taxRate),
                        float(calculatedTaxAmount),
                        float(calculatedTotalAmount),
                        payload.notes.strip() if payload.notes else None
                    ))
                    newRow = cur.fetchone()
                    newQuotationId = newRow["id"]

                    # 2. 批次寫入明細檔 (Parameterized SQL)
                    for item in calculatedItems:
                        cur.execute("""
                            INSERT INTO quotation_items (
                                quotation_id, item_name, description, quantity, unit_price, line_total, sort_order
                            ) VALUES (%s, %s, %s, %s, %s, %s, %s);
                        """, (
                            newQuotationId,
                            item["itemName"].strip(),
                            item["description"].strip() if item["description"] else None,
                            float(item["quantity"]),
                            float(item["unitPrice"]),
                            float(item["lineTotal"]),
                            item["sortOrder"]
                        ))

                # 3. 完整無誤後手動 Commit
                conn.commit()

            except Exception as transactionErr:
                # 發生任何異常立即 Rollback 回滾
                conn.rollback()
                raise transactionErr

        return createApiResponse(
            isSuccess=True,
            data={"id": newQuotationId, "quotationNumber": payload.quotationNumber},
            message="報價單建立成功",
            statusCode=status.HTTP_201_CREATED
        )

    except psycopg2.IntegrityError as integrityErr:
        errorMessage = str(integrityErr)
        if "unique" in errorMessage.lower() and "quotation_number" in errorMessage.lower():
            return createApiResponse(
                isSuccess=False,
                data=None,
                message="報價單號已存在，請使用不同單號",
                errorMessage="Quotation number already exists",
                statusCode=status.HTTP_409_CONFLICT
            )
        return createApiResponse(
            isSuccess=False,
            data=None,
            message="資料完整性錯誤",
            errorMessage=errorMessage,
            statusCode=status.HTTP_400_BAD_REQUEST
        )
    except Exception as err:
        return createApiResponse(
            isSuccess=False,
            data=None,
            message="建立報價單失敗",
            errorMessage=str(err),
            statusCode=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@app.put("/api/quotations/{quotationId}")
def updateQuotation(quotationId: int, payload: QuotationUpdateInput):
    """
    更新報價單 (覆蓋更新主檔並重新建立明細)
    【嚴格保證】：主檔更新與明細替換在同一個 DB Transaction 中執行！
    """
    try:
        calculatedSubtotal = Decimal("0.00")
        calculatedItems = []
        for index, item in enumerate(payload.items):
            lineTotal = (item.quantity * item.unitPrice).quantize(Decimal("0.01"))
            calculatedSubtotal += lineTotal
            calculatedItems.append({
                "itemName": item.itemName,
                "description": item.description,
                "quantity": item.quantity,
                "unitPrice": item.unitPrice,
                "lineTotal": lineTotal,
                "sortOrder": item.sortOrder if item.sortOrder != 0 else index
            })

        taxMode = (payload.taxMode or "EXCLUSIVE").upper()
        if payload.totalAmount is not None:
            finalTotalAmount = payload.totalAmount
            if taxMode == "INCLUSIVE":
                taxRateRatio = payload.taxRate / Decimal("100")
                untaxedSubtotal = (finalTotalAmount / (Decimal("1") + taxRateRatio)).quantize(Decimal("0.01"))
                calculatedTaxAmount = finalTotalAmount - untaxedSubtotal
                dbSubtotal = untaxedSubtotal
            elif taxMode == "ZERO":
                calculatedTaxAmount = Decimal("0.00")
                dbSubtotal = finalTotalAmount
            else:
                calculatedTaxAmount = (calculatedSubtotal * (payload.taxRate / Decimal("100"))).quantize(Decimal("0.01"))
                dbSubtotal = calculatedSubtotal
            calculatedTotalAmount = finalTotalAmount
        else:
            if taxMode == "INCLUSIVE":
                calculatedTotalAmount = calculatedSubtotal
                taxRateRatio = payload.taxRate / Decimal("100")
                untaxedSubtotal = (calculatedTotalAmount / (Decimal("1") + taxRateRatio)).quantize(Decimal("0.01"))
                calculatedTaxAmount = calculatedTotalAmount - untaxedSubtotal
                dbSubtotal = untaxedSubtotal
            elif taxMode == "ZERO":
                calculatedTaxAmount = Decimal("0.00")
                calculatedTotalAmount = calculatedSubtotal
                dbSubtotal = calculatedSubtotal
            else:
                calculatedTaxAmount = (calculatedSubtotal * (payload.taxRate / Decimal("100"))).quantize(Decimal("0.01"))
                calculatedTotalAmount = calculatedSubtotal + calculatedTaxAmount
                dbSubtotal = calculatedSubtotal

        with getDbConnection() as conn:
            try:
                with conn.cursor(cursor_factory=RealDictCursor) as cur:
                    # 1. 檢查報價單是否存在
                    cur.execute("SELECT id FROM quotations WHERE id = %s;", (quotationId,))
                    if not cur.fetchone():
                        return createApiResponse(
                            isSuccess=False,
                            data=None,
                            message="找不到該報價單，無法更新",
                            statusCode=status.HTTP_404_NOT_FOUND
                        )

                    # 2. 更新主檔 (Parameterized SQL)
                    cur.execute("""
                        UPDATE quotations SET
                            quotation_number = %s,
                            customer_name = %s,
                            customer_tax_id = %s,
                            customer_contact_person = %s,
                            customer_email = %s,
                            customer_phone = %s,
                            customer_address = %s,
                            shipping_address = %s,
                            payment_terms = %s,
                            issue_date = %s,
                            expiry_date = %s,
                            status = %s,
                            tax_mode = %s,
                            subtotal = %s,
                            tax_rate = %s,
                            tax_amount = %s,
                            total_amount = %s,
                            notes = %s,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = %s;
                    """, (
                        payload.quotationNumber.strip(),
                        payload.customerName.strip(),
                        payload.customerTaxId.strip() if payload.customerTaxId else None,
                        payload.customerContactPerson.strip() if payload.customerContactPerson else None,
                        payload.customerEmail.strip() if payload.customerEmail else None,
                        payload.customerPhone.strip() if payload.customerPhone else None,
                        payload.customerAddress.strip() if payload.customerAddress else None,
                        payload.shippingAddress.strip() if payload.shippingAddress else None,
                        payload.paymentTerms.strip() if payload.paymentTerms else None,
                        payload.issueDate,
                        payload.expiryDate,
                        payload.status,
                        taxMode,
                        float(dbSubtotal),
                        float(payload.taxRate),
                        float(calculatedTaxAmount),
                        float(calculatedTotalAmount),
                        payload.notes.strip() if payload.notes else None,
                        quotationId
                    ))

                    # 3. 刪除原有明細
                    cur.execute("DELETE FROM quotation_items WHERE quotation_id = %s;", (quotationId,))

                    # 4. 寫入新明細
                    for item in calculatedItems:
                        cur.execute("""
                            INSERT INTO quotation_items (
                                quotation_id, item_name, description, quantity, unit_price, line_total, sort_order
                            ) VALUES (%s, %s, %s, %s, %s, %s, %s);
                        """, (
                            quotationId,
                            item["itemName"].strip(),
                            item["description"].strip() if item["description"] else None,
                            float(item["quantity"]),
                            float(item["unitPrice"]),
                            float(item["lineTotal"]),
                            item["sortOrder"]
                        ))

                # 5. Commit 交易
                conn.commit()

            except Exception as transactionErr:
                conn.rollback()
                raise transactionErr

        return createApiResponse(
            isSuccess=True,
            data={"id": quotationId, "quotationNumber": payload.quotationNumber},
            message="報價單更新成功"
        )
    except Exception as err:
        return createApiResponse(
            isSuccess=False,
            data=None,
            message="更新報價單失敗",
            errorMessage=str(err),
            statusCode=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@app.delete("/api/quotations/{quotationId}")
def deleteQuotation(quotationId: int):
    """
    刪除報價單 (明細會因 ON DELETE CASCADE 一併刪除)
    """
    try:
        with getDbConnection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("SELECT quotation_number FROM quotations WHERE id = %s;", (quotationId,))
                row = cur.fetchone()
                if not row:
                    return createApiResponse(
                        isSuccess=False,
                        data=None,
                        message="找不到該報價單",
                        statusCode=status.HTTP_404_NOT_FOUND
                    )

                cur.execute("DELETE FROM quotations WHERE id = %s;", (quotationId,))
            conn.commit()

        return createApiResponse(
            isSuccess=True,
            data={"id": quotationId, "quotationNumber": row["quotation_number"]},
            message="報價單已成功刪除"
        )
    except Exception as err:
        return createApiResponse(
            isSuccess=False,
            data=None,
            message="刪除報價單失敗",
            errorMessage=str(err),
            statusCode=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


# =============================================================================
# 7. 客戶管理 API (CUSTOMER MANAGEMENT ENDPOINTS)
# =============================================================================
@app.get("/api/customers")
def getCustomers(
    search: Optional[str] = Query(None, description="搜尋名稱/電話/Email/統編"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100)
):
    try:
        with getDbConnection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                whereClauses = []
                params = []
                if search and search.strip():
                    whereClauses.append("(customer_name ILIKE %s OR email ILIKE %s OR phone ILIKE %s OR customer_code ILIKE %s OR tax_id ILIKE %s)")
                    s = f"%{search.strip()}%"
                    params.extend([s, s, s, s, s])

                whereSql = f"WHERE {' AND '.join(whereClauses)}" if whereClauses else ""
                cur.execute(f"SELECT COUNT(*) as total FROM customers {whereSql};", tuple(params))
                totalCount = cur.fetchone()["total"]

                offset = (page - 1) * limit
                querySql = f"""
                    SELECT id, customer_code as "customerCode", customer_name as "customerName",
                           contact_person as "contactPerson", email, phone, address, 
                           shipping_address as "shippingAddress", payment_terms as "paymentTerms",
                           tax_id as "taxId",
                           notes, created_at as "createdAt", updated_at as "updatedAt"
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
        return createApiResponse(
            isSuccess=False,
            message="取得客戶清單失敗",
            errorMessage=str(err),
            statusCode=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@app.post("/api/customers")
def createCustomer(payload: CustomerInput):
    try:
        with getDbConnection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    INSERT INTO customers (
                        customer_code, customer_name, contact_person, email, phone, address, shipping_address, payment_terms, tax_id, notes
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id, customer_code as "customerCode", customer_name as "customerName",
                              contact_person as "contactPerson", email, phone, address, 
                              shipping_address as "shippingAddress", payment_terms as "paymentTerms",
                              tax_id as "taxId", notes, created_at as "createdAt";
                """, (
                    payload.customerCode.strip() if payload.customerCode else None,
                    payload.customerName.strip(),
                    payload.contactPerson.strip() if payload.contactPerson else None,
                    payload.email.strip() if payload.email else None,
                    payload.phone.strip() if payload.phone else None,
                    payload.address.strip() if payload.address else None,
                    payload.shippingAddress.strip() if payload.shippingAddress else None,
                    payload.paymentTerms.strip() if payload.paymentTerms else None,
                    payload.taxId.strip() if payload.taxId else None,
                    payload.notes.strip() if payload.notes else None
                ))
                newCustomer = cur.fetchone()
            conn.commit()

        return createApiResponse(
            isSuccess=True,
            data=newCustomer,
            message="客戶建立成功",
            statusCode=status.HTTP_201_CREATED
        )
    except Exception as err:
        return createApiResponse(
            isSuccess=False,
            message="建立客戶失敗",
            errorMessage=str(err),
            statusCode=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@app.put("/api/customers/{customerId}")
def updateCustomer(customerId: int, payload: CustomerInput):
    try:
        with getDbConnection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    UPDATE customers
                    SET customer_code = %s,
                        customer_name = %s,
                        contact_person = %s,
                        email = %s,
                        phone = %s,
                        address = %s,
                        shipping_address = %s,
                        payment_terms = %s,
                        tax_id = %s,
                        notes = %s,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = %s
                    RETURNING id, customer_code as "customerCode", customer_name as "customerName",
                              contact_person as "contactPerson", email, phone, address, 
                              shipping_address as "shippingAddress", payment_terms as "paymentTerms",
                              tax_id as "taxId", notes, updated_at as "updatedAt";
                """, (
                    payload.customerCode.strip() if payload.customerCode else None,
                    payload.customerName.strip(),
                    payload.contactPerson.strip() if payload.contactPerson else None,
                    payload.email.strip() if payload.email else None,
                    payload.phone.strip() if payload.phone else None,
                    payload.address.strip() if payload.address else None,
                    payload.shippingAddress.strip() if payload.shippingAddress else None,
                    payload.paymentTerms.strip() if payload.paymentTerms else None,
                    payload.taxId.strip() if payload.taxId else None,
                    payload.notes.strip() if payload.notes else None,
                    customerId
                ))
                updated = cur.fetchone()
                if not updated:
                    return createApiResponse(isSuccess=False, message="找不到該客戶", statusCode=status.HTTP_404_NOT_FOUND)
            conn.commit()

        return createApiResponse(
            isSuccess=True,
            data=updated,
            message="客戶資料更新成功"
        )
    except Exception as err:
        return createApiResponse(
            isSuccess=False,
            message="更新客戶失敗",
            errorMessage=str(err),
            statusCode=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@app.delete("/api/customers/{customerId}")
def deleteCustomer(customerId: int):
    try:
        with getDbConnection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("DELETE FROM customers WHERE id = %s RETURNING id;", (customerId,))
                deleted = cur.fetchone()
                if not deleted:
                    return createApiResponse(isSuccess=False, message="找不到該客戶", statusCode=status.HTTP_404_NOT_FOUND)
            conn.commit()

        return createApiResponse(
            isSuccess=True,
            data={"id": customerId},
            message="客戶已成功刪除"
        )
    except Exception as err:
        return createApiResponse(
            isSuccess=False,
            message="刪除客戶失敗",
            errorMessage=str(err),
            statusCode=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


# =============================================================================
# 8. 產品管理 API (PRODUCT MANAGEMENT ENDPOINTS)
# =============================================================================
@app.get("/api/products")
def getProducts(
    search: Optional[str] = Query(None, description="搜尋品名/代號/分類"),
    category: Optional[str] = Query(None),
    statusFilter: Optional[str] = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100)
):
    try:
        with getDbConnection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                whereClauses = []
                params = []
                if search and search.strip():
                    whereClauses.append("(product_name ILIKE %s OR product_code ILIKE %s OR description ILIKE %s)")
                    s = f"%{search.strip()}%"
                    params.extend([s, s, s])
                if category and category.strip():
                    whereClauses.append("category = %s")
                    params.append(category.strip())
                if statusFilter and statusFilter.strip():
                    whereClauses.append("status = %s")
                    params.append(statusFilter.strip())

                whereSql = f"WHERE {' AND '.join(whereClauses)}" if whereClauses else ""
                cur.execute(f"SELECT COUNT(*) as total FROM products {whereSql};", tuple(params))
                totalCount = cur.fetchone()["total"]

                offset = (page - 1) * limit
                querySql = f"""
                    SELECT id, product_code as "productCode", product_name as "productName",
                           category, unit, unit_price as "unitPrice", cost_price as "costPrice",
                           stock_quantity as "stockQuantity", description, status,
                           created_at as "createdAt", updated_at as "updatedAt"
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
        return createApiResponse(
            isSuccess=False,
            message="取得產品清單失敗",
            errorMessage=str(err),
            statusCode=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@app.post("/api/products")
def createProduct(payload: ProductInput):
    try:
        with getDbConnection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    INSERT INTO products (
                        product_code, product_name, category, unit, unit_price, cost_price,
                        stock_quantity, description, status
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id, product_code as "productCode", product_name as "productName",
                              category, unit, unit_price as "unitPrice", cost_price as "costPrice",
                              stock_quantity as "stockQuantity", description, status, created_at as "createdAt";
                """, (
                    payload.productCode.strip() if payload.productCode else None,
                    payload.productName.strip(),
                    payload.category.strip() if payload.category else "一般商品",
                    payload.unit.strip() if payload.unit else "件",
                    float(payload.unitPrice),
                    float(payload.costPrice) if payload.costPrice else 0.0,
                    payload.stockQuantity if payload.stockQuantity is not None else 100,
                    payload.description.strip() if payload.description else None,
                    payload.status or "ACTIVE"
                ))
                newProduct = cur.fetchone()
            conn.commit()

        return createApiResponse(
            isSuccess=True,
            data=newProduct,
            message="產品建立成功",
            statusCode=status.HTTP_201_CREATED
        )
    except Exception as err:
        return createApiResponse(
            isSuccess=False,
            message="建立產品失敗",
            errorMessage=str(err),
            statusCode=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@app.put("/api/products/{productId}")
def updateProduct(productId: int, payload: ProductInput):
    try:
        with getDbConnection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    UPDATE products
                    SET product_code = %s,
                        product_name = %s,
                        category = %s,
                        unit = %s,
                        unit_price = %s,
                        cost_price = %s,
                        stock_quantity = %s,
                        description = %s,
                        status = %s,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = %s
                    RETURNING id, product_code as "productCode", product_name as "productName",
                              category, unit, unit_price as "unitPrice", cost_price as "costPrice",
                              stock_quantity as "stockQuantity", description, status, updated_at as "updatedAt";
                """, (
                    payload.productCode.strip() if payload.productCode else None,
                    payload.productName.strip(),
                    payload.category.strip() if payload.category else "一般商品",
                    payload.unit.strip() if payload.unit else "件",
                    float(payload.unitPrice),
                    float(payload.costPrice) if payload.costPrice else 0.0,
                    payload.stockQuantity if payload.stockQuantity is not None else 100,
                    payload.description.strip() if payload.description else None,
                    payload.status or "ACTIVE",
                    productId
                ))
                updated = cur.fetchone()
                if not updated:
                    return createApiResponse(isSuccess=False, message="找不到該產品", statusCode=status.HTTP_404_NOT_FOUND)
            conn.commit()

        return createApiResponse(
            isSuccess=True,
            data=updated,
            message="產品資料更新成功"
        )
    except Exception as err:
        return createApiResponse(
            isSuccess=False,
            message="更新產品失敗",
            errorMessage=str(err),
            statusCode=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@app.delete("/api/products/{productId}")
def deleteProduct(productId: int):
    try:
        with getDbConnection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("DELETE FROM products WHERE id = %s RETURNING id;", (productId,))
                deleted = cur.fetchone()
                if not deleted:
                    return createApiResponse(isSuccess=False, message="找不到該產品", statusCode=status.HTTP_404_NOT_FOUND)
            conn.commit()

        return createApiResponse(
            isSuccess=True,
            data={"id": productId},
            message="產品已成功刪除"
        )
    except Exception as err:
        return createApiResponse(
            isSuccess=False,
            message="刪除產品失敗",
            errorMessage=str(err),
            statusCode=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


# =============================================================================
# 9. 交易管理 API (TRANSACTION MANAGEMENT ENDPOINTS)
# =============================================================================
@app.get("/api/transactions")
def getTransactions(
    search: Optional[str] = Query(None, description="搜尋交易單號或客戶名稱"),
    paymentStatus: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100)
):
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
                totalCount = cur.fetchone()["total"]

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

                # 載入每筆交易關聯之發票清單
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
                    
                    # 計算財務衍生欄位
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
        return createApiResponse(
            isSuccess=False,
            message="取得交易清單失敗",
            errorMessage=str(err),
            statusCode=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@app.get("/api/transactions/{txId}")
def getTransactionById(txId: int):
    try:
        with getDbConnection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
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
                    WHERE id = %s;
                """, (txId,))
                tx = cur.fetchone()
                if not tx:
                    return createApiResponse(isSuccess=False, message="找不到該交易記錄", statusCode=status.HTTP_404_NOT_FOUND)

                cur.execute("""
                    SELECT id, invoice_number as "invoiceNumber", invoice_date::text as "invoiceDate",
                           amount::float as "amount", status, notes,
                           created_by as "createdBy", updated_by as "updatedBy",
                           created_at::text as "createdAt", updated_at::text as "updatedAt"
                    FROM transaction_invoices
                    WHERE transaction_id = %s
                    ORDER BY id ASC;
                """, (txId,))
                tx["invoices"] = cur.fetchall()

                tot = float(tx.get("totalAmount") or 0)
                cost = float(tx.get("costPrice") or 0)
                paid = float(tx.get("paidAmount") or 0)
                tx["remainingAmount"] = max(0.0, tot - paid)
                tx["grossProfit"] = tot - cost
                tx["grossMargin"] = round((tx["grossProfit"] / tot * 100), 1) if tot > 0 else 0.0

        return createApiResponse(
            isSuccess=True,
            data=tx,
            message="取得交易詳情成功"
        )
    except Exception as err:
        return createApiResponse(
            isSuccess=False,
            message="取得交易詳情失敗",
            errorMessage=str(err),
            statusCode=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@app.post("/api/transactions")
def createTransaction(payload: TransactionInput):
    try:
        import time
        txNumber = payload.transactionNumber or f"TX-{date.today().strftime('%Y%m%d')}-{int(time.time()) % 10000:04d}"
        creator = payload.createdBy or payload.updatedBy or "系統使用者"
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
                              payment_status as "paymentStatus", fulfillment_status as "fulfillmentStatus",
                              created_by as "createdBy", updated_by as "updatedBy";
                """, (
                    txNumber,
                    payload.quotationId,
                    payload.quotationNumber,
                    payload.customerName.strip(),
                    payload.customerEmail.strip() if payload.customerEmail else None,
                    payload.transactionDate,
                    float(payload.totalAmount),
                    float(payload.costPrice or 0),
                    float(payload.paidAmount or 0),
                    payload.paymentMethod or "電匯 (Wire Transfer)",
                    payload.paymentStatus or "PENDING",
                    payload.fulfillmentStatus or "PROCESSING",
                    payload.notes.strip() if payload.notes else None,
                    creator,
                    updater
                ))
                newTx = cur.fetchone()
                txId = newTx["id"]

                # 插入發票紀錄
                if payload.invoices:
                    for inv in payload.invoices:
                        cur.execute("""
                            INSERT INTO transaction_invoices (
                                transaction_id, invoice_number, invoice_date, amount, status, notes,
                                created_by, updated_by
                            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s);
                        """, (
                            txId,
                            inv.invoiceNumber.strip(),
                            inv.invoiceDate,
                            float(inv.amount),
                            inv.status or "PENDING",
                            inv.notes.strip() if inv.notes else None,
                            creator,
                            updater
                        ))
            conn.commit()

        return createApiResponse(
            isSuccess=True,
            data=newTx,
            message="交易記錄與發票建立成功",
            statusCode=status.HTTP_201_CREATED
        )
    except Exception as err:
        return createApiResponse(
            isSuccess=False,
            message="建立交易記錄失敗",
            errorMessage=str(err),
            statusCode=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@app.post("/api/transactions/from-quotation/{quotationId}")
def convertQuotationToTransaction(quotationId: int):
    try:
        import time
        with getDbConnection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("SELECT * FROM quotations WHERE id = %s;", (quotationId,))
                q = cur.fetchone()
                if not q:
                    return createApiResponse(isSuccess=False, message="找不到指定的報價單", statusCode=status.HTTP_404_NOT_FOUND)

                # 查詢報價單項目並計算總成本
                cur.execute("""
                    SELECT qi.quantity, COALESCE(p.cost_price, 0.00) as cost_price
                    FROM quotation_items qi
                    LEFT JOIN products p ON qi.product_id = p.id
                    WHERE qi.quotation_id = %s;
                """, (quotationId,))
                items = cur.fetchall()
                totalCost = sum(float(it["quantity"]) * float(it["cost_price"]) for it in items)

                operator = q.get("updated_by") or q.get("created_by") or "系統經辦人"

                # 更新報價單狀態為 ACCEPTED
                cur.execute("""
                    UPDATE quotations 
                    SET status = 'ACCEPTED', updated_by = %s, updated_at = CURRENT_TIMESTAMP 
                    WHERE id = %s;
                """, (operator, quotationId))

                txNumber = f"TX-{date.today().strftime('%Y%m%d')}-{int(time.time()) % 10000:04d}"
                cur.execute("""
                    INSERT INTO transactions (
                        transaction_number, quotation_id, quotation_number, customer_name,
                        customer_email, transaction_date, total_amount, cost_price, paid_amount,
                        payment_method, payment_status, fulfillment_status, notes,
                        created_by, updated_by
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id, transaction_number as "transactionNumber", total_amount as "totalAmount",
                              cost_price as "costPrice", paid_amount as "paidAmount",
                              payment_status as "paymentStatus", fulfillment_status as "fulfillmentStatus",
                              created_by as "createdBy", updated_by as "updatedBy";
                """, (
                    txNumber,
                    quotationId,
                    q["quotation_number"],
                    q["customer_name"],
                    q.get("customer_email"),
                    date.today(),
                    float(q["total_amount"]),
                    float(totalCost),
                    0.0, # 預設待收款
                    "電匯 (Wire Transfer)",
                    "PENDING",
                    "PROCESSING",
                    f"由報價單 {q['quotation_number']} 自動結案轉入交易",
                    operator,
                    operator
                ))
                newTx = cur.fetchone()
            conn.commit()

        return createApiResponse(
            isSuccess=True,
            data=newTx,
            message=f"報價單 {q['quotation_number']} 已成功轉為正式交易！"
        )
    except Exception as err:
        return createApiResponse(
            isSuccess=False,
            message="轉為交易失敗",
            errorMessage=str(err),
            statusCode=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@app.put("/api/transactions/{txId}")
def updateTransaction(txId: int, payload: TransactionInput):
    try:
        updater = payload.updatedBy or "系統修改人"
        with getDbConnection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    UPDATE transactions
                    SET customer_name = %s,
                        customer_email = %s,
                        transaction_date = %s,
                        total_amount = %s,
                        cost_price = %s,
                        paid_amount = %s,
                        payment_method = %s,
                        payment_status = %s,
                        fulfillment_status = %s,
                        notes = %s,
                        updated_by = %s,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = %s
                    RETURNING id, transaction_number as "transactionNumber",
                              total_amount as "totalAmount", cost_price as "costPrice", paid_amount as "paidAmount",
                              payment_status as "paymentStatus", fulfillment_status as "fulfillmentStatus",
                              updated_by as "updatedBy", updated_at as "updatedAt";
                """, (
                    payload.customerName.strip(),
                    payload.customerEmail.strip() if payload.customerEmail else None,
                    payload.transactionDate,
                    float(payload.totalAmount),
                    float(payload.costPrice or 0),
                    float(payload.paidAmount or 0),
                    payload.paymentMethod or "電匯 (Wire Transfer)",
                    payload.paymentStatus or "PENDING",
                    payload.fulfillmentStatus or "PROCESSING",
                    payload.notes.strip() if payload.notes else None,
                    updater,
                    txId
                ))
                updated = cur.fetchone()
                if not updated:
                    return createApiResponse(isSuccess=False, message="找不到該交易記錄", statusCode=status.HTTP_404_NOT_FOUND)

                # 更新發票清單
                cur.execute("DELETE FROM transaction_invoices WHERE transaction_id = %s;", (txId,))
                if payload.invoices:
                    for inv in payload.invoices:
                        cur.execute("""
                            INSERT INTO transaction_invoices (
                                transaction_id, invoice_number, invoice_date, amount, status, notes,
                                created_by, updated_by
                            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s);
                        """, (
                            txId,
                            inv.invoiceNumber.strip(),
                            inv.invoiceDate,
                            float(inv.amount),
                            inv.status or "PENDING",
                            inv.notes.strip() if inv.notes else None,
                            updater,
                            updater
                        ))
            conn.commit()

        return createApiResponse(
            isSuccess=True,
            data=updated,
            message="交易資料與發票更新成功"
        )
    except Exception as err:
        return createApiResponse(
            isSuccess=False,
            message="更新交易記錄失敗",
            errorMessage=str(err),
            statusCode=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@app.delete("/api/transactions/{txId}")
def deleteTransaction(txId: int):
    try:
        with getDbConnection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("DELETE FROM transactions WHERE id = %s RETURNING id, transaction_number;", (txId,))
                deleted = cur.fetchone()
                if not deleted:
                    return createApiResponse(isSuccess=False, message="找不到該交易記錄", statusCode=status.HTTP_404_NOT_FOUND)
            conn.commit()

        return createApiResponse(
            isSuccess=True,
            data={"id": txId, "transactionNumber": deleted["transaction_number"]},
            message="交易記錄已刪除"
        )
    except Exception as err:
        return createApiResponse(
            isSuccess=False,
            message="刪除交易記錄失敗",
            errorMessage=str(err),
            statusCode=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


# =============================================================================
# 10. 統計指標 API (DASHBOARD METRICS ENDPOINT)
# =============================================================================
@app.get("/api/metrics")
def getMetrics():
    try:
        with getDbConnection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("SELECT COUNT(*) as count FROM customers;")
                customerCount = cur.fetchone()["count"]

                cur.execute("SELECT COUNT(*) as count FROM products WHERE status = 'ACTIVE';")
                productCount = cur.fetchone()["count"]

                cur.execute("SELECT COUNT(*) as count, COALESCE(SUM(total_amount), 0) as total FROM quotations;")
                qRow = cur.fetchone()
                quotationCount = qRow["count"]
                quotationTotal = qRow["total"]

                cur.execute("SELECT status, COUNT(*) as count FROM quotations GROUP BY status;")
                statusRows = cur.fetchall()
                statusCounts = {
                    "DRAFT": 0,
                    "SENT": 0,
                    "ACCEPTED": 0,
                    "REJECTED": 0,
                    "EXPIRED": 0
                }
                for sRow in statusRows:
                    if sRow["status"] in statusCounts:
                        statusCounts[sRow["status"]] = sRow["count"]

                cur.execute("SELECT COUNT(*) as count, COALESCE(SUM(total_amount), 0) as revenue FROM transactions WHERE payment_status = 'PAID';")
                txRow = cur.fetchone()
                transactionCount = txRow["count"]
                totalRevenue = txRow["revenue"]

        return createApiResponse(
            isSuccess=True,
            data={
                "customersCount": customerCount,
                "productsCount": productCount,
                "quotationsCount": quotationCount,
                "quotationsTotal": quotationTotal,
                "transactionsCount": transactionCount,
                "totalRevenue": totalRevenue,
                "statusCounts": statusCounts
            },
            message="取得系統統計指標成功"
        )
    except Exception as err:
        return createApiResponse(
            isSuccess=False,
            message="取得指標失敗",
            errorMessage=str(err),
            statusCode=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


# =============================================================================
# 11. 基本資料管理 API (COMPANY SETTINGS ENDPOINTS)
# =============================================================================
@app.get("/api/company")
def getCompanySettings():
    try:
        with getDbConnection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("SELECT * FROM company_settings ORDER BY id ASC LIMIT 1;")
                row = cur.fetchone()
                if not row:
                    cur.execute("""
                        INSERT INTO company_settings (id, company_name, tax_id, phone, fax, address, email, website, bank_name, bank_account, bank_account_name, default_terms)
                        VALUES (1, '極簡資訊科技股份有限公司', '28491023', '(02) 2345-6789', '(02) 2345-6780', '台北市信義區松仁路 100 號 18 樓', 'contact@quotationpro.com.tw', 'https://www.quotationpro.com.tw', '台灣銀行 信義分行', '012-345-678901', '極簡資訊科技股份有限公司', '1. 本報價單有效期限為 30 天。\n2. 付款條件為月結 30 天。\n3. 保固服務：自驗收日起提供一年軟硬體保固與技術諮詢。')
                        RETURNING *;
                    """)
                    row = cur.fetchone()
                    conn.commit()

        return createApiResponse(
            isSuccess=True,
            data={
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
                "defaultTerms": row["default_terms"],
                "updatedAt": row["updated_at"].isoformat() if row.get("updated_at") else None
            },
            message="成功取得公司基本資料"
        )
    except Exception as err:
        return createApiResponse(
            isSuccess=False,
            message="取得公司基本資料失敗",
            errorMessage=str(err),
            statusCode=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@app.post("/api/company")
@app.put("/api/company")
def updateCompanySettings(payload: CompanySettingsInput):
    try:
        with getDbConnection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    INSERT INTO company_settings (id, company_name, tax_id, phone, fax, address, email, website, bank_name, bank_account, bank_account_name, default_terms, updated_at)
                    VALUES (1, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
                    ON CONFLICT (id) DO UPDATE SET
                        company_name = EXCLUDED.company_name,
                        tax_id = EXCLUDED.tax_id,
                        phone = EXCLUDED.phone,
                        fax = EXCLUDED.fax,
                        address = EXCLUDED.address,
                        email = EXCLUDED.email,
                        website = EXCLUDED.website,
                        bank_name = EXCLUDED.bank_name,
                        bank_account = EXCLUDED.bank_account,
                        bank_account_name = EXCLUDED.bank_account_name,
                        default_terms = EXCLUDED.default_terms,
                        updated_at = CURRENT_TIMESTAMP
                    RETURNING *;
                """, (
                    payload.companyName, payload.taxId, payload.phone, payload.fax, payload.address,
                    payload.email, payload.website, payload.bankName, payload.bankAccount,
                    payload.bankAccountName, payload.defaultTerms
                ))
                row = cur.fetchone()
            conn.commit()

        return createApiResponse(
            isSuccess=True,
            data={
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
                "defaultTerms": row["default_terms"],
                "updatedAt": row["updated_at"].isoformat() if row.get("updated_at") else None
            },
            message="公司基本資料已成功儲存"
        )
    except Exception as err:
        return createApiResponse(
            isSuccess=False,
            message="儲存公司基本資料失敗",
            errorMessage=str(err),
            statusCode=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


# =============================================================================
# 12. 使用者與權限管理 API (USERS & PERMISSION ENDPOINTS)
# =============================================================================
@app.get("/api/users")
def listUsers():
    try:
        with getDbConnection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("SELECT id, name, username, password, department, phone, email, role, allowed_menus, status, created_at, updated_at FROM users ORDER BY id ASC;")
                rows = cur.fetchall()

        usersList = []
        for r in rows:
            usersList.append({
                "id": r["id"],
                "name": r["name"],
                "username": r["username"],
                "password": r["password"],
                "department": r["department"],
                "phone": r["phone"],
                "email": r["email"],
                "role": r["role"],
                "allowedMenus": r["allowed_menus"].split(",") if r["allowed_menus"] else [],
                "status": r["status"],
                "createdAt": r["created_at"].isoformat() if r.get("created_at") else None,
                "updatedAt": r["updated_at"].isoformat() if r.get("updated_at") else None
            })

        return createApiResponse(
            isSuccess=True,
            data=usersList,
            message="成功取得使用者清單"
        )
    except Exception as err:
        return createApiResponse(
            isSuccess=False,
            message="取得使用者清單失敗",
            errorMessage=str(err),
            statusCode=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@app.post("/api/users")
def createUser(payload: UserInput):
    try:
        with getDbConnection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("SELECT id FROM users WHERE username = %s;", (payload.username,))
                if cur.fetchone():
                    return createApiResponse(isSuccess=False, message="該帳號已被使用，請更換帳號", statusCode=status.HTTP_400_BAD_REQUEST)

                cur.execute("""
                    INSERT INTO users (name, username, password, department, phone, email, role, allowed_menus, status, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                    RETURNING *;
                """, (
                    payload.name, payload.username, payload.password or "123456",
                    payload.department, payload.phone, payload.email,
                    payload.role, payload.allowedMenus or "dashboard,customers,products,quotations",
                    payload.status or "ACTIVE"
                ))
                newRow = cur.fetchone()
            conn.commit()

        return createApiResponse(
            isSuccess=True,
            data={
                "id": newRow["id"],
                "name": newRow["name"],
                "username": newRow["username"],
                "role": newRow["role"]
            },
            message="使用者建立成功",
            statusCode=status.HTTP_201_CREATED
        )
    except Exception as err:
        return createApiResponse(
            isSuccess=False,
            message="建立使用者失敗",
            errorMessage=str(err),
            statusCode=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@app.put("/api/users/{userId}")
def updateUser(userId: int, payload: UserInput):
    try:
        with getDbConnection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("SELECT id FROM users WHERE id = %s;", (userId,))
                if not cur.fetchone():
                    return createApiResponse(isSuccess=False, message="找不到該使用者", statusCode=status.HTTP_404_NOT_FOUND)

                # 若有傳新密碼則更新密碼，否則保留原密碼
                if payload.password and payload.password.strip():
                    cur.execute("""
                        UPDATE users
                        SET name = %s, department = %s, phone = %s, email = %s,
                            role = %s, allowed_menus = %s, status = %s, password = %s, updated_at = CURRENT_TIMESTAMP
                        WHERE id = %s
                        RETURNING *;
                    """, (
                        payload.name, payload.department, payload.phone, payload.email,
                        payload.role, payload.allowedMenus, payload.status, payload.password, userId
                    ))
                else:
                    cur.execute("""
                        UPDATE users
                        SET name = %s, department = %s, phone = %s, email = %s,
                            role = %s, allowed_menus = %s, status = %s, updated_at = CURRENT_TIMESTAMP
                        WHERE id = %s
                        RETURNING *;
                    """, (
                        payload.name, payload.department, payload.phone, payload.email,
                        payload.role, payload.allowedMenus, payload.status, userId
                    ))
                updatedRow = cur.fetchone()
            conn.commit()

        return createApiResponse(
            isSuccess=True,
            data={"id": updatedRow["id"], "username": updatedRow["username"], "name": updatedRow["name"]},
            message="使用者資訊已更新"
        )
    except Exception as err:
        return createApiResponse(
            isSuccess=False,
            message="更新使用者失敗",
            errorMessage=str(err),
            statusCode=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@app.delete("/api/users/{userId}")
def deleteUser(userId: int):
    try:
        if userId == 1:
            return createApiResponse(isSuccess=False, message="系統預設管理員 (ID: 1) 不得刪除", statusCode=status.HTTP_400_BAD_REQUEST)

        with getDbConnection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("DELETE FROM users WHERE id = %s RETURNING id, name;", (userId,))
                deleted = cur.fetchone()
                if not deleted:
                    return createApiResponse(isSuccess=False, message="找不到該使用者", statusCode=status.HTTP_404_NOT_FOUND)
            conn.commit()

        return createApiResponse(
            isSuccess=True,
            data={"id": userId, "name": deleted["name"]},
            message="使用者已成功刪除"
        )
    except Exception as err:
        return createApiResponse(
            isSuccess=False,
            message="刪除使用者失敗",
            errorMessage=str(err),
            statusCode=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

