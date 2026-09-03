-- ============================================================
-- 報價與訂單管理系統 - PostgreSQL 資料庫無損結構升級腳本
-- 執行說明：本腳本全面採用 IF NOT EXISTS，不會覆蓋或遺失現存任何資料。
-- ============================================================

-- 【1. 客戶資料表 (customers)】
ALTER TABLE customers ADD COLUMN IF NOT EXISTS tax_id VARCHAR(50);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS department VARCHAR(100);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS title VARCHAR(100);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS fax VARCHAR(50);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS shipping_address VARCHAR(500);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS payment_terms VARCHAR(100);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS industry VARCHAR(100);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS created_by VARCHAR(100);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS updated_by VARCHAR(100);

-- 【2. 使用者與帳號權限表 (users)】
ALTER TABLE users ADD COLUMN IF NOT EXISTS title VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS department VARCHAR(100) DEFAULT '業務部';
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS allowed_menus TEXT DEFAULT 'dashboard,customers,vendors,products,quotations,transactions,company,users,auditLogs';
ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'ACTIVE';
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_by VARCHAR(100);

-- 【3. 產品與料號管理表 (products)】
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand VARCHAR(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS model VARCHAR(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS vendor VARCHAR(255);
ALTER TABLE products ADD COLUMN IF NOT EXISTS vendor_id INTEGER;
ALTER TABLE products ADD COLUMN IF NOT EXISTS image TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS created_by VARCHAR(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_by VARCHAR(100);

-- 【4. 報價單主表 (quotations)】
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

-- 【5. 報價單品項明細表 (quotation_items)】
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS item_number INTEGER DEFAULT 1;
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS specifications TEXT;
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS unit VARCHAR(20) DEFAULT '件';
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS cost_price NUMERIC(12, 2) DEFAULT 0.00;
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS subtotal NUMERIC(12, 2) DEFAULT 0.00;
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS notes TEXT;

-- 【6. 交易與款項管理表 (transactions)】
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS cost_price NUMERIC(12, 2) DEFAULT 0.00;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(12, 2) DEFAULT 0.00;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS created_by VARCHAR(100);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS updated_by VARCHAR(100);

-- 【7. 稽核紀錄表 (audit_logs)】
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

-- 【8. 發票明細記錄表 (transaction_invoices)】
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
