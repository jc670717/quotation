-- =============================================================================
-- 企業級報價與商務管理系統 - PostgreSQL 資料庫完整綱要 (Complete Schema)
-- 適用環境: Vercel Postgres / Neon / AWS RDS / Supabase / 本地 PostgreSQL
-- =============================================================================

BEGIN;

-- 1. 客戶資料表 (customers)
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

-- 2. 供應商/廠商資料表 (vendors)
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

-- 3. 產品/服務資料表 (products)
CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    product_code VARCHAR(50) UNIQUE,
    product_name VARCHAR(255) NOT NULL,
    category VARCHAR(100) DEFAULT '一般商品',
    brand VARCHAR(100),
    model VARCHAR(100),
    vendor VARCHAR(255),
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

-- 4. 報價公司基本資料 (companies)
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

-- 相容性別名表 (company_settings)
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

-- 5. 系統使用者與權限表 (users)
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

-- 6. 報價單主檔 (quotations)
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

-- 7. 報價單明細項目 (quotation_items)
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

-- 8. 交易訂單管理檔 (transactions)
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

-- 9. 交易發票明細 (transaction_invoices)
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

-- 10. 操作修改歷程審計日誌 (audit_logs)
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

-- -----------------------------------------------------------------------------
-- 索引建立 (Indexes)
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_customers_code ON customers(customer_code);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(customer_name);
CREATE INDEX IF NOT EXISTS idx_vendors_code ON vendors(vendor_code);
CREATE INDEX IF NOT EXISTS idx_vendors_name ON vendors(vendor_name);
CREATE INDEX IF NOT EXISTS idx_products_code ON products(product_code);
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
CREATE INDEX IF NOT EXISTS idx_audit_logs_module ON audit_logs(module);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_tax_id_not_blank ON customers (tax_id) WHERE tax_id IS NOT NULL AND btrim(tax_id) <> '';
CREATE UNIQUE INDEX IF NOT EXISTS uq_vendors_tax_id_not_blank ON vendors (tax_id) WHERE tax_id IS NOT NULL AND btrim(tax_id) <> '';
CREATE UNIQUE INDEX IF NOT EXISTS uq_products_model_not_blank ON products (model) WHERE model IS NOT NULL AND btrim(model) <> '';

-- -----------------------------------------------------------------------------
-- 預設初始資料 (Default Master Seed)
-- -----------------------------------------------------------------------------
INSERT INTO companies (id, company_name, tax_id, phone, fax, address, email, website, bank_name, bank_account, bank_account_name, contact_person, contact_phone, contact_email, is_default, default_terms)
VALUES 
(1, '宏碁資訊科技有限公司', '28491023', '(02) 2789-0123', '(02) 2789-0124', '台北市南港區園區街 3-1 號 8 樓', 'contact@acer-info.com.tw', 'https://www.acer-info.com.tw', '台灣銀行 南港分行', '012-345-678901', '宏碁資訊科技有限公司', '王總監', '(02) 2789-0123 #101', 'director.wang@acer-info.com.tw', TRUE, '1. 本報價單有效期限為 30 天。\n2. 付款條件：月結 30 天電匯。\n3. 保固服務：提供一年 8x5 到府維護與技術支援。'),
(2, '創聯數位創新顧問股份有限公司', '54321987', '(02) 2345-6789', '(02) 2345-6780', '台北市信義區松仁路 100 號 18 樓', 'contact@innovate-cloud.com.tw', 'https://www.innovate-cloud.com.tw', '國泰世華銀行 敦南分行', '013-888-999123', '創聯數位創新顧問股份有限公司', '陳執行長', '(02) 2345-6789 #888', 'ceo@innovate-cloud.com.tw', FALSE, '1. 報價單有效期限為 15 天。\n2. 專案導入款：簽約 30%，驗收 70%。')
ON CONFLICT (id) DO NOTHING;

INSERT INTO users (id, name, username, password, department, phone, email, role, allowed_menus, status)
VALUES
(1, '系統管理者 (Architect)', 'admin', 'admin888', '資訊管理部', '(02) 2789-0123 #101', 'admin@acer-info.com.tw', 'ADMIN', 'dashboard,customers,vendors,products,quotations,transactions,company,users,auditLogs', 'ACTIVE'),
(2, '陳大明 (業務經理)', 'sales_chen', 'user123', '業務一部', '(02) 2789-0123 #201', 'daming.chen@acer-info.com.tw', 'USER', 'dashboard,customers,vendors,products,quotations,transactions', 'ACTIVE'),
(3, '林小花 (業務助理)', 'sales_lin', 'user123', '業務支援部', '(02) 2789-0123 #202', 'xiaohua.lin@acer-info.com.tw', 'USER', 'dashboard,customers,quotations', 'ACTIVE'),
(4, '張淑芬 (財務會計)', 'finance_wang', 'user123', '財務會計部', '(02) 2789-0123 #301', 'finance@acer-info.com.tw', 'USER', 'quotations,transactions', 'ACTIVE')
ON CONFLICT (id) DO NOTHING;

