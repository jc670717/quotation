import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, Plugin } from 'vite';

// 本地開發預覽用 Mock API (支援 客戶管理、產品管理、報價單管理、交易管理 4 大項目)
function devApiPlugin(): Plugin {
  let customers: any[] = [
    {
      id: 1,
      customerCode: 'CUST-001',
      customerName: '恆星科技 (Star Tech)',
      contactPerson: '陳經理',
      email: 'service@startech.tw',
      phone: '02-27891234',
      address: '台北市南港區軟體園區二期 F 棟 8 樓',
      taxId: '28475912',
      notes: '核心大客戶，專注於雲端架構與 IaC 搬遷專案。',
      totalQuotations: 2,
      totalTransactions: 1,
      createdAt: '2026-08-01T08:00:00Z',
      updatedAt: '2026-08-24T08:00:00Z'
    },
    {
      id: 2,
      customerCode: 'CUST-002',
      customerName: '頂尖貿易股份有限公司',
      contactPerson: '林總監',
      email: 'sales@apex-trade.com.tw',
      phone: '04-23567890',
      address: '台中市西屯區台灣大道三段 100 號',
      taxId: '54879613',
      notes: '進出口批發商，進銷存 API 串接授權客戶。',
      totalQuotations: 1,
      totalTransactions: 1,
      createdAt: '2026-08-05T10:00:00Z',
      updatedAt: '2026-08-23T10:00:00Z'
    },
    {
      id: 3,
      customerCode: 'CUST-003',
      customerName: '極簡室內設計',
      contactPerson: '張設計師',
      email: 'design@minimalstudio.com',
      phone: '02-87654321',
      address: '台北市大安區敦化南路一段 233 巷 12 號',
      taxId: '89541236',
      notes: '品牌官方網站重構專案合作中。',
      totalQuotations: 1,
      totalTransactions: 0,
      createdAt: '2026-08-10T14:30:00Z',
      updatedAt: '2026-08-23T14:30:00Z'
    },
    {
      id: 4,
      customerCode: 'CUST-004',
      customerName: '雲端物流系統',
      contactPerson: '李協理',
      email: 'ops@cloudlogistics.io',
      phone: '07-3338888',
      address: '高雄市前鎮區成功二路 25 號 6 樓',
      taxId: '76123498',
      notes: '月租訂閱制方案客戶，即時物流路線追蹤 SDK。',
      totalQuotations: 1,
      totalTransactions: 1,
      createdAt: '2026-08-15T09:00:00Z',
      updatedAt: '2026-08-22T09:00:00Z'
    },
    {
      id: 5,
      customerCode: 'CUST-005',
      customerName: '聯發科技股份有限公司',
      contactPerson: '黃副總',
      email: 'contact@mediatek.com',
      phone: '03-5670788',
      address: '新竹科學園區篤行一路 1 號',
      taxId: '12345678',
      notes: '半導體設計巨頭，企業級私有雲系統與顧問服務。',
      totalQuotations: 1,
      totalTransactions: 0,
      createdAt: '2026-08-18T08:00:00Z',
      updatedAt: '2026-08-20T08:00:00Z'
    }
  ];

  let products: any[] = [
    {
      id: 1,
      productCode: 'PRD-CLOUD-01',
      productName: '次世代雲端混合架構建置與搬遷顧問',
      category: '雲端顧問',
      unit: '專案',
      unitPrice: 280000,
      costPrice: 150000,
      stockQuantity: 99,
      description: '包含 Terraform IaC 自動化腳本與多區域容災方案設計',
      status: 'ACTIVE',
      createdAt: '2026-08-01T08:00:00Z'
    },
    {
      id: 2,
      productCode: 'PRD-DB-02',
      productName: 'PostgreSQL 高可用叢集連線池最佳化服務',
      category: '資料庫工程',
      unit: '套',
      unitPrice: 148571,
      costPrice: 70000,
      stockQuantity: 50,
      description: '含讀寫分離、PgBouncer 部署、連線池監控與自動容錯移轉',
      status: 'ACTIVE',
      createdAt: '2026-08-02T08:00:00Z'
    },
    {
      id: 3,
      productCode: 'PRD-API-03',
      productName: '進出口進銷存系統 API 串接授權模組',
      category: '軟體授權',
      unit: '套',
      unitPrice: 27143,
      costPrice: 5000,
      stockQuantity: 200,
      description: '提供 RESTful API 與 Webhook 自動拋轉訂單資料庫',
      status: 'ACTIVE',
      createdAt: '2026-08-03T08:00:00Z'
    },
    {
      id: 4,
      productCode: 'PRD-WEB-04',
      productName: '品牌官方網站視覺重構與 RWD 切版',
      category: '網頁開發',
      unit: '專案',
      unitPrice: 106667,
      costPrice: 40000,
      stockQuantity: 20,
      description: '符合 WCAG AA 無障礙標準與現代極簡設計規範，全響應式適配',
      status: 'ACTIVE',
      createdAt: '2026-08-04T08:00:00Z'
    },
    {
      id: 5,
      productCode: 'PRD-SDK-05',
      productName: '即時物流路線追蹤 SDK 訂閱',
      category: 'SaaS 訂閱',
      unit: '月',
      unitPrice: 8476,
      costPrice: 1000,
      stockQuantity: 999,
      description: '月度基本存取配額 50,000 次請求，高精度 GPS 即時路線演算',
      status: 'ACTIVE',
      createdAt: '2026-08-05T08:00:00Z'
    },
    {
      id: 6,
      productCode: 'PRD-SEC-06',
      productName: '企業級資安合規性稽核與滲透測試',
      category: '資安服務',
      unit: '次',
      unitPrice: 160000,
      costPrice: 80000,
      stockQuantity: 30,
      description: '包含 OWASP Top 10 檢測、原始碼靜態弱點掃描與修補報告',
      status: 'ACTIVE',
      createdAt: '2026-08-06T08:00:00Z'
    }
  ];

  let quotations: any[] = [
    {
      id: 1,
      quotationNumber: 'QT-20260830-01',
      customerId: 1,
      customerName: '恆星科技 (Star Tech)',
      customerTaxId: '88996677',
      customerContactPerson: '張總經理',
      customerEmail: 'service@startech.tw',
      customerPhone: '02-27891234',
      customerAddress: '台北市內湖區瑞光路 588 號 8 樓',
      issueDate: '2026-08-24',
      expiryDate: '2026-09-24',
      status: 'ACCEPTED',
      subtotal: 428571,
      taxRate: 5,
      taxAmount: 21429,
      totalAmount: 450000,
      notes: '1. 本報價單有效期限為 30 天。\n2. 包含雲端架構部署、安全性測試與 24/7 技術支援。',
      createdAt: '2026-08-24T08:00:00Z',
      updatedAt: '2026-08-24T08:00:00Z',
      items: [
        {
          id: 1,
          quotationId: 1,
          productId: 1,
          itemName: '次世代雲端混合架構建置與搬遷顧問',
          description: '包含 Terraform IaC 自動化腳本與多區域容災方案',
          quantity: 1,
          unitPrice: 280000,
          lineTotal: 280000,
          sortOrder: 0
        },
        {
          id: 2,
          quotationId: 1,
          productId: 2,
          itemName: 'PostgreSQL 高可用叢集連線池最佳化服務',
          description: '含讀寫分離、PgBouncer 部署與自動容錯移轉',
          quantity: 1,
          unitPrice: 148571,
          lineTotal: 148571,
          sortOrder: 1
        }
      ]
    },
    {
      id: 2,
      quotationNumber: 'QT-20260830-02',
      customerId: 2,
      customerName: '頂尖貿易股份有限公司',
      customerTaxId: '54321987',
      customerContactPerson: '林特助',
      customerEmail: 'sales@apex-trade.com.tw',
      customerPhone: '04-23567890',
      customerAddress: '台中市西屯區台灣大道三段 99 號',
      issueDate: '2026-08-23',
      expiryDate: '2026-09-23',
      status: 'ACCEPTED',
      subtotal: 27143,
      taxRate: 5,
      taxAmount: 1357,
      totalAmount: 28500,
      notes: '付款條件：簽約後 14 日內電匯支付。',
      createdAt: '2026-08-23T10:00:00Z',
      updatedAt: '2026-08-23T10:00:00Z',
      items: [
        {
          id: 3,
          quotationId: 2,
          productId: 3,
          itemName: '進出口進銷存系統 API 串接授權模組',
          description: '提供 RESTful API 與 Webhook 自動拋轉訂單',
          quantity: 1,
          unitPrice: 27143,
          lineTotal: 27143,
          sortOrder: 0
        }
      ]
    },
    {
      id: 3,
      quotationNumber: 'QT-20260830-03',
      customerId: 3,
      customerName: '極簡室內設計',
      customerTaxId: '',
      customerContactPerson: '王總監',
      customerEmail: 'design@minimalstudio.com',
      customerPhone: '02-87654321',
      customerAddress: '新北市板橋區縣民大道二段 10 號',
      issueDate: '2026-08-23',
      expiryDate: '2026-09-20',
      status: 'DRAFT',
      subtotal: 106667,
      taxRate: 5,
      taxAmount: 5333,
      totalAmount: 112000,
      notes: '草稿備註：尚待客戶確認 3D 渲染圖輸出規格。',
      createdAt: '2026-08-23T14:30:00Z',
      updatedAt: '2026-08-23T14:30:00Z',
      items: [
        {
          id: 4,
          quotationId: 3,
          productId: 4,
          itemName: '品牌官方網站視覺重構與 RWD 切版',
          description: '符合 WCAG AA 無障礙標準與現代極簡設計規範',
          quantity: 1,
          unitPrice: 106667,
          lineTotal: 106667,
          sortOrder: 0
        }
      ]
    },
    {
      id: 4,
      quotationNumber: 'QT-20260830-04',
      customerId: 4,
      customerName: '雲端物流系統',
      customerTaxId: '76123498',
      customerContactPerson: '李協理',
      customerEmail: 'ops@cloudlogistics.io',
      customerPhone: '07-3338888',
      customerAddress: '高雄市前鎮區成功二路 25 號 6 樓',
      issueDate: '2026-08-22',
      expiryDate: '2026-09-22',
      status: 'ACCEPTED',
      subtotal: 8476,
      taxRate: 5,
      taxAmount: 424,
      totalAmount: 8900,
      notes: '月租訂閱制方案，首月優惠計價。',
      createdAt: '2026-08-22T09:00:00Z',
      updatedAt: '2026-08-22T09:00:00Z',
      items: [
        {
          id: 5,
          quotationId: 4,
          productId: 5,
          itemName: '即時物流路線追蹤 SDK 訂閱',
          description: '月度基本存取配額 50,000 次請求',
          quantity: 1,
          unitPrice: 8476,
          lineTotal: 8476,
          sortOrder: 0
        }
      ]
    },
    {
      id: 5,
      quotationNumber: 'QT-20260830-05',
      customerId: 5,
      customerName: '聯發科技股份有限公司',
      customerTaxId: '12345678',
      customerContactPerson: '黃副總',
      customerEmail: 'contact@mediatek.com',
      customerPhone: '03-5670788',
      customerAddress: '新竹科學園區篤行一路 1 號',
      issueDate: '2026-08-20',
      expiryDate: '2026-09-20',
      status: 'SENT',
      subtotal: 120000,
      taxRate: 5,
      taxAmount: 6000,
      totalAmount: 126000,
      notes: '1. 本報價單有效期限 30 天。\n2. 包含一年標準技術支援與維護保固。',
      createdAt: '2026-08-20T08:00:00Z',
      updatedAt: '2026-08-20T08:00:00Z',
      items: [
        {
          id: 6,
          quotationId: 5,
          productId: 1,
          itemName: '企業級私有雲系統架構規劃與顧問諮詢',
          description: '含高可用性架構設計、安全性檢測與合規性稽核',
          quantity: 1,
          unitPrice: 80000,
          lineTotal: 80000,
          sortOrder: 0
        },
        {
          id: 7,
          quotationId: 5,
          productId: 2,
          itemName: '微服務 API 模組開發與效能優化',
          description: 'FastAPI + PostgreSQL 連線池調校與自動化壓力測試',
          quantity: 2,
          unitPrice: 20000,
          lineTotal: 40000,
          sortOrder: 1
        }
      ]
    }
  ];

  let transactions: any[] = [
    {
      id: 1,
      transactionNumber: 'TX-20260830-01',
      quotationId: 1,
      quotationNumber: 'QT-20260830-01',
      customerName: '恆星科技 (Star Tech)',
      customerEmail: 'service@startech.tw',
      transactionDate: '2026-08-25',
      totalAmount: 450000,
      costPrice: 220000,
      paidAmount: 450000,
      remainingAmount: 0,
      grossProfit: 230000,
      grossMargin: 51.1,
      paymentMethod: '電匯 (Wire Transfer)',
      paymentStatus: 'PAID',
      fulfillmentStatus: 'COMPLETED',
      notes: '訂金與尾款已於 8/25 結清，雲端遷移工程已完成交付驗收。',
      createdBy: '系統管理者 (Architect)',
      updatedBy: '系統管理者 (Architect)',
      invoices: [
        {
          id: 1,
          invoiceNumber: 'AA-89561234',
          invoiceDate: '2026-08-20',
          amount: 135000,
          status: 'PAID',
          notes: '第一期訂金發票 (30%)',
          createdBy: '系統管理者 (Architect)',
          updatedBy: '系統管理者 (Architect)',
          createdAt: '2026-08-20T09:00:00Z',
          updatedAt: '2026-08-20T09:00:00Z'
        },
        {
          id: 2,
          invoiceNumber: 'AA-89561288',
          invoiceDate: '2026-08-25',
          amount: 315000,
          status: 'PAID',
          notes: '第二期尾款驗收發票 (70%)',
          createdBy: '系統管理者 (Architect)',
          updatedBy: '系統管理者 (Architect)',
          createdAt: '2026-08-25T10:30:00Z',
          updatedAt: '2026-08-25T10:30:00Z'
        }
      ],
      createdAt: '2026-08-25T11:00:00Z',
      updatedAt: '2026-08-25T11:00:00Z'
    },
    {
      id: 2,
      transactionNumber: 'TX-20260830-02',
      quotationId: 2,
      quotationNumber: 'QT-20260830-02',
      customerName: '頂尖貿易股份有限公司',
      customerEmail: 'sales@apex-trade.com.tw',
      transactionDate: '2026-08-26',
      totalAmount: 28500,
      costPrice: 5000,
      paidAmount: 28500,
      remainingAmount: 0,
      grossProfit: 23500,
      grossMargin: 82.5,
      paymentMethod: '電匯 (Wire Transfer)',
      paymentStatus: 'PAID',
      fulfillmentStatus: 'COMPLETED',
      notes: '授權金已入帳，已發送 API Key 與串接文檔。',
      createdBy: '陳大明 (業務經理)',
      updatedBy: '陳大明 (業務經理)',
      invoices: [
        {
          id: 3,
          invoiceNumber: 'AB-10293847',
          invoiceDate: '2026-08-26',
          amount: 28500,
          status: 'PAID',
          notes: '進銷存 API 授權全額發票',
          createdBy: '陳大明 (業務經理)',
          updatedBy: '陳大明 (業務經理)',
          createdAt: '2026-08-26T14:00:00Z',
          updatedAt: '2026-08-26T14:00:00Z'
        }
      ],
      createdAt: '2026-08-26T14:20:00Z',
      updatedAt: '2026-08-26T14:20:00Z'
    },
    {
      id: 3,
      transactionNumber: 'TX-20260830-03',
      quotationId: 4,
      quotationNumber: 'QT-20260830-04',
      customerName: '雲端物流系統',
      customerEmail: 'ops@cloudlogistics.io',
      transactionDate: '2026-08-27',
      totalAmount: 8900,
      costPrice: 1500,
      paidAmount: 4000,
      remainingAmount: 4900,
      grossProfit: 7400,
      grossMargin: 83.1,
      paymentMethod: '信用卡 (Credit Card)',
      paymentStatus: 'PARTIAL',
      fulfillmentStatus: 'PROCESSING',
      notes: '8 月份 SDK 訂閱首期已扣款，次期預計下週請款。',
      createdBy: '陳大明 (業務經理)',
      updatedBy: '陳大明 (業務經理)',
      invoices: [
        {
          id: 4,
          invoiceNumber: 'AC-55667788',
          invoiceDate: '2026-08-27',
          amount: 4000,
          status: 'PAID',
          notes: '首期扣款發票',
          createdBy: '陳大明 (業務經理)',
          updatedBy: '陳大明 (業務經理)',
          createdAt: '2026-08-27T09:00:00Z',
          updatedAt: '2026-08-27T09:00:00Z'
        },
        {
          id: 5,
          invoiceNumber: 'AC-55667799',
          invoiceDate: '2026-08-28',
          amount: 4900,
          status: 'PENDING',
          notes: '次期待付發票',
          createdBy: '陳大明 (業務經理)',
          updatedBy: '陳大明 (業務經理)',
          createdAt: '2026-08-28T10:00:00Z',
          updatedAt: '2026-08-28T10:00:00Z'
        }
      ],
      createdAt: '2026-08-27T09:15:00Z',
      updatedAt: '2026-08-27T09:15:00Z'
    }
  ];

  let companySettings = {
    id: 1,
    companyName: '極簡資訊科技股份有限公司',
    taxId: '28491023',
    phone: '(02) 2345-6789',
    fax: '(02) 2345-6780',
    address: '台北市信義區松仁路 100 號 18 樓',
    email: 'contact@quotationpro.com.tw',
    website: 'https://www.quotationpro.com.tw',
    bankName: '台灣銀行 信義分行',
    bankAccount: '012-345-678901',
    bankAccountName: '極簡資訊科技股份有限公司',
    defaultTerms: '1. 本報價單有效期限為 30 天。\n2. 付款條件為月結 30 天。\n3. 保固服務：自驗收日起提供一年軟硬體保固與技術諮詢。',
    updatedAt: new Date().toISOString()
  };

  let users: any[] = [
    {
      id: 1,
      name: '系統管理者 (Architect)',
      username: 'admin',
      password: 'admin888',
      department: '資訊管理部',
      phone: '(02) 2345-6789 #101',
      email: 'admin@quotationpro.com.tw',
      role: 'ADMIN',
      allowedMenus: ['dashboard', 'customers', 'products', 'quotations', 'transactions', 'company', 'users'],
      status: 'ACTIVE',
      createdAt: '2026-08-01T08:00:00Z',
      updatedAt: '2026-08-24T08:00:00Z'
    },
    {
      id: 2,
      name: '陳大明 (業務經理)',
      username: 'sales_chen',
      password: 'user123',
      department: '業務一部',
      phone: '(02) 2345-6789 #201',
      email: 'chen@quotationpro.com.tw',
      role: 'USER',
      allowedMenus: ['dashboard', 'customers', 'products', 'quotations', 'transactions'],
      status: 'ACTIVE',
      createdAt: '2026-08-05T10:00:00Z',
      updatedAt: '2026-08-23T10:00:00Z'
    },
    {
      id: 3,
      name: '林小花 (業務助理)',
      username: 'sales_lin',
      password: 'user123',
      department: '業務支援部',
      phone: '(02) 2345-6789 #202',
      email: 'lin@quotationpro.com.tw',
      role: 'USER',
      allowedMenus: ['dashboard', 'customers', 'quotations'],
      status: 'ACTIVE',
      createdAt: '2026-08-10T14:30:00Z',
      updatedAt: '2026-08-23T14:30:00Z'
    }
  ];

  return {
    name: 'dev-api-mock',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url || '';
        if (!url.startsWith('/api')) {
          return next();
        }

        res.setHeader('Content-Type', 'application/json');

        // Helper to parse JSON body
        const getBody = () => new Promise<any>((resolve) => {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try { resolve(body ? JSON.parse(body) : {}); }
            catch { resolve({}); }
          });
        });

        // 1. Health check
        if (url === '/api/health') {
          res.end(JSON.stringify({
            success: true,
            data: { status: 'healthy', isDevMock: true, timestamp: new Date().toISOString() },
            message: '開發環境預覽服務運行中',
            error: null,
            pagination: null
          }));
          return;
        }

        // 2. Metrics / Dashboard
        if (url === '/api/metrics') {
          const totalQuotationAmount = quotations.reduce((acc, q) => acc + (q.totalAmount || 0), 0);
          const totalTransactionAmount = transactions.filter(t => t.paymentStatus === 'PAID').reduce((acc, t) => acc + (t.totalAmount || 0), 0);
          const pendingQuotations = quotations.filter(q => q.status === 'SENT' || q.status === 'DRAFT').length;
          const acceptedQuotations = quotations.filter(q => q.status === 'ACCEPTED').length;
          const conversionRate = quotations.length > 0 ? ((acceptedQuotations / quotations.length) * 100).toFixed(1) : '0.0';

          const statusCounts = {
            DRAFT: quotations.filter(q => q.status === 'DRAFT').length,
            SENT: quotations.filter(q => q.status === 'SENT').length,
            ACCEPTED: quotations.filter(q => q.status === 'ACCEPTED').length,
            REJECTED: quotations.filter(q => q.status === 'REJECTED').length,
            EXPIRED: quotations.filter(q => q.status === 'EXPIRED').length,
          };

          res.end(JSON.stringify({
            success: true,
            data: {
              totalCustomers: customers.length,
              totalProducts: products.length,
              totalQuotations: quotations.length,
              totalTransactions: transactions.length,
              totalQuotationAmount,
              totalTransactionAmount,
              pendingQuotations,
              acceptedQuotations,
              conversionRate: parseFloat(conversionRate),
              averageQuotationAmount: quotations.length > 0 ? Math.round(totalQuotationAmount / quotations.length) : 0,
              statusCounts
            },
            message: '成功取得系統核心指標'
          }));
          return;
        }

        // 3. Init DB
        if (url === '/api/init-db' && req.method === 'POST') {
          res.end(JSON.stringify({
            success: true,
            data: null,
            message: '資料庫 Schema 初始化成功 (預覽環境)！',
            error: null,
            pagination: null
          }));
          return;
        }

        // ==========================================
        // CUSTOMERS API (/api/customers)
        // ==========================================
        if (url.startsWith('/api/customers')) {
          const parsedUrl = new URL(url, 'http://localhost:3000');
          const idMatch = url.match(/\/api\/customers\/(\d+)/);
          const customerId = idMatch ? parseInt(idMatch[1], 10) : null;

          // GET /api/customers/:id
          if (customerId && req.method === 'GET') {
            const customer = customers.find(c => c.id === customerId);
            if (!customer) {
              res.statusCode = 404;
              res.end(JSON.stringify({ success: false, data: null, message: '找不到該客戶' }));
              return;
            }
            res.end(JSON.stringify({ success: true, data: customer, message: '成功取得客戶資料' }));
            return;
          }

          // PUT /api/customers/:id
          if (customerId && req.method === 'PUT') {
            const payload = await getBody();
            const targetIdx = customers.findIndex(c => c.id === customerId);
            if (targetIdx === -1) {
              res.statusCode = 404;
              res.end(JSON.stringify({ success: false, data: null, message: '找不到該客戶' }));
              return;
            }
            customers[targetIdx] = {
              ...customers[targetIdx],
              customerCode: payload.customerCode || customers[targetIdx].customerCode,
              customerName: payload.customerName || customers[targetIdx].customerName,
              contactPerson: payload.contactPerson || '',
              email: payload.email || '',
              phone: payload.phone || '',
              address: payload.address || '',
              shippingAddress: payload.shippingAddress || '',
              paymentTerms: payload.paymentTerms || '',
              taxId: payload.taxId || '',
              notes: payload.notes || '',
              updatedAt: new Date().toISOString()
            };
            res.end(JSON.stringify({ success: true, data: customers[targetIdx], message: '客戶資料更新成功' }));
            return;
          }

          // DELETE /api/customers/:id
          if (customerId && req.method === 'DELETE') {
            const target = customers.find(c => c.id === customerId);
            if (!target) {
              res.statusCode = 404;
              res.end(JSON.stringify({ success: false, data: null, message: '找不到該客戶' }));
              return;
            }
            customers = customers.filter(c => c.id !== customerId);
            res.end(JSON.stringify({ success: true, data: { id: customerId }, message: '客戶已刪除' }));
            return;
          }

          // GET /api/customers (List & Search)
          if (req.method === 'GET') {
            const search = (parsedUrl.searchParams.get('search') || '').toLowerCase().trim();
            let filtered = customers.filter(c => {
              if (!search) return true;
              return (
                (c.customerName || '').toLowerCase().includes(search) ||
                (c.customerCode || '').toLowerCase().includes(search) ||
                (c.contactPerson || '').toLowerCase().includes(search) ||
                (c.phone || '').includes(search) ||
                (c.email || '').toLowerCase().includes(search)
              );
            });
            res.end(JSON.stringify({
              success: true,
              data: filtered,
              message: '成功取得客戶清單',
              pagination: { totalRecords: filtered.length }
            }));
            return;
          }

          // POST /api/customers (Create)
          if (req.method === 'POST') {
            const payload = await getBody();
            const newId = customers.length > 0 ? Math.max(...customers.map(c => c.id)) + 1 : 1;
            const newCode = payload.customerCode || `CUST-${String(newId).padStart(3, '0')}`;
            const newCustomer = {
              id: newId,
              customerCode: newCode,
              customerName: payload.customerName || '未命名客戶',
              contactPerson: payload.contactPerson || '',
              email: payload.email || '',
              phone: payload.phone || '',
              address: payload.address || '',
              shippingAddress: payload.shippingAddress || '',
              paymentTerms: payload.paymentTerms || '',
              taxId: payload.taxId || '',
              notes: payload.notes || '',
              totalQuotations: 0,
              totalTransactions: 0,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };
            customers.unshift(newCustomer);
            res.statusCode = 201;
            res.end(JSON.stringify({ success: true, data: newCustomer, message: '客戶新增成功' }));
            return;
          }
        }

        // ==========================================
        // PRODUCTS API (/api/products)
        // ==========================================
        if (url.startsWith('/api/products')) {
          const parsedUrl = new URL(url, 'http://localhost:3000');
          const idMatch = url.match(/\/api\/products\/(\d+)/);
          const productId = idMatch ? parseInt(idMatch[1], 10) : null;

          // GET /api/products/:id
          if (productId && req.method === 'GET') {
            const product = products.find(p => p.id === productId);
            if (!product) {
              res.statusCode = 404;
              res.end(JSON.stringify({ success: false, data: null, message: '找不到該產品' }));
              return;
            }
            res.end(JSON.stringify({ success: true, data: product, message: '成功取得產品資料' }));
            return;
          }

          // PUT /api/products/:id
          if (productId && req.method === 'PUT') {
            const payload = await getBody();
            const targetIdx = products.findIndex(p => p.id === productId);
            if (targetIdx === -1) {
              res.statusCode = 404;
              res.end(JSON.stringify({ success: false, data: null, message: '找不到該產品' }));
              return;
            }
            products[targetIdx] = {
              ...products[targetIdx],
              productCode: payload.productCode || products[targetIdx].productCode,
              productName: payload.productName || products[targetIdx].productName,
              category: payload.category || products[targetIdx].category,
              unit: payload.unit || products[targetIdx].unit,
              unitPrice: parseFloat(payload.unitPrice) || 0,
              costPrice: parseFloat(payload.costPrice) || 0,
              stockQuantity: parseInt(payload.stockQuantity, 10) || 0,
              description: payload.description || '',
              status: payload.status || products[targetIdx].status,
              updatedAt: new Date().toISOString()
            };
            res.end(JSON.stringify({ success: true, data: products[targetIdx], message: '產品更新成功' }));
            return;
          }

          // DELETE /api/products/:id
          if (productId && req.method === 'DELETE') {
            const target = products.find(p => p.id === productId);
            if (!target) {
              res.statusCode = 404;
              res.end(JSON.stringify({ success: false, data: null, message: '找不到該產品' }));
              return;
            }
            products = products.filter(p => p.id !== productId);
            res.end(JSON.stringify({ success: true, data: { id: productId }, message: '產品已刪除' }));
            return;
          }

          // GET /api/products (List & Search & Category filter)
          if (req.method === 'GET') {
            const search = (parsedUrl.searchParams.get('search') || '').toLowerCase().trim();
            const category = parsedUrl.searchParams.get('category') || '';
            let filtered = products.filter(p => {
              if (category && p.category !== category) return false;
              if (!search) return true;
              return (
                (p.productName || '').toLowerCase().includes(search) ||
                (p.productCode || '').toLowerCase().includes(search) ||
                (p.category || '').toLowerCase().includes(search) ||
                (p.description || '').toLowerCase().includes(search)
              );
            });
            res.end(JSON.stringify({
              success: true,
              data: filtered,
              message: '成功取得產品清單',
              pagination: { totalRecords: filtered.length }
            }));
            return;
          }

          // POST /api/products (Create)
          if (req.method === 'POST') {
            const payload = await getBody();
            const newId = products.length > 0 ? Math.max(...products.map(p => p.id)) + 1 : 1;
            const newCode = payload.productCode || `PRD-${String(newId).padStart(3, '0')}`;
            const newProduct = {
              id: newId,
              productCode: newCode,
              productName: payload.productName || '未命名產品',
              category: payload.category || '一般商品',
              unit: payload.unit || '件',
              unitPrice: parseFloat(payload.unitPrice) || 0,
              costPrice: parseFloat(payload.costPrice) || 0,
              stockQuantity: parseInt(payload.stockQuantity, 10) || 100,
              description: payload.description || '',
              status: payload.status || 'ACTIVE',
              createdAt: new Date().toISOString()
            };
            products.unshift(newProduct);
            res.statusCode = 201;
            res.end(JSON.stringify({ success: true, data: newProduct, message: '產品建立成功' }));
            return;
          }
        }

        // ==========================================
        // TRANSACTIONS API (/api/transactions)
        // ==========================================
        if (url.startsWith('/api/transactions')) {
          const parsedUrl = new URL(url, 'http://localhost:3000');
          const idMatch = url.match(/\/api\/transactions\/(\d+)/);
          const transactionId = idMatch ? parseInt(idMatch[1], 10) : null;

          // POST /api/transactions/from-quotation/:id
          const fromQuotationMatch = url.match(/\/api\/transactions\/from-quotation\/(\d+)/);
          if (fromQuotationMatch && req.method === 'POST') {
            const qId = parseInt(fromQuotationMatch[1], 10);
            const targetQuotation = quotations.find(q => q.id === qId);
            if (!targetQuotation) {
              res.statusCode = 404;
              res.end(JSON.stringify({ success: false, data: null, message: '找不到欲轉換的報價單' }));
              return;
            }

            // 計算來源報價單總成本
            let totalCost = 0;
            if (targetQuotation.items && Array.isArray(targetQuotation.items)) {
              totalCost = targetQuotation.items.reduce((sum: number, it: any) => {
                const prod = products.find(p => p.id === it.productId);
                const cost = prod ? (prod.costPrice || 0) : 0;
                return sum + (it.quantity * cost);
              }, 0);
            }

            // 更新報價單狀態為 ACCEPTED
            targetQuotation.status = 'ACCEPTED';
            targetQuotation.updatedBy = targetQuotation.updatedBy || '系統經辦人';
            targetQuotation.updatedAt = new Date().toISOString();

            const newId = transactions.length > 0 ? Math.max(...transactions.map(t => t.id)) + 1 : 1;
            const todayStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
            const txNumber = `TX-${todayStr}-${String(newId).padStart(2, '0')}`;
            const totalAmt = parseFloat(targetQuotation.totalAmount) || 0;

            const newTx = {
              id: newId,
              transactionNumber: txNumber,
              quotationId: targetQuotation.id,
              quotationNumber: targetQuotation.quotationNumber,
              customerName: targetQuotation.customerName,
              customerEmail: targetQuotation.customerEmail || '',
              transactionDate: new Date().toISOString().split('T')[0],
              totalAmount: totalAmt,
              costPrice: totalCost,
              paidAmount: 0,
              remainingAmount: totalAmt,
              grossProfit: totalAmt - totalCost,
              grossMargin: totalAmt > 0 ? Number(((totalAmt - totalCost) / totalAmt * 100).toFixed(1)) : 0,
              paymentMethod: '電匯 (Wire Transfer)',
              paymentStatus: 'PENDING',
              fulfillmentStatus: 'PROCESSING',
              notes: `由報價單 ${targetQuotation.quotationNumber} 一鍵轉換成立。`,
              createdBy: targetQuotation.updatedBy || '系統經辦人',
              updatedBy: targetQuotation.updatedBy || '系統經辦人',
              invoices: [],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };

            transactions.unshift(newTx);
            res.statusCode = 201;
            res.end(JSON.stringify({
              success: true,
              data: newTx,
              message: `已成功將報價單 ${targetQuotation.quotationNumber} 轉為交易單 ${txNumber}！`
            }));
            return;
          }

          // GET /api/transactions/:id
          if (transactionId && req.method === 'GET') {
            const tx = transactions.find(t => t.id === transactionId);
            if (!tx) {
              res.statusCode = 404;
              res.end(JSON.stringify({ success: false, data: null, message: '找不到該交易紀錄' }));
              return;
            }
            res.end(JSON.stringify({ success: true, data: tx, message: '成功取得交易資料' }));
            return;
          }

          // PUT /api/transactions/:id
          if (transactionId && req.method === 'PUT') {
            const payload = await getBody();
            const targetIdx = transactions.findIndex(t => t.id === transactionId);
            if (targetIdx === -1) {
              res.statusCode = 404;
              res.end(JSON.stringify({ success: false, data: null, message: '找不到該交易紀錄' }));
              return;
            }
            const existing = transactions[targetIdx];
            const tot = payload.totalAmount !== undefined ? parseFloat(payload.totalAmount) : existing.totalAmount;
            const cost = payload.costPrice !== undefined ? parseFloat(payload.costPrice) : (existing.costPrice || 0);
            const paid = payload.paidAmount !== undefined ? parseFloat(payload.paidAmount) : (existing.paidAmount || 0);
            const remaining = Math.max(0, tot - paid);
            const profit = tot - cost;
            const margin = tot > 0 ? Number(((profit / tot) * 100).toFixed(1)) : 0;

            transactions[targetIdx] = {
              ...existing,
              customerName: payload.customerName || existing.customerName,
              customerEmail: payload.customerEmail !== undefined ? payload.customerEmail : existing.customerEmail,
              transactionDate: payload.transactionDate || existing.transactionDate,
              totalAmount: tot,
              costPrice: cost,
              paidAmount: paid,
              remainingAmount: remaining,
              grossProfit: profit,
              grossMargin: margin,
              paymentStatus: payload.paymentStatus || existing.paymentStatus,
              fulfillmentStatus: payload.fulfillmentStatus || existing.fulfillmentStatus,
              paymentMethod: payload.paymentMethod || existing.paymentMethod,
              notes: payload.notes !== undefined ? payload.notes : existing.notes,
              invoices: Array.isArray(payload.invoices) ? payload.invoices : (existing.invoices || []),
              updatedBy: payload.updatedBy || existing.updatedBy || '系統修改人',
              updatedAt: new Date().toISOString()
            };
            res.end(JSON.stringify({ success: true, data: transactions[targetIdx], message: '交易資料與發票更新成功' }));
            return;
          }

          // DELETE /api/transactions/:id
          if (transactionId && req.method === 'DELETE') {
            const target = transactions.find(t => t.id === transactionId);
            if (!target) {
              res.statusCode = 404;
              res.end(JSON.stringify({ success: false, data: null, message: '找不到該交易紀錄' }));
              return;
            }
            transactions = transactions.filter(t => t.id !== transactionId);
            res.end(JSON.stringify({ success: true, data: { id: transactionId }, message: '交易紀錄已刪除' }));
            return;
          }

          // GET /api/transactions (List & Search & Status Filter)
          if (req.method === 'GET') {
            const search = (parsedUrl.searchParams.get('search') || '').toLowerCase().trim();
            const paymentStatus = parsedUrl.searchParams.get('paymentStatus') || '';
            const fulfillmentStatus = parsedUrl.searchParams.get('fulfillmentStatus') || '';

            let filtered = transactions.filter(t => {
              if (paymentStatus && t.paymentStatus !== paymentStatus) return false;
              if (fulfillmentStatus && t.fulfillmentStatus !== fulfillmentStatus) return false;
              if (!search) return true;
              return (
                (t.transactionNumber || '').toLowerCase().includes(search) ||
                (t.customerName || '').toLowerCase().includes(search) ||
                (t.quotationNumber || '').toLowerCase().includes(search)
              );
            });
            res.end(JSON.stringify({
              success: true,
              data: filtered,
              message: '成功取得交易列表',
              pagination: { totalRecords: filtered.length }
            }));
            return;
          }

          // POST /api/transactions (Create direct transaction)
          if (req.method === 'POST') {
            const payload = await getBody();
            const newId = transactions.length > 0 ? Math.max(...transactions.map(t => t.id)) + 1 : 1;
            const todayStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
            const txNumber = payload.transactionNumber || `TX-${todayStr}-${String(newId).padStart(2, '0')}`;
            const tot = parseFloat(payload.totalAmount) || 0;
            const cost = parseFloat(payload.costPrice) || 0;
            const paid = parseFloat(payload.paidAmount) || 0;
            const remaining = Math.max(0, tot - paid);
            const profit = tot - cost;
            const margin = tot > 0 ? Number(((profit / tot) * 100).toFixed(1)) : 0;

            const creator = payload.createdBy || payload.updatedBy || '系統使用者';
            const newTx = {
              id: newId,
              transactionNumber: txNumber,
              quotationId: payload.quotationId || null,
              quotationNumber: payload.quotationNumber || '',
              customerName: payload.customerName || '一般客戶',
              customerEmail: payload.customerEmail || '',
              transactionDate: payload.transactionDate || new Date().toISOString().split('T')[0],
              totalAmount: tot,
              costPrice: cost,
              paidAmount: paid,
              remainingAmount: remaining,
              grossProfit: profit,
              grossMargin: margin,
              paymentMethod: payload.paymentMethod || '電匯 (Wire Transfer)',
              paymentStatus: payload.paymentStatus || 'PENDING',
              fulfillmentStatus: payload.fulfillmentStatus || 'PROCESSING',
              notes: payload.notes || '',
              createdBy: creator,
              updatedBy: creator,
              invoices: Array.isArray(payload.invoices) ? payload.invoices : [],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };

            transactions.unshift(newTx);
            res.statusCode = 201;
            res.end(JSON.stringify({ success: true, data: newTx, message: '交易單與發票建立成功' }));
            return;
          }
        }

        // ==========================================
        // QUOTATIONS API (/api/quotations)
        // ==========================================
        // 3. GET /api/quotations (List)
        if (url.startsWith('/api/quotations') && req.method === 'GET' && !url.match(/\/api\/quotations\/\d+/)) {
          const parsedUrl = new URL(url, 'http://localhost:3000');
          const page = parseInt(parsedUrl.searchParams.get('page') || '1', 10);
          const pageSize = parseInt(parsedUrl.searchParams.get('pageSize') || '10', 10);
          const search = (parsedUrl.searchParams.get('search') || '').toLowerCase().trim();
          const statusFilter = parsedUrl.searchParams.get('statusFilter') || '';

          let filtered = quotations.filter((q) => {
            let isMatch = true;
            if (search) {
              const matchesSearch =
                (q.quotationNumber || '').toLowerCase().includes(search) ||
                (q.customerName || '').toLowerCase().includes(search) ||
                (q.customerTaxId || '').toLowerCase().includes(search) ||
                (q.customerContactPerson || '').toLowerCase().includes(search) ||
                (q.customerAddress || '').toLowerCase().includes(search);
              if (!matchesSearch) isMatch = false;
            }
            if (statusFilter && q.status !== statusFilter) {
              isMatch = false;
            }
            return isMatch;
          });

          const totalRecords = filtered.length;
          const totalPages = Math.ceil(totalRecords / pageSize);
          const offset = (page - 1) * pageSize;
          const paginatedData = filtered.slice(offset, offset + pageSize);

          res.end(JSON.stringify({
            success: true,
            data: paginatedData,
            message: '成功取得報價單清單',
            error: null,
            pagination: {
              currentPage: page,
              pageSize,
              totalRecords,
              totalPages,
              hasNextPage: page < totalPages,
              hasPrevPage: page > 1
            }
          }));
          return;
        }

        // 4. GET /api/quotations/:id
        const getMatch = url.match(/\/api\/quotations\/(\d+)/);
        if (getMatch && req.method === 'GET') {
          const id = parseInt(getMatch[1], 10);
          const item = quotations.find((q) => q.id === id);
          if (!item) {
            res.statusCode = 404;
            res.end(JSON.stringify({
              success: false,
              data: null,
              message: '找不到該報價單',
              error: 'Not found',
              pagination: null
            }));
            return;
          }
          res.end(JSON.stringify({
            success: true,
            data: item,
            message: '成功取得報價單詳細資料',
            error: null,
            pagination: null
          }));
          return;
        }

        // 5. POST /api/quotations (Create)
        if (url === '/api/quotations' && req.method === 'POST') {
          try {
            const payload = await getBody();
            const newId = quotations.length > 0 ? Math.max(...quotations.map((q) => q.id)) + 1 : 1;
            
            let subtotal = 0;
            const items = (payload.items || []).map((it: any, idx: number) => {
              const lineTotal = (parseFloat(it.quantity) || 0) * (parseFloat(it.unitPrice) || 0);
              subtotal += lineTotal;
              return {
                id: idx + 1,
                quotationId: newId,
                productId: it.productId || null,
                itemName: it.itemName,
                description: it.description || '',
                quantity: parseFloat(it.quantity) || 1,
                unitPrice: parseFloat(it.unitPrice) || 0,
                lineTotal,
                sortOrder: it.sortOrder ?? idx
              };
            });

            const taxMode = (payload.taxMode || 'EXCLUSIVE').toUpperCase();
            const taxRate = parseFloat(payload.taxRate) !== undefined ? parseFloat(payload.taxRate) : 5;
            let taxAmount = 0;
            let totalAmount = 0;
            let subtotalDb = subtotal;

            if (payload.totalAmount !== undefined && payload.totalAmount !== null) {
              totalAmount = parseFloat(payload.totalAmount) || 0;
              if (taxMode === 'INCLUSIVE') {
                const untaxed = Math.round(totalAmount / (1 + (taxRate / 100)));
                taxAmount = totalAmount - untaxed;
                subtotalDb = untaxed;
              } else if (taxMode === 'ZERO') {
                taxAmount = 0;
                subtotalDb = totalAmount;
              } else {
                taxAmount = Math.round(subtotal * (taxRate / 100));
                subtotalDb = subtotal;
              }
            } else {
              if (taxMode === 'INCLUSIVE') {
                totalAmount = subtotal;
                const untaxed = Math.round(totalAmount / (1 + (taxRate / 100)));
                taxAmount = totalAmount - untaxed;
                subtotalDb = untaxed;
              } else if (taxMode === 'ZERO') {
                taxAmount = 0;
                totalAmount = subtotal;
                subtotalDb = subtotal;
              } else {
                taxAmount = Math.round(subtotal * (taxRate / 100));
                totalAmount = subtotal + taxAmount;
                subtotalDb = subtotal;
              }
            }

            const newQuotation = {
              id: newId,
              quotationNumber: payload.quotationNumber,
              customerId: payload.customerId || null,
              customerName: payload.customerName,
              customerTaxId: payload.customerTaxId || null,
              customerContactPerson: payload.customerContactPerson || null,
              customerEmail: payload.customerEmail || null,
              customerPhone: payload.customerPhone || null,
              customerAddress: payload.customerAddress || null,
              shippingAddress: payload.shippingAddress || null,
              paymentTerms: payload.paymentTerms || null,
              issueDate: payload.issueDate,
              expiryDate: payload.expiryDate || null,
              status: payload.status || 'DRAFT',
              taxMode,
              subtotal: subtotalDb,
              taxRate,
              taxAmount,
              totalAmount,
              notes: payload.notes || null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              items
            };

            quotations.unshift(newQuotation);

            res.statusCode = 201;
            res.end(JSON.stringify({
              success: true,
              data: { id: newId, quotationNumber: payload.quotationNumber },
              message: '報價單建立成功',
              error: null,
              pagination: null
            }));
          } catch (err: any) {
            res.statusCode = 400;
            res.end(JSON.stringify({
              success: false,
              data: null,
              message: '參數解析失敗',
              error: err.message,
              pagination: null
            }));
          }
          return;
        }

        // 6. PUT /api/quotations/:id (Update)
        const putMatch = url.match(/\/api\/quotations\/(\d+)/);
        if (putMatch && req.method === 'PUT') {
          const id = parseInt(putMatch[1], 10);
          try {
            const payload = await getBody();
            const targetIdx = quotations.findIndex((q) => q.id === id);
            if (targetIdx === -1) {
              res.statusCode = 404;
              res.end(JSON.stringify({
                success: false,
                data: null,
                message: '找不到該報價單',
                error: 'Not found',
                pagination: null
              }));
              return;
            }

            let subtotal = 0;
            const items = (payload.items || []).map((it: any, idx: number) => {
              const lineTotal = (parseFloat(it.quantity) || 0) * (parseFloat(it.unitPrice) || 0);
              subtotal += lineTotal;
              return {
                id: idx + 1,
                quotationId: id,
                productId: it.productId || null,
                itemName: it.itemName,
                description: it.description || '',
                quantity: parseFloat(it.quantity) || 1,
                unitPrice: parseFloat(it.unitPrice) || 0,
                lineTotal,
                sortOrder: it.sortOrder ?? idx
              };
            });

            const taxMode = (payload.taxMode || 'EXCLUSIVE').toUpperCase();
            const taxRate = parseFloat(payload.taxRate) !== undefined ? parseFloat(payload.taxRate) : 5;
            let taxAmount = 0;
            let totalAmount = 0;
            let subtotalDb = subtotal;

            if (payload.totalAmount !== undefined && payload.totalAmount !== null) {
              totalAmount = parseFloat(payload.totalAmount) || 0;
              if (taxMode === 'INCLUSIVE') {
                const untaxed = Math.round(totalAmount / (1 + (taxRate / 100)));
                taxAmount = totalAmount - untaxed;
                subtotalDb = untaxed;
              } else if (taxMode === 'ZERO') {
                taxAmount = 0;
                subtotalDb = totalAmount;
              } else {
                taxAmount = Math.round(subtotal * (taxRate / 100));
                subtotalDb = subtotal;
              }
            } else {
              if (taxMode === 'INCLUSIVE') {
                totalAmount = subtotal;
                const untaxed = Math.round(totalAmount / (1 + (taxRate / 100)));
                taxAmount = totalAmount - untaxed;
                subtotalDb = untaxed;
              } else if (taxMode === 'ZERO') {
                taxAmount = 0;
                totalAmount = subtotal;
                subtotalDb = subtotal;
              } else {
                taxAmount = Math.round(subtotal * (taxRate / 100));
                totalAmount = subtotal + taxAmount;
                subtotalDb = subtotal;
              }
            }

            quotations[targetIdx] = {
              ...quotations[targetIdx],
              quotationNumber: payload.quotationNumber,
              customerId: payload.customerId || quotations[targetIdx].customerId,
              customerName: payload.customerName,
              customerTaxId: payload.customerTaxId || null,
              customerContactPerson: payload.customerContactPerson || null,
              customerEmail: payload.customerEmail || null,
              customerPhone: payload.customerPhone || null,
              customerAddress: payload.customerAddress || null,
              shippingAddress: payload.shippingAddress || null,
              paymentTerms: payload.paymentTerms || null,
              issueDate: payload.issueDate,
              expiryDate: payload.expiryDate || null,
              status: payload.status || 'DRAFT',
              taxMode,
              subtotal: subtotalDb,
              taxRate,
              taxAmount,
              totalAmount,
              notes: payload.notes || null,
              updatedAt: new Date().toISOString(),
              items
            };

            res.end(JSON.stringify({
              success: true,
              data: { id, quotationNumber: payload.quotationNumber },
              message: '報價單更新成功',
              error: null,
              pagination: null
            }));
          } catch (err: any) {
            res.statusCode = 400;
            res.end(JSON.stringify({
              success: false,
              data: null,
              message: '更新失敗',
              error: err.message,
              pagination: null
            }));
          }
          return;
        }

        // 7. DELETE /api/quotations/:id
        const deleteMatch = url.match(/\/api\/quotations\/(\d+)/);
        if (deleteMatch && req.method === 'DELETE') {
          const id = parseInt(deleteMatch[1], 10);
          const target = quotations.find((q) => q.id === id);
          if (!target) {
            res.statusCode = 404;
            res.end(JSON.stringify({
              success: false,
              data: null,
              message: '找不到該報價單',
              error: 'Not found',
              pagination: null
            }));
            return;
          }
          quotations = quotations.filter((q) => q.id !== id);
          res.end(JSON.stringify({
            success: true,
            data: { id, quotationNumber: target.quotationNumber },
            message: '報價單已成功刪除',
            error: null,
            pagination: null
          }));
          return;
        }

        // ==========================================
        // COMPANY SETTINGS API (/api/company)
        // ==========================================
        if (url === '/api/company' && req.method === 'GET') {
          res.end(JSON.stringify({
            success: true,
            data: companySettings,
            message: '成功取得公司基本資料'
          }));
          return;
        }

        if (url === '/api/company' && (req.method === 'POST' || req.method === 'PUT')) {
          try {
            const payload = await getBody();
            companySettings = {
              ...companySettings,
              companyName: payload.companyName || companySettings.companyName,
              taxId: payload.taxId ?? companySettings.taxId,
              phone: payload.phone ?? companySettings.phone,
              fax: payload.fax ?? companySettings.fax,
              address: payload.address ?? companySettings.address,
              email: payload.email ?? companySettings.email,
              website: payload.website ?? companySettings.website,
              bankName: payload.bankName ?? companySettings.bankName,
              bankAccount: payload.bankAccount ?? companySettings.bankAccount,
              bankAccountName: payload.bankAccountName ?? companySettings.bankAccountName,
              defaultTerms: payload.defaultTerms ?? companySettings.defaultTerms,
              updatedAt: new Date().toISOString()
            };

            res.end(JSON.stringify({
              success: true,
              data: companySettings,
              message: '公司基本資料已成功儲存'
            }));
          } catch (err: any) {
            res.statusCode = 400;
            res.end(JSON.stringify({ success: false, data: null, message: '儲存失敗', error: err.message }));
          }
          return;
        }

        // ==========================================
        // USERS & PERMISSIONS API (/api/users)
        // ==========================================
        if (url.startsWith('/api/users') && req.method === 'GET' && !url.match(/\/api\/users\/\d+/)) {
          res.end(JSON.stringify({
            success: true,
            data: users,
            message: '成功取得使用者清單'
          }));
          return;
        }

        if (url === '/api/users' && req.method === 'POST') {
          try {
            const payload = await getBody();
            const exists = users.find(u => u.username === payload.username);
            if (exists) {
              res.statusCode = 400;
              res.end(JSON.stringify({ success: false, data: null, message: '該帳號已被使用，請更換帳號' }));
              return;
            }

            const newId = users.length > 0 ? Math.max(...users.map(u => u.id)) + 1 : 1;
            const newUser = {
              id: newId,
              name: payload.name,
              username: payload.username,
              password: payload.password || '123456',
              department: payload.department || '業務部',
              phone: payload.phone || '',
              email: payload.email || '',
              role: payload.role || 'USER',
              allowedMenus: typeof payload.allowedMenus === 'string' ? payload.allowedMenus.split(',') : (payload.allowedMenus || ['dashboard', 'customers', 'products', 'quotations']),
              status: payload.status || 'ACTIVE',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };

            users.push(newUser);
            res.statusCode = 201;
            res.end(JSON.stringify({
              success: true,
              data: { id: newUser.id, name: newUser.name, username: newUser.username, role: newUser.role },
              message: '使用者建立成功'
            }));
          } catch (err: any) {
            res.statusCode = 400;
            res.end(JSON.stringify({ success: false, data: null, message: '建立使用者失敗', error: err.message }));
          }
          return;
        }

        const userMatch = url.match(/\/api\/users\/(\d+)/);
        if (userMatch && req.method === 'PUT') {
          try {
            const userId = parseInt(userMatch[1], 10);
            const payload = await getBody();
            const idx = users.findIndex(u => u.id === userId);
            if (idx === -1) {
              res.statusCode = 404;
              res.end(JSON.stringify({ success: false, data: null, message: '找不到該使用者' }));
              return;
            }

            users[idx] = {
              ...users[idx],
              name: payload.name || users[idx].name,
              department: payload.department ?? users[idx].department,
              phone: payload.phone ?? users[idx].phone,
              email: payload.email ?? users[idx].email,
              role: payload.role || users[idx].role,
              allowedMenus: typeof payload.allowedMenus === 'string' ? payload.allowedMenus.split(',') : (payload.allowedMenus || users[idx].allowedMenus),
              status: payload.status || users[idx].status,
              password: (payload.password && payload.password.trim()) ? payload.password : users[idx].password,
              updatedAt: new Date().toISOString()
            };

            res.end(JSON.stringify({
              success: true,
              data: { id: userId, name: users[idx].name, username: users[idx].username },
              message: '使用者資訊已更新'
            }));
          } catch (err: any) {
            res.statusCode = 400;
            res.end(JSON.stringify({ success: false, data: null, message: '更新失敗', error: err.message }));
          }
          return;
        }

        if (userMatch && req.method === 'DELETE') {
          const userId = parseInt(userMatch[1], 10);
          if (userId === 1) {
            res.statusCode = 400;
            res.end(JSON.stringify({ success: false, data: null, message: '系統預設管理員 (ID: 1) 不得刪除' }));
            return;
          }
          const target = users.find(u => u.id === userId);
          if (!target) {
            res.statusCode = 404;
            res.end(JSON.stringify({ success: false, data: null, message: '找不到該使用者' }));
            return;
          }
          users = users.filter(u => u.id !== userId);
          res.end(JSON.stringify({
            success: true,
            data: { id: userId, name: target.name },
            message: '使用者已成功刪除'
          }));
          return;
        }

        next();
      });
    }
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), devApiPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