INSERT INTO customers (id, customer_code, customer_name, tax_id, contact_person, email, phone, address, shipping_address, payment_terms, industry)
VALUES
(1, 'CUST-001', '台積電子股份有限公司', '22099131', '林志遠 (技術處長)', 'chihyuan.lin@tsmc-demo.com.tw', '(03) 578-1234 #501', '新竹市科學園區力行六路 8 號', '新竹科學園區 12 廠 庫房', '月結 45 天電匯', '半導體製造'),
(2, 'CUST-002', '聯發科技創新研發中心', '84149961', '陳雅婷 (資安主管)', 'yating.chen@mediatek-demo.com.tw', '(03) 567-8888 #882', '新竹市科學園區篤行一路 1 號', '新竹科學園區研發大樓 B 棟', 'IC 設計研發', 'IC 設計與通訊晶片'),
(3, 'CUST-003', '國泰金控數位轉型辦公室', '03723321', '王志明 (採購經理)', 'jimmy.wang@cathay-demo.com.tw', '(02) 2755-1399 #312', '台北市信義區仁愛路四段 295 號 12 樓', '台北市信義區仁愛路四段 295 號 7 樓 資訊處', '月結 30 天電匯', '金融保險')
ON CONFLICT (id) DO NOTHING;

INSERT INTO vendors (id, vendor_code, vendor_name, tax_id, contact_person, phone, email, address, products_services)
VALUES
(1, 'VEND-001', '聯強國際股份有限公司', '22098765', '黃經理', '(02) 2506-3320', 'sales@synnex.com.tw', '台北市中山區民生東路三段 75 號', '伺服器主機、儲存設備、微軟授權軟體'),
(2, 'VEND-002', '零壹科技股份有限公司', '84123456', '張專員', '(02) 2656-5656', 'order@zerone.com.tw', '台北市內湖區行善路 398 號 6 樓', '網路資安設備、次世代防火牆、交換器')
ON CONFLICT (id) DO NOTHING;

INSERT INTO products (id, product_code, product_name, category, brand, model, vendor, unit, unit_price, cost_price, stock_quantity, description, status)
VALUES
(1, 'PROD-001', '企業級伺服器主機 Pro R750', '伺服器硬體', 'Dell EMC', 'PowerEdge R750', '聯強國際', '台', 140000.00, 90000.00, 15, 'Intel Xeon Silver 4314, 64GB DDR4 ECC, 2x 960GB NVMe SSD, 雙冗餘電源，含 3 年 7x24 到府保固', 'ACTIVE'),
(2, 'PROD-002', '雲端 HA 架構部署與資料庫移轉服務', '專業諮詢服務', 'Cloud Native', 'HA-PostgreSQL', '自有服務', '式', 100000.00, 65000.00, 50, '含 PostgreSQL 主從架構設定、自動容錯移轉與連線負載平衡規劃 (40 人天顧問施工)', 'ACTIVE'),
(3, 'PROD-003', '次世代硬體防火牆 FortiGate 100F', '網路資安', 'Fortinet', 'FG-100F', '零壹科技', '台', 125000.00, 75000.00, 8, '22x GE RJ45, 4x 10GE SFP+ 插槽, 包含 1 年 UTP 全功能防護授權服務', 'ACTIVE'),
(4, 'PROD-004', '年度企業資安弱點掃描與滲透測試顧問服務', '專業諮詢服務', 'CyberSec', 'Pentest-Enterprise', '自有服務', '次', 100000.00, 60000.00, 30, '涵蓋 10 組對外 IP 與 3 套主要 Web 商業系統弱點檢測與修補建議書', 'ACTIVE'),
(5, 'PROD-005', '企業級 Wi-Fi 6 無線基地台 AP-555', '網路設備', 'Aruba', 'AP-555', '零壹科技', '台', 135000.00, 8500.00, 40, '802.11ax 雙頻 4x4:4 MU-MIMO, 支援 PoE+ 供電與集中控制器管理', 'ACTIVE')
ON CONFLICT (id) DO NOTHING;

COMMIT;
