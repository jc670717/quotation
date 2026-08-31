import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, Plugin } from 'vite';

// 本地開發預覽用 Mock API (支援 客戶、廠商、產品、報價單、交易、基本資料(多公司/LOGO)、使用者與權限、修改歷程)
function devApiPlugin(): Plugin {
  // 1. 客戶資料
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
      createdBy: '系統管理者 (王總監)',
      updatedBy: '陳大明 (業務經理)',
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
      createdBy: '系統管理者 (王總監)',
      updatedBy: '陳大明 (業務經理)',
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
      createdBy: '系統管理者 (王總監)',
      updatedBy: '林小花 (業務助理)',
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
      createdBy: '系統管理者 (王總監)',
      updatedBy: '陳大明 (業務經理)',
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
      createdBy: '系統管理者 (王總監)',
      updatedBy: '系統管理者 (王總監)',
      createdAt: '2026-08-18T08:00:00Z',
      updatedAt: '2026-08-20T08:00:00Z'
    }
  ];

  // 2. 廠商資料 (Vendor Management)
  let vendors: any[] = [
    {
      id: 1,
      vendorCode: 'VND-001',
      vendorName: '台灣微軟股份有限公司 (Microsoft Taiwan)',
      taxId: '23528807',
      phone: '02-37253888',
      address: '台北市信義區忠孝東路五段 68 號 19 樓',
      contactPerson: '王業務副理',
      email: 'azure-partner@microsoft.com',
      productsAndServices: 'Azure 雲端服務、M365 授權、伺服器作業系統與架構支援',
      notes: '原廠一級金級合作夥伴，享大量採購折讓。',
      totalProducts: 2,
      cooperationCount: 15,
      createdBy: '系統管理者 (王總監)',
      updatedBy: '系統管理者 (王總監)',
      createdAt: '2026-07-01T08:00:00Z',
      updatedAt: '2026-08-20T08:00:00Z'
    },
    {
      id: 2,
      vendorCode: 'VND-002',
      vendorName: '華碩電腦股份有限公司 (ASUS)',
      taxId: '23883011',
      phone: '02-28943447',
      address: '台北市北投區立德路 15 號',
      contactPerson: '林專案經理',
      email: 'b2b_support@asus.com',
      productsAndServices: '企業商用伺服器、工作站、交換器與高階網通設備',
      notes: '硬體設備原廠 3 年到府保固配合廠商。',
      totalProducts: 1,
      cooperationCount: 8,
      createdBy: '系統管理者 (王總監)',
      updatedBy: '陳大明 (業務經理)',
      createdAt: '2026-07-10T10:00:00Z',
      updatedAt: '2026-08-22T10:00:00Z'
    },
    {
      id: 3,
      vendorCode: 'VND-003',
      vendorName: '思科系統股份有限公司 (Cisco Systems)',
      taxId: '84489912',
      phone: '02-87587100',
      address: '台北市信義區信義路五段 7 號 35 樓 (101 大樓)',
      contactPerson: '張資安顧問',
      email: 'partner-tw@cisco.com',
      productsAndServices: '網路資安防火牆、VPN 閘道器、企業級網路交換機',
      notes: '資安防護與網路路由工程專用供應商。',
      totalProducts: 1,
      cooperationCount: 6,
      createdBy: '系統管理者 (王總監)',
      updatedBy: '系統管理者 (王總監)',
      createdAt: '2026-07-15T09:00:00Z',
      updatedAt: '2026-08-24T09:00:00Z'
    },
    {
      id: 4,
      vendorCode: 'VND-004',
      vendorName: '精誠資訊股份有限公司 (SYSTEX)',
      taxId: '97175566',
      phone: '02-77201888',
      address: '台北市內湖區瑞光路 318 號',
      contactPerson: '陳資深經理',
      email: 'sales@systex.com.tw',
      productsAndServices: '資料庫軟體分銷、中介軟體授權與技術諮詢外包',
      notes: 'PostgreSQL 商業支援與容災服務供應合作夥伴。',
      totalProducts: 1,
      cooperationCount: 12,
      createdBy: '系統管理者 (王總監)',
      updatedBy: '陳大明 (業務經理)',
      createdAt: '2026-07-20T11:00:00Z',
      updatedAt: '2026-08-25T11:00:00Z'
    }
  ];

  // 3. 產品資料 (含 圖片、廠商、品牌、型號)
  let products: any[] = [
    {
      id: 1,
      productCode: 'PRD-CLOUD-01',
      productName: '次世代雲端混合架構建置與搬遷顧問',
      brand: 'Microsoft / Terraform',
      model: 'AZ-ARCH-ENT-2026',
      vendor: '台灣微軟股份有限公司 (Microsoft Taiwan)',
      vendorId: 1,
      imageUrl: '',
      category: '雲端與維運服務',
      unit: '專案',
      unitPrice: 280000,
      costPrice: 150000,
      stockQuantity: 99,
      description: '包含 Terraform IaC 自動化腳本與多區域容災方案設計，由微軟認證架構師親自督導。',
      status: 'ACTIVE',
      createdBy: '系統管理者 (王總監)',
      updatedBy: '系統管理者 (王總監)',
      createdAt: '2026-08-01T08:00:00Z',
      updatedAt: '2026-08-24T08:00:00Z'
    },
    {
      id: 2,
      productCode: 'PRD-DB-02',
      productName: 'PostgreSQL 高可用叢集連線池最佳化服務',
      brand: 'SYSTEX / OpenSource',
      model: 'PG-HA-CLUST-V16',
      vendor: '精誠資訊股份有限公司 (SYSTEX)',
      vendorId: 4,
      imageUrl: '',
      category: '軟體開發與技術',
      unit: '套',
      unitPrice: 148571,
      costPrice: 70000,
      stockQuantity: 50,
      description: '含讀寫分離、PgBouncer 部署、連線池監控與自動容錯移轉高可用設定。',
      status: 'ACTIVE',
      createdBy: '系統管理者 (王總監)',
      updatedBy: '系統管理者 (王總監)',
      createdAt: '2026-08-02T08:00:00Z',
      updatedAt: '2026-08-24T08:00:00Z'
    },
    {
      id: 3,
      productCode: 'PRD-API-03',
      productName: '進出口進銷存系統 API 串接授權模組',
      brand: '自研 (QuotationPro)',
      model: 'API-ERP-BRIDGE-PRO',
      vendor: '自研產品 (自主開發)',
      vendorId: null,
      imageUrl: '',
      category: '軟體開發與技術',
      unit: '套',
      unitPrice: 27143,
      costPrice: 5000,
      stockQuantity: 200,
      description: '提供 RESTful API 與 Webhook 自動拋轉訂單至各類資料庫與財務系統。',
      status: 'ACTIVE',
      createdBy: '系統管理者 (王總監)',
      updatedBy: '陳大明 (業務經理)',
      createdAt: '2026-08-03T08:00:00Z',
      updatedAt: '2026-08-23T08:00:00Z'
    },
    {
      id: 4,
      productCode: 'PRD-WEB-04',
      productName: '品牌官方網站視覺重構與 RWD 切版',
      brand: '自研 (QuotationPro)',
      model: 'WEB-UI-ENTERPRISE',
      vendor: '自研產品 (自主開發)',
      vendorId: null,
      imageUrl: '',
      category: '設計與體驗',
      unit: '專案',
      unitPrice: 106667,
      costPrice: 40000,
      stockQuantity: 20,
      description: '符合 WCAG AA 無障礙標準與現代極簡設計規範，全響應式跨裝置適配。',
      status: 'ACTIVE',
      createdBy: '系統管理者 (王總監)',
      updatedBy: '林小花 (業務助理)',
      createdAt: '2026-08-04T08:00:00Z',
      updatedAt: '2026-08-23T08:00:00Z'
    },
    {
      id: 5,
      productCode: 'PRD-SDK-05',
      productName: '即時物流路線追蹤 SDK 訂閱',
      brand: 'Google Cloud Platform / 自研',
      model: 'GEO-ROUTE-SDK-V2',
      vendor: '台灣微軟股份有限公司 (Microsoft Taiwan)',
      vendorId: 1,
      imageUrl: '',
      category: '雲端與維運服務',
      unit: '月',
      unitPrice: 8476,
      costPrice: 1000,
      stockQuantity: 999,
      description: '月度基本存取配額 50,000 次請求，高精度 GPS 即時路線演算與電子圍籬。',
      status: 'ACTIVE',
      createdBy: '系統管理者 (王總監)',
      updatedBy: '陳大明 (業務經理)',
      createdAt: '2026-08-05T08:00:00Z',
      updatedAt: '2026-08-22T08:00:00Z'
    },
    {
      id: 6,
      productCode: 'PRD-SEC-06',
      productName: '企業級資安合規性稽核與滲透測試',
      brand: 'Cisco / OWASP',
      model: 'SEC-AUDIT-2026',
      vendor: '思科系統股份有限公司 (Cisco Systems)',
      vendorId: 3,
      imageUrl: '',
      category: '顧問諮詢',
      unit: '次',
      unitPrice: 160000,
      costPrice: 80000,
      stockQuantity: 30,
      description: '包含 OWASP Top 10 檢測、原始碼靜態弱點掃描與專業修補驗證報告。',
      status: 'ACTIVE',
      createdBy: '系統管理者 (王總監)',
      updatedBy: '系統管理者 (王總監)',
      createdAt: '2026-08-06T08:00:00Z',
      updatedAt: '2026-08-20T08:00:00Z'
    }
  ];

  // 4. 基本資料多公司支援 (Companies Management)
  let companies: any[] = [
    {
      id: 1,
      companyName: '極簡資訊科技股份有限公司',
      taxId: '28491023',
      phone: '(02) 2345-6789',
      fax: '(02) 2345-6780',
      email: 'contact@quotationpro.com.tw',
      website: 'https://www.quotationpro.com.tw',
      address: '台北市信義區松仁路 100 號 18 樓',
      contactPerson: '王建國 總監',
      contactPhone: '0912-345-678',
      contactEmail: 'wang@quotationpro.com.tw',
      logoUrl: '',
      bankName: '台灣銀行 信義分行',
      bankAccount: '012-345-678901',
      bankAccountName: '極簡資訊科技股份有限公司',
      defaultTerms: '1. 本報價單有效期限為 30 天。\n2. 付款條件為月結 30 天。\n3. 保固服務：自驗收日起提供一年軟硬體保固與技術諮詢。',
      isDefault: true,
      updatedBy: '系統管理者 (王總監)',
      updatedAt: '2026-08-25T10:00:00Z'
    },
    {
      id: 2,
      companyName: '極簡智能數位商務有限公司',
      taxId: '90123456',
      phone: '(02) 8765-4321',
      fax: '(02) 8765-4320',
      email: 'digital@quotationpro.com.tw',
      website: 'https://digital.quotationpro.com.tw',
      address: '台北市大安區敦化南路二段 88 號 12 樓',
      contactPerson: '陳大明 經理',
      contactPhone: '0988-765-432',
      contactEmail: 'chen@quotationpro.com.tw',
      logoUrl: '',
      bankName: '玉山銀行 敦南分行',
      bankAccount: '808-987-6543210',
      bankAccountName: '極簡智能數位商務有限公司',
      defaultTerms: '1. 本專案報價有效期為 14 天。\n2. 訂金 30%，期中款 40%，驗收 30%。\n3. 專案客製代碼享有終身著作財產權與維護。',
      isDefault: false,
      updatedBy: '陳大明 (業務經理)',
      updatedAt: '2026-08-24T12:00:00Z'
    }
  ];

  // 5. 報價單資料 (含開立公司與窗口)
  let quotations: any[] = [
    {
      id: 1,
      quotationNumber: 'QT-20260830-01',
      companyId: 1,
      companyName: '極簡資訊科技股份有限公司',
      companyContactPerson: '王建國 總監',
      companyContactPhone: '0912-345-678',
      companyContactEmail: 'wang@quotationpro.com.tw',
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
      taxMode: 'EXCLUSIVE',
      subtotal: 428571,
      taxRate: 5,
      taxAmount: 21429,
      totalAmount: 450000,
      totalCost: 220000,
      grossProfit: 230000,
      grossMargin: 51.1,
      notes: '1. 本報價單有效期限為 30 天。\n2. 包含雲端架構部署、安全性測試與 24/7 技術支援。',
      createdBy: '系統管理者 (王總監)',
      updatedBy: '系統管理者 (王總監)',
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
          costPrice: 150000,
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
          costPrice: 70000,
          lineTotal: 148571,
          sortOrder: 1
        }
      ]
    },
    {
      id: 2,
      quotationNumber: 'QT-20260830-02',
      companyId: 1,
      companyName: '極簡資訊科技股份有限公司',
      companyContactPerson: '陳大明 經理',
      companyContactPhone: '0988-765-432',
      companyContactEmail: 'chen@quotationpro.com.tw',
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
      taxMode: 'EXCLUSIVE',
      subtotal: 27143,
      taxRate: 5,
      taxAmount: 1357,
      totalAmount: 28500,
      totalCost: 5000,
      grossProfit: 23500,
      grossMargin: 82.5,
      notes: '付款條件：簽約後 14 日內電匯支付。',
      createdBy: '陳大明 (業務經理)',
      updatedBy: '陳大明 (業務經理)',
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
          costPrice: 5000,
          lineTotal: 27143,
          sortOrder: 0
        }
      ]
    },
    {
      id: 3,
      quotationNumber: 'QT-20260830-03',
      companyId: 2,
      companyName: '極簡智能數位商務有限公司',
      companyContactPerson: '陳大明 經理',
      companyContactPhone: '0988-765-432',
      companyContactEmail: 'chen@quotationpro.com.tw',
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
      taxMode: 'EXCLUSIVE',
      subtotal: 106667,
      taxRate: 5,
      taxAmount: 5333,
      totalAmount: 112000,
      totalCost: 40000,
      grossProfit: 72000,
      grossMargin: 64.3,
      notes: '草稿備註：尚待客戶確認 3D 渲染圖輸出規格。',
      createdBy: '林小花 (業務助理)',
      updatedBy: '林小花 (業務助理)',
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
          costPrice: 40000,
          lineTotal: 106667,
          sortOrder: 0
        }
      ]
    },
    {
      id: 4,
      quotationNumber: 'QT-20260830-04',
      companyId: 1,
      companyName: '極簡資訊科技股份有限公司',
      companyContactPerson: '陳大明 經理',
      companyContactPhone: '0988-765-432',
      companyContactEmail: 'chen@quotationpro.com.tw',
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
      taxMode: 'EXCLUSIVE',
      subtotal: 8476,
      taxRate: 5,
      taxAmount: 424,
      totalAmount: 8900,
      totalCost: 1500,
      grossProfit: 7400,
      grossMargin: 83.1,
      notes: '月租訂閱制方案，首月優惠計價。',
      createdBy: '陳大明 (業務經理)',
      updatedBy: '陳大明 (業務經理)',
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
          costPrice: 1500,
          lineTotal: 8476,
          sortOrder: 0
        }
      ]
    },
    {
      id: 5,
      quotationNumber: 'QT-20260830-05',
      companyId: 1,
      companyName: '極簡資訊科技股份有限公司',
      companyContactPerson: '王建國 總監',
      companyContactPhone: '0912-345-678',
      companyContactEmail: 'wang@quotationpro.com.tw',
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
      taxMode: 'EXCLUSIVE',
      subtotal: 160000,
      taxRate: 5,
      taxAmount: 8000,
      totalAmount: 168000,
      totalCost: 80000,
      grossProfit: 88000,
      grossMargin: 52.4,
      notes: '大型專案審核中，預計下月初核定。',
      createdBy: '系統管理者 (王總監)',
      updatedBy: '系統管理者 (王總監)',
      createdAt: '2026-08-20T08:00:00Z',
      updatedAt: '2026-08-20T08:00:00Z',
      items: [
        {
          id: 6,
          quotationId: 5,
          productId: 6,
          itemName: '企業級資安合規性稽核與滲透測試',
          description: '包含 OWASP Top 10 檢測與弱點報告',
          quantity: 1,
          unitPrice: 160000,
          costPrice: 80000,
          lineTotal: 160000,
          sortOrder: 0
        }
      ]
    }
  ];

  // 6. 交易資料 (Transactions with Cost, Gross Profit, Margin, Invoices, Paid/Remaining, Modifiers)
  let transactions: any[] = [
    {
      id: 1,
      transactionNumber: 'TX-20260830-01',
      quotationId: 1,
      quotationNumber: 'QT-20260830-01',
      customerName: '恆星科技 (Star Tech)',
      customerEmail: 'service@startech.tw',
      transactionDate: '2026-08-24',
      totalAmount: 450000,
      costPrice: 220000,
      paidAmount: 450000,
      remainingAmount: 0,
      grossProfit: 230000,
      grossMargin: 51.1,
      paymentMethod: '電匯 (Wire Transfer)',
      paymentStatus: 'PAID',
      fulfillmentStatus: 'COMPLETED',
      notes: '合約驗收完成，款項已全額入帳結案。',
      createdBy: '系統管理者 (王總監)',
      updatedBy: '系統管理者 (王總監)',
      invoices: [
        {
          id: 1,
          invoiceNumber: 'AA-12345678',
          invoiceDate: '2026-08-24',
          amount: 225000,
          status: 'PAID',
          notes: '頭期訂金款發票',
          createdBy: '系統管理者 (王總監)',
          updatedBy: '系統管理者 (王總監)',
          createdAt: '2026-08-24T08:30:00Z',
          updatedAt: '2026-08-24T08:30:00Z'
        },
        {
          id: 2,
          invoiceNumber: 'AA-12345679',
          invoiceDate: '2026-08-29',
          amount: 225000,
          status: 'PAID',
          notes: '驗收尾款發票',
          createdBy: '系統管理者 (王總監)',
          updatedBy: '系統管理者 (王總監)',
          createdAt: '2026-08-29T10:00:00Z',
          updatedAt: '2026-08-29T10:00:00Z'
        }
      ],
      createdAt: '2026-08-24T08:30:00Z',
      updatedAt: '2026-08-29T10:00:00Z'
    },
    {
      id: 2,
      transactionNumber: 'TX-20260830-02',
      quotationId: 2,
      quotationNumber: 'QT-20260830-02',
      customerName: '頂尖貿易股份有限公司',
      customerEmail: 'sales@apex-trade.com.tw',
      transactionDate: '2026-08-25',
      totalAmount: 28500,
      costPrice: 5000,
      paidAmount: 28500,
      remainingAmount: 0,
      grossProfit: 23500,
      grossMargin: 82.5,
      paymentMethod: '電匯 (Wire Transfer)',
      paymentStatus: 'PAID',
      fulfillmentStatus: 'COMPLETED',
      notes: 'API Key 已發送啟用，款項已入帳結案。',
      createdBy: '陳大明 (業務經理)',
      updatedBy: '陳大明 (業務經理)',
      invoices: [
        {
          id: 3,
          invoiceNumber: 'AB-98765432',
          invoiceDate: '2026-08-25',
          amount: 28500,
          status: 'PAID',
          notes: '全額授權發票',
          createdBy: '陳大明 (業務經理)',
          updatedBy: '陳大明 (業務經理)',
          createdAt: '2026-08-25T11:00:00Z',
          updatedAt: '2026-08-25T11:00:00Z'
        }
      ],
      createdAt: '2026-08-25T11:00:00Z',
      updatedAt: '2026-08-25T11:00:00Z'
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

  // 7. 使用者資料
  let users: any[] = [
    {
      id: 1,
      name: '系統管理者 (王總監)',
      username: 'admin',
      password: 'admin888',
      department: '資訊管理部',
      phone: '(02) 2345-6789 #101',
      email: 'admin@quotationpro.com.tw',
      role: 'ADMIN',
      allowedMenus: ['dashboard', 'customers', 'vendors', 'products', 'quotations', 'transactions', 'company', 'users', 'audit_logs'],
      status: 'ACTIVE',
      createdBy: '系統初始化',
      updatedBy: '系統管理者 (王總監)',
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
      allowedMenus: ['dashboard', 'customers', 'vendors', 'products', 'quotations', 'transactions'],
      status: 'ACTIVE',
      createdBy: '系統管理者 (王總監)',
      updatedBy: '系統管理者 (王總監)',
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
      createdBy: '系統管理者 (王總監)',
      updatedBy: '系統管理者 (王總監)',
      createdAt: '2026-08-10T14:30:00Z',
      updatedAt: '2026-08-23T14:30:00Z'
    },
    {
      id: 4,
      name: '張淑芬 (財務會計)',
      username: 'finance_wang',
      password: 'user123',
      department: '財務會計部',
      phone: '(02) 2345-6789 #301',
      email: 'finance@quotationpro.com.tw',
      role: 'USER',
      allowedMenus: ['dashboard', 'quotations', 'transactions'],
      status: 'ACTIVE',
      createdBy: '系統管理者 (王總監)',
      updatedBy: '系統管理者 (王總監)',
      createdAt: '2026-08-15T09:00:00Z',
      updatedAt: '2026-08-25T09:00:00Z'
    }
  ];

  // 8. 修改歷程記錄 (Audit Log)
  let auditLogs: any[] = [
    {
      id: 1,
      module: 'quotations',
      moduleName: '報價單管理',
      action: 'UPDATE',
      actionName: '修改報價單',
      targetKey: 'QT-20260830-01',
      targetName: '恆星科技 (Star Tech)',
      operator: '系統管理者 (王總監)',
      details: '更新報價單明細項目與條款備註，總額 NT$ 450,000',
      timestamp: '2026-08-24T08:00:00Z'
    },
    {
      id: 2,
      module: 'transactions',
      moduleName: '交易管理',
      action: 'CONVERT',
      actionName: '轉為交易',
      targetKey: 'TX-20260830-01',
      targetName: '恆星科技 (Star Tech)',
      operator: '系統管理者 (王總監)',
      details: '由報價單 QT-20260830-01 一鍵轉立案交易單，金額 NT$ 450,000',
      timestamp: '2026-08-24T08:30:00Z'
    },
    {
      id: 3,
      module: 'transactions',
      moduleName: '交易管理',
      action: 'INVOICE',
      actionName: '開立發票',
      targetKey: 'TX-20260830-01',
      targetName: '發票 AA-12345678',
      operator: '系統管理者 (王總監)',
      details: '新增開立頭期款發票 NT$ 225,000，狀態：已付',
      timestamp: '2026-08-24T08:35:00Z'
    },
    {
      id: 4,
      module: 'quotations',
      moduleName: '報價單管理',
      action: 'CREATE',
      actionName: '開立報價單',
      targetKey: 'QT-20260830-02',
      targetName: '頂尖貿易股份有限公司',
      operator: '陳大明 (業務經理)',
      details: '新開立 API 模組報價單，總額 NT$ 28,500',
      timestamp: '2026-08-23T10:00:00Z'
    },
    {
      id: 5,
      module: 'company',
      moduleName: '基本資料管理',
      action: 'UPDATE',
      actionName: '更新公司基本資料',
      targetKey: '極簡資訊科技股份有限公司',
      targetName: '主要公司基本資料',
      operator: '系統管理者 (王總監)',
      details: '更新營業地址與匯款銀行帳戶資訊',
      timestamp: '2026-08-25T10:00:00Z'
    }
  ];

  function addAuditLog(module: string, moduleName: string, action: string, actionName: string, targetKey: string, targetName: string, operator: string, details: string) {
    const newId = auditLogs.length > 0 ? Math.max(...auditLogs.map(l => l.id)) + 1 : 1;
    auditLogs.unshift({
      id: newId,
      module,
      moduleName,
      action,
      actionName,
      targetKey,
      targetName,
      operator: operator || '系統使用者',
      details,
      timestamp: new Date().toISOString()
    });
  }

  return {
    name: 'dev-api-mock',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url || '';
        if (!url.startsWith('/api')) {
          return next();
        }

        res.setHeader('Content-Type', 'application/json');

        // Mock 回應沿用正式 API 信封，讓本機測試能及早發現契約落差。
        const originalEnd = res.end.bind(res);
        res.end = ((chunk?: any, ...args: any[]) => {
          if (typeof chunk === 'string') {
            try {
              const payload = JSON.parse(chunk);
              if (payload && typeof payload === 'object' && typeof payload.success === 'boolean') {
                payload.data ??= null;
                payload.message ??= '';
                payload.error ??= null;
                payload.pagination ??= null;
                return originalEnd(JSON.stringify(payload), ...args);
              }
            } catch {
              // 非 JSON 回應維持原樣，避免遮蔽開發伺服器本身的錯誤。
            }
          }
          return originalEnd(chunk, ...args);
        }) as typeof res.end;

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
            message: '報價管理系統服務正常運行中'
          }));
          return;
        }

        // 2. Metrics / Dashboard (當年度 2026 統計 + 0 筆不顯示之狀態統計)
        if (url === '/api/metrics') {
          const currentYear = new Date().getFullYear().toString(); // e.g. "2026"
          
          // 篩選當年度報價單與交易單
          const yearQuotations = quotations.filter(q => {
            const dateStr = q.issueDate || q.createdAt || '';
            return dateStr.startsWith(currentYear);
          });

          const yearTransactions = transactions.filter(t => {
            const dateStr = t.transactionDate || t.createdAt || '';
            return dateStr.startsWith(currentYear);
          });

          // 當年度營業收入 (已付款總額)
          const yearRevenue = yearTransactions
            .filter(t => t.paymentStatus === 'PAID')
            .reduce((acc, t) => acc + (parseFloat(t.totalAmount) || 0), 0);

          // 當年度報價單總額
          const yearQuotationTotal = yearQuotations
            .reduce((acc, q) => acc + (parseFloat(q.totalAmount) || 0), 0);

          // 當年度已結案交易 (fulfillmentStatus === 'COMPLETED' 或 paymentStatus === 'PAID')
          const closedTransactions = yearTransactions.filter(t => t.fulfillmentStatus === 'COMPLETED' || t.paymentStatus === 'PAID');
          
          // 當年度已結案毛利 (Closed Profit)
          const closedProfit = closedTransactions.reduce((acc, t) => acc + (parseFloat(t.grossProfit) || 0), 0);

          // 當年度已結案毛利率 (Closed Profit Margin)
          const closedRevenue = closedTransactions.reduce((acc, t) => acc + (parseFloat(t.totalAmount) || 0), 0);
          const closedMargin = closedRevenue > 0 ? Number(((closedProfit / closedRevenue) * 100).toFixed(1)) : 0;

          // 報價單狀態分佈 (當年度)
          const statusCounts: Record<string, number> = {};
          yearQuotations.forEach(q => {
            const st = q.status || 'DRAFT';
            statusCounts[st] = (statusCounts[st] || 0) + 1;
          });

          res.end(JSON.stringify({
            success: true,
            data: {
              currentYear,
              yearRevenue,
              yearQuotationTotal,
              yearQuotationCount: yearQuotations.length,
              closedProfit,
              closedMargin,
              statusCounts, // 只包含 > 0 或全狀態，由前端進一步依 >0 渲染
              customersCount: customers.length,
              productsCount: products.length,
              transactionsCount: transactions.length,
              totalCustomers: customers.length,
              totalVendors: vendors.length,
              totalProducts: products.length,
              totalTransactions: transactions.length
            },
            message: '成功取得當年度商務統計指標'
          }));
          return;
        }

        // ==========================================
        // VENDORS API (/api/vendors)
        // ==========================================
        if (url.startsWith('/api/vendors')) {
          const parsedUrl = new URL(url, 'http://localhost:3000');
          const idMatch = url.match(/\/api\/vendors\/(\d+)/);
          const vendorId = idMatch ? parseInt(idMatch[1], 10) : null;

          if (vendorId && req.method === 'GET') {
            const v = vendors.find(item => item.id === vendorId);
            if (!v) {
              res.statusCode = 404;
              res.end(JSON.stringify({ success: false, data: null, message: '找不到該廠商' }));
              return;
            }
            res.end(JSON.stringify({ success: true, data: v, message: '成功取得廠商資料' }));
            return;
          }

          if (vendorId && req.method === 'PUT') {
            const payload = await getBody();
            const idx = vendors.findIndex(item => item.id === vendorId);
            if (idx === -1) {
              res.statusCode = 404;
              res.end(JSON.stringify({ success: false, data: null, message: '找不到該廠商' }));
              return;
            }
            const updatedBy = payload.updatedBy || '系統使用者';
            vendors[idx] = {
              ...vendors[idx],
              vendorCode: payload.vendorCode || vendors[idx].vendorCode,
              vendorName: payload.vendorName || vendors[idx].vendorName,
              taxId: payload.taxId ?? vendors[idx].taxId,
              phone: payload.phone ?? vendors[idx].phone,
              address: payload.address ?? vendors[idx].address,
              contactPerson: payload.contactPerson ?? vendors[idx].contactPerson,
              email: payload.email ?? vendors[idx].email,
              productsAndServices: payload.productsAndServices ?? vendors[idx].productsAndServices,
              notes: payload.notes ?? vendors[idx].notes,
              updatedBy,
              updatedAt: new Date().toISOString()
            };
            addAuditLog('vendors', '廠商管理', 'UPDATE', '修改廠商', vendors[idx].vendorCode, vendors[idx].vendorName, updatedBy, `更新廠商基本資訊與聯絡窗口`);
            res.end(JSON.stringify({ success: true, data: vendors[idx], message: '廠商資料更新成功' }));
            return;
          }

          if (vendorId && req.method === 'DELETE') {
            const target = vendors.find(item => item.id === vendorId);
            if (!target) {
              res.statusCode = 404;
              res.end(JSON.stringify({ success: false, data: null, message: '找不到該廠商' }));
              return;
            }
            const operator = parsedUrl.searchParams.get('operator') || '系統管理者';
            vendors = vendors.filter(item => item.id !== vendorId);
            addAuditLog('vendors', '廠商管理', 'DELETE', '刪除廠商', target.vendorCode, target.vendorName, operator, `刪除廠商：${target.vendorName}`);
            res.end(JSON.stringify({ success: true, data: { id: vendorId }, message: '廠商已成功刪除' }));
            return;
          }

          if (req.method === 'GET') {
            const search = (parsedUrl.searchParams.get('search') || '').toLowerCase().trim();
            let filtered = vendors.filter(v => {
              if (!search) return true;
              return (
                (v.vendorName || '').toLowerCase().includes(search) ||
                (v.vendorCode || '').toLowerCase().includes(search) ||
                (v.contactPerson || '').toLowerCase().includes(search) ||
                (v.phone || '').includes(search) ||
                (v.email || '').toLowerCase().includes(search) ||
                (v.productsAndServices || '').toLowerCase().includes(search)
              );
            });
            res.end(JSON.stringify({
              success: true,
              data: filtered,
              message: '成功取得廠商清單',
              pagination: { page: 1, limit: filtered.length, total: filtered.length, totalPages: 1, hasNext: false, hasPrev: false }
            }));
            return;
          }

          if (req.method === 'POST') {
            const payload = await getBody();
            const newId = vendors.length > 0 ? Math.max(...vendors.map(v => v.id)) + 1 : 1;
            const newCode = payload.vendorCode || `VND-${String(newId).padStart(3, '0')}`;
            const createdBy = payload.createdBy || '系統管理者';
            const newVendor = {
              id: newId,
              vendorCode: newCode,
              vendorName: payload.vendorName || '未命名廠商',
              taxId: payload.taxId || '',
              phone: payload.phone || '',
              address: payload.address || '',
              contactPerson: payload.contactPerson || '',
              email: payload.email || '',
              productsAndServices: payload.productsAndServices || '',
              notes: payload.notes || '',
              totalProducts: 0,
              cooperationCount: 0,
              createdBy,
              updatedBy: createdBy,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };
            vendors.unshift(newVendor);
            addAuditLog('vendors', '廠商管理', 'CREATE', '新增廠商', newVendor.vendorCode, newVendor.vendorName, createdBy, `新增合作廠商：${newVendor.vendorName}`);
            res.statusCode = 201;
            res.end(JSON.stringify({ success: true, data: newVendor, message: '廠商建立成功' }));
            return;
          }
        }

        // ==========================================
        // AUDIT LOGS API (/api/audit-logs)
        // ==========================================
        if (url.startsWith('/api/audit-logs') || url.startsWith('/api/audit_logs')) {
          const parsedUrl = new URL(url, 'http://localhost:3000');
          const search = (parsedUrl.searchParams.get('search') || '').toLowerCase().trim();
          const moduleFilter = parsedUrl.searchParams.get('module') || '';

          let filtered = auditLogs.filter(log => {
            if (moduleFilter && log.module !== moduleFilter) return false;
            if (!search) return true;
            return (
              (log.moduleName || '').toLowerCase().includes(search) ||
              (log.actionName || '').toLowerCase().includes(search) ||
              (log.targetKey || '').toLowerCase().includes(search) ||
              (log.targetName || '').toLowerCase().includes(search) ||
              (log.operator || '').toLowerCase().includes(search) ||
              (log.details || '').toLowerCase().includes(search)
            );
          });

          res.end(JSON.stringify({
            success: true,
            data: filtered,
            message: '成功取得修改歷程紀錄',
            pagination: { page: 1, limit: filtered.length, total: filtered.length, totalPages: 1, hasNext: false, hasPrev: false }
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

          if (customerId && req.method === 'PUT') {
            const payload = await getBody();
            const targetIdx = customers.findIndex(c => c.id === customerId);
            if (targetIdx === -1) {
              res.statusCode = 404;
              res.end(JSON.stringify({ success: false, data: null, message: '找不到該客戶' }));
              return;
            }
            const updatedBy = payload.updatedBy || '系統使用者';
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
              updatedBy,
              updatedAt: new Date().toISOString()
            };
            addAuditLog('customers', '客戶管理', 'UPDATE', '修改客戶', customers[targetIdx].customerCode, customers[targetIdx].customerName, updatedBy, `更新客戶基本資料與通訊地址`);
            res.end(JSON.stringify({ success: true, data: customers[targetIdx], message: '客戶資料更新成功' }));
            return;
          }

          if (customerId && req.method === 'DELETE') {
            const target = customers.find(c => c.id === customerId);
            if (!target) {
              res.statusCode = 404;
              res.end(JSON.stringify({ success: false, data: null, message: '找不到該客戶' }));
              return;
            }
            const operator = parsedUrl.searchParams.get('operator') || '系統管理者';
            customers = customers.filter(c => c.id !== customerId);
            addAuditLog('customers', '客戶管理', 'DELETE', '刪除客戶', target.customerCode, target.customerName, operator, `刪除客戶資料：${target.customerName}`);
            res.end(JSON.stringify({ success: true, data: { id: customerId }, message: '客戶已刪除' }));
            return;
          }

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
              pagination: { page: 1, limit: filtered.length, total: filtered.length, totalPages: 1, hasNext: false, hasPrev: false }
            }));
            return;
          }

          if (req.method === 'POST') {
            const payload = await getBody();
            const newId = customers.length > 0 ? Math.max(...customers.map(c => c.id)) + 1 : 1;
            const newCode = payload.customerCode || `CUST-${String(newId).padStart(3, '0')}`;
            const createdBy = payload.createdBy || '系統使用者';
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
              createdBy,
              updatedBy: createdBy,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };
            customers.unshift(newCustomer);
            addAuditLog('customers', '客戶管理', 'CREATE', '新增客戶', newCustomer.customerCode, newCustomer.customerName, createdBy, `新增客戶：${newCustomer.customerName}`);
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

          if (productId && req.method === 'PUT') {
            const payload = await getBody();
            const targetIdx = products.findIndex(p => p.id === productId);
            if (targetIdx === -1) {
              res.statusCode = 404;
              res.end(JSON.stringify({ success: false, data: null, message: '找不到該產品' }));
              return;
            }
            const updatedBy = payload.updatedBy || '系統使用者';
            products[targetIdx] = {
              ...products[targetIdx],
              productCode: payload.productCode || products[targetIdx].productCode,
              productName: payload.productName || products[targetIdx].productName,
              brand: payload.brand ?? products[targetIdx].brand,
              model: payload.model ?? products[targetIdx].model,
              vendor: payload.vendor ?? products[targetIdx].vendor,
              vendorId: payload.vendorId !== undefined ? payload.vendorId : products[targetIdx].vendorId,
              imageUrl: payload.imageUrl !== undefined ? payload.imageUrl : products[targetIdx].imageUrl,
              category: payload.category || products[targetIdx].category,
              unit: payload.unit || products[targetIdx].unit,
              unitPrice: parseFloat(payload.unitPrice) || 0,
              costPrice: parseFloat(payload.costPrice) || 0,
              stockQuantity: parseInt(payload.stockQuantity, 10) || 0,
              description: payload.description || '',
              status: payload.status || products[targetIdx].status,
              updatedBy,
              updatedAt: new Date().toISOString()
            };
            addAuditLog('products', '產品管理', 'UPDATE', '修改產品', products[targetIdx].productCode, products[targetIdx].productName, updatedBy, `更新產品價格、品牌型號與供應商`);
            res.end(JSON.stringify({ success: true, data: products[targetIdx], message: '產品更新成功' }));
            return;
          }

          if (productId && req.method === 'DELETE') {
            const target = products.find(p => p.id === productId);
            if (!target) {
              res.statusCode = 404;
              res.end(JSON.stringify({ success: false, data: null, message: '找不到該產品' }));
              return;
            }
            const operator = parsedUrl.searchParams.get('operator') || '系統管理者';
            products = products.filter(p => p.id !== productId);
            addAuditLog('products', '產品管理', 'DELETE', '刪除產品', target.productCode, target.productName, operator, `刪除產品：${target.productName}`);
            res.end(JSON.stringify({ success: true, data: { id: productId }, message: '產品已刪除' }));
            return;
          }

          if (req.method === 'GET') {
            const search = (parsedUrl.searchParams.get('search') || '').toLowerCase().trim();
            const category = parsedUrl.searchParams.get('category') || '';
            let filtered = products.filter(p => {
              if (category && p.category !== category) return false;
              if (!search) return true;
              return (
                (p.productName || '').toLowerCase().includes(search) ||
                (p.productCode || '').toLowerCase().includes(search) ||
                (p.brand || '').toLowerCase().includes(search) ||
                (p.model || '').toLowerCase().includes(search) ||
                (p.vendor || '').toLowerCase().includes(search) ||
                (p.category || '').toLowerCase().includes(search) ||
                (p.description || '').toLowerCase().includes(search)
              );
            });
            res.end(JSON.stringify({
              success: true,
              data: filtered,
              message: '成功取得產品清單',
              pagination: { page: 1, limit: filtered.length, total: filtered.length, totalPages: 1, hasNext: false, hasPrev: false }
            }));
            return;
          }

          if (req.method === 'POST') {
            const payload = await getBody();
            const newId = products.length > 0 ? Math.max(...products.map(p => p.id)) + 1 : 1;
            const newCode = payload.productCode || `PRD-${String(newId).padStart(3, '0')}`;
            const createdBy = payload.createdBy || '系統使用者';
            const newProduct = {
              id: newId,
              productCode: newCode,
              productName: payload.productName || '未命名產品',
              brand: payload.brand || '',
              model: payload.model || '',
              vendor: payload.vendor || '',
              vendorId: payload.vendorId || null,
              imageUrl: payload.imageUrl || '',
              category: payload.category || '一般商品',
              unit: payload.unit || '件',
              unitPrice: parseFloat(payload.unitPrice) || 0,
              costPrice: parseFloat(payload.costPrice) || 0,
              stockQuantity: parseInt(payload.stockQuantity, 10) || 100,
              description: payload.description || '',
              status: payload.status || 'ACTIVE',
              createdBy,
              updatedBy: createdBy,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };
            products.unshift(newProduct);
            addAuditLog('products', '產品管理', 'CREATE', '新增產品', newProduct.productCode, newProduct.productName, createdBy, `新增產品：${newProduct.productName} (${newProduct.brand || '無品牌'})`);
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

            if (targetQuotation.status !== 'ACCEPTED') {
              res.statusCode = 409;
              res.end(JSON.stringify({ success: false, data: null, message: '只有已核准的報價單可以轉為交易單' }));
              return;
            }

            if (transactions.some(t => t.quotationId === qId)) {
              res.statusCode = 409;
              res.end(JSON.stringify({ success: false, data: null, message: '此報價單已轉為交易，請至交易管理查看' }));
              return;
            }

            const bodyPayload = await getBody();
            const operator = bodyPayload.operator || targetQuotation.updatedBy || '系統經辦人';

            // 計算來源報價單總成本
            let totalCost = 0;
            if (targetQuotation.items && Array.isArray(targetQuotation.items)) {
              totalCost = targetQuotation.items.reduce((sum: number, it: any) => {
                const prod = products.find(p => p.id === it.productId);
                const cost = it.costPrice !== undefined ? parseFloat(it.costPrice) : (prod ? (prod.costPrice || 0) : 0);
                return sum + ((parseFloat(it.quantity) || 1) * cost);
              }, 0);
            }

            const newId = transactions.length > 0 ? Math.max(...transactions.map(t => t.id)) + 1 : 1;
            const todayStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
            const txNumber = `TX-${todayStr}-${String(newId).padStart(2, '0')}`;
            const totalAmt = parseFloat(targetQuotation.totalAmount) || 0;
            const profit = totalAmt - totalCost;
            const margin = totalAmt > 0 ? Number(((profit / totalAmt) * 100).toFixed(1)) : 0;

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
              grossProfit: profit,
              grossMargin: margin,
              paymentMethod: '電匯 (Wire Transfer)',
              paymentStatus: 'PENDING',
              fulfillmentStatus: 'PROCESSING',
              notes: `由報價單 ${targetQuotation.quotationNumber} 一鍵轉換成立。`,
              createdBy: operator,
              updatedBy: operator,
              invoices: [],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };

            transactions.unshift(newTx);
            addAuditLog('transactions', '交易管理', 'CONVERT', '轉為交易', txNumber, targetQuotation.customerName, operator, `由報價單 ${targetQuotation.quotationNumber} 成功轉成立案交易，金額 NT$ ${totalAmt.toLocaleString()}`);
            
            res.statusCode = 201;
            res.end(JSON.stringify({
              success: true,
              data: newTx,
              message: `已成功將報價單 ${targetQuotation.quotationNumber} 轉為交易單 ${txNumber}！`
            }));
            return;
          }

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

          if (transactionId && req.method === 'PUT') {
            const payload = await getBody();
            const targetIdx = transactions.findIndex(t => t.id === transactionId);
            if (targetIdx === -1) {
              res.statusCode = 404;
              res.end(JSON.stringify({ success: false, data: null, message: '找不到該交易紀錄' }));
              return;
            }

            const totalAmount = parseFloat(payload.totalAmount) || 0;
            const costPrice = parseFloat(payload.costPrice) || 0;
            const paidAmount = parseFloat(payload.paidAmount) || 0;
            const remainingAmount = Math.max(0, totalAmount - paidAmount);
            const profit = totalAmount - costPrice;
            const margin = totalAmount > 0 ? Number(((profit / totalAmount) * 100).toFixed(1)) : 0;
            const updatedBy = payload.updatedBy || '系統使用者';

            transactions[targetIdx] = {
              ...transactions[targetIdx],
              customerName: payload.customerName || transactions[targetIdx].customerName,
              customerEmail: payload.customerEmail || '',
              transactionDate: payload.transactionDate || transactions[targetIdx].transactionDate,
              totalAmount,
              costPrice,
              paidAmount,
              remainingAmount,
              grossProfit: profit,
              grossMargin: margin,
              paymentMethod: payload.paymentMethod || transactions[targetIdx].paymentMethod,
              paymentStatus: payload.paymentStatus || transactions[targetIdx].paymentStatus,
              fulfillmentStatus: payload.fulfillmentStatus || transactions[targetIdx].fulfillmentStatus,
              notes: payload.notes || '',
              updatedBy,
              invoices: Array.isArray(payload.invoices) ? payload.invoices : transactions[targetIdx].invoices,
              updatedAt: new Date().toISOString()
            };

            addAuditLog('transactions', '交易管理', 'UPDATE', '修改交易', transactions[targetIdx].transactionNumber, transactions[targetIdx].customerName, updatedBy, `更新交易財務與發票紀錄，已收 NT$ ${paidAmount.toLocaleString()}`);
            res.end(JSON.stringify({ success: true, data: transactions[targetIdx], message: '交易紀錄與發票更新成功' }));
            return;
          }

          if (transactionId && req.method === 'DELETE') {
            const target = transactions.find(t => t.id === transactionId);
            if (!target) {
              res.statusCode = 404;
              res.end(JSON.stringify({ success: false, data: null, message: '找不到該交易紀錄' }));
              return;
            }
            const operator = parsedUrl.searchParams.get('operator') || '系統管理者';
            transactions = transactions.filter(t => t.id !== transactionId);
            addAuditLog('transactions', '交易管理', 'DELETE', '刪除交易', target.transactionNumber, target.customerName, operator, `刪除交易單：${target.transactionNumber}`);
            res.end(JSON.stringify({ success: true, data: { id: transactionId }, message: '交易紀錄已刪除' }));
            return;
          }

          if (req.method === 'GET') {
            const search = (parsedUrl.searchParams.get('search') || '').toLowerCase().trim();
            const paymentFilter = parsedUrl.searchParams.get('paymentStatus') || '';
            let filtered = transactions.filter(t => {
              if (paymentFilter && t.paymentStatus !== paymentFilter) return false;
              if (!search) return true;
              return (
                (t.transactionNumber || '').toLowerCase().includes(search) ||
                (t.customerName || '').toLowerCase().includes(search) ||
                (t.quotationNumber || '').toLowerCase().includes(search) ||
                (t.notes || '').toLowerCase().includes(search)
              );
            });
            res.end(JSON.stringify({
              success: true,
              data: filtered,
              message: '成功取得交易清單',
              pagination: { page: 1, limit: filtered.length, total: filtered.length, totalPages: 1, hasNext: false, hasPrev: false }
            }));
            return;
          }

          if (req.method === 'POST') {
            const payload = await getBody();
            const newId = transactions.length > 0 ? Math.max(...transactions.map(t => t.id)) + 1 : 1;
            const todayStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
            const txNumber = payload.transactionNumber || `TX-${todayStr}-${String(newId).padStart(2, '0')}`;
            const totalAmount = parseFloat(payload.totalAmount) || 0;
            const costPrice = parseFloat(payload.costPrice) || 0;
            const paidAmount = parseFloat(payload.paidAmount) || 0;
            const remainingAmount = Math.max(0, totalAmount - paidAmount);
            const profit = totalAmount - costPrice;
            const margin = totalAmount > 0 ? Number(((profit / totalAmount) * 100).toFixed(1)) : 0;
            const creator = payload.createdBy || '系統管理者';

            const newTx = {
              id: newId,
              transactionNumber: txNumber,
              quotationId: payload.quotationId || null,
              quotationNumber: payload.quotationNumber || '',
              customerName: payload.customerName || '未命名客戶',
              customerEmail: payload.customerEmail || '',
              transactionDate: payload.transactionDate || new Date().toISOString().split('T')[0],
              totalAmount,
              costPrice,
              paidAmount,
              remainingAmount,
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
            addAuditLog('transactions', '交易管理', 'CREATE', '新增交易', txNumber, newTx.customerName, creator, `手動建立交易單，金額 NT$ ${totalAmount.toLocaleString()}`);
            res.statusCode = 201;
            res.end(JSON.stringify({ success: true, data: newTx, message: '交易單與發票建立成功' }));
            return;
          }
        }

        // ==========================================
        // QUOTATIONS API (/api/quotations)
        // ==========================================
        if (url.startsWith('/api/quotations') && req.method === 'GET' && !url.match(/\/api\/quotations\/\d+/)) {
          const parsedUrl = new URL(url, 'http://localhost:3000');
          const page = parseInt(parsedUrl.searchParams.get('page') || '1', 10);
          const pageSize = parseInt(parsedUrl.searchParams.get('limit') || parsedUrl.searchParams.get('pageSize') || '10', 10);
          const search = (parsedUrl.searchParams.get('search') || '').toLowerCase().trim();
          const statusFilter = parsedUrl.searchParams.get('status') || parsedUrl.searchParams.get('statusFilter') || '';
          const today = new Date().toISOString().slice(0, 10);
          quotations.forEach((quotation) => {
            const expiryDate = quotation.expiryDate || quotation.validUntil;
            if (expiryDate && expiryDate < today && ['DRAFT', 'SENT'].includes(quotation.status)) {
              quotation.status = 'EXPIRED';
              quotation.updatedAt = new Date().toISOString();
            }
          });

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
          // 正式清單 API 不含 items；編輯或預覽必須改用 GET /api/quotations/{id}。
          const paginatedData = filtered.slice(offset, offset + pageSize).map(({ items, ...quotation }) => ({
            ...quotation,
            hasTransaction: transactions.some(t => t.quotationId === quotation.id)
          }));

          res.end(JSON.stringify({
            success: true,
            data: paginatedData,
            message: '成功取得報價單清單',
            error: null,
            pagination: {
              page,
              limit: pageSize,
              total: totalRecords,
              totalPages,
              hasNext: page < totalPages,
              hasPrev: page > 1
            }
          }));
          return;
        }

        const getQuotationMatch = url.match(/\/api\/quotations\/(\d+)/);
        if (getQuotationMatch && req.method === 'GET') {
          const id = parseInt(getQuotationMatch[1], 10);
          const item = quotations.find((q) => q.id === id);
          if (!item) {
            res.statusCode = 404;
            res.end(JSON.stringify({ success: false, data: null, message: '找不到該報價單' }));
            return;
          }
          res.end(JSON.stringify({
            success: true,
            data: { ...item, hasTransaction: transactions.some(t => t.quotationId === id) },
            message: '成功取得報價單詳細資料'
          }));
          return;
        }

        const reviseQuotationMatch = url.match(/\/api\/quotations\/(\d+)\/revise$/);
        if (reviseQuotationMatch && req.method === 'POST') {
          const id = parseInt(reviseQuotationMatch[1], 10);
          const targetQuotation = quotations.find((quotation) => quotation.id === id);
          if (!targetQuotation) {
            res.statusCode = 404;
            res.end(JSON.stringify({ success: false, data: null, message: '找不到該報價單' }));
            return;
          }
          if (transactions.some(transaction => transaction.quotationId === id)) {
            res.statusCode = 409;
            res.end(JSON.stringify({ success: false, data: null, message: '已轉為交易單的報價不可更改，請至交易管理處理' }));
            return;
          }

          const payload = await getBody();
          const operator = payload.operator || '系統使用者';
          const revisionPrefix = `${targetQuotation.quotationNumber}-R`;
          const revisionIndexes = quotations
            .map(quotation => quotation.quotationNumber)
            .filter(number => number.startsWith(revisionPrefix))
            .map(number => Number(number.slice(revisionPrefix.length)))
            .filter(Number.isInteger);
          const newQuotationNumber = `${revisionPrefix}${Math.max(0, ...revisionIndexes) + 1}`;
          const newId = quotations.length > 0 ? Math.max(...quotations.map(quotation => quotation.id)) + 1 : 1;
          const issueDate = new Date().toISOString().slice(0, 10);
          const expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

          targetQuotation.status = 'REJECTED';
          targetQuotation.updatedBy = operator;
          targetQuotation.updatedAt = new Date().toISOString();
          const newQuotation = {
            ...targetQuotation,
            id: newId,
            quotationNumber: newQuotationNumber,
            issueDate,
            expiryDate,
            validUntil: expiryDate,
            status: 'DRAFT',
            createdBy: operator,
            updatedBy: operator,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            items: (targetQuotation.items || []).map((item: any, index: number) => ({
              ...item,
              id: index + 1,
              quotationId: newId
            }))
          };
          quotations.unshift(newQuotation);
          addAuditLog('quotations', '報價單管理', 'REVISE', '更改報價單', newQuotationNumber, targetQuotation.customerName, operator, `原報價單 ${targetQuotation.quotationNumber} 已拒絕，建立新草稿 ${newQuotationNumber}`);
          res.statusCode = 201;
          res.end(JSON.stringify({
            success: true,
            data: { id: newId, quotationNumber: newQuotationNumber },
            message: `已拒絕原報價單並建立新草稿 ${newQuotationNumber}`
          }));
          return;
        }

        if (url === '/api/quotations' && req.method === 'POST') {
          try {
            const payload = await getBody();
            const newId = quotations.length > 0 ? Math.max(...quotations.map((q) => q.id)) + 1 : 1;
            const creator = payload.createdBy || '系統管理者';
            
            let subtotal = 0;
            let totalCost = 0;
            const items = (payload.items || []).map((it: any, idx: number) => {
              const lineTotal = (parseFloat(it.quantity) || 0) * (parseFloat(it.unitPrice) || 0);
              const cost = it.costPrice !== undefined ? parseFloat(it.costPrice) : 0;
              subtotal += lineTotal;
              totalCost += ((parseFloat(it.quantity) || 0) * cost);
              return {
                id: idx + 1,
                quotationId: newId,
                productId: it.productId || null,
                itemName: it.itemName,
                description: it.description || '',
                quantity: parseFloat(it.quantity) || 1,
                unitPrice: parseFloat(it.unitPrice) || 0,
                costPrice: cost,
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

            const profit = totalAmount - totalCost;
            const margin = totalAmount > 0 ? Number(((profit / totalAmount) * 100).toFixed(1)) : 0;

            const newQuotation = {
              id: newId,
              quotationNumber: payload.quotationNumber,
              companyId: payload.companyId || (companies[0]?.id || 1),
              companyName: payload.companyName || (companies[0]?.companyName || '極簡資訊科技股份有限公司'),
              companyContactPerson: payload.companyContactPerson || (companies[0]?.contactPerson || ''),
              companyContactPhone: payload.companyContactPhone || (companies[0]?.contactPhone || ''),
              companyContactEmail: payload.companyContactEmail || (companies[0]?.contactEmail || ''),
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
              totalCost,
              grossProfit: profit,
              grossMargin: margin,
              notes: payload.notes || null,
              createdBy: creator,
              updatedBy: creator,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              items
            };

            quotations.unshift(newQuotation);
            addAuditLog('quotations', '報價單管理', 'CREATE', '開立報價單', newQuotation.quotationNumber, newQuotation.customerName, creator, `開立新報價單，金額 NT$ ${totalAmount.toLocaleString()}`);

            res.statusCode = 201;
            res.end(JSON.stringify({
              success: true,
              data: { id: newId, quotationNumber: payload.quotationNumber },
              message: '報價單建立成功'
            }));
          } catch (err: any) {
            res.statusCode = 400;
            res.end(JSON.stringify({ success: false, data: null, message: '參數解析失敗', error: err.message }));
          }
          return;
        }

        const putQuotationMatch = url.match(/\/api\/quotations\/(\d+)/);
        if (putQuotationMatch && req.method === 'PUT') {
          const id = parseInt(putQuotationMatch[1], 10);
          try {
            const payload = await getBody();
            const targetIdx = quotations.findIndex((q) => q.id === id);
            if (targetIdx === -1) {
              res.statusCode = 404;
              res.end(JSON.stringify({ success: false, data: null, message: '找不到該報價單' }));
              return;
            }

            const updatedBy = payload.updatedBy || '系統使用者';
            let subtotal = 0;
            let totalCost = 0;
            const items = (payload.items || []).map((it: any, idx: number) => {
              const lineTotal = (parseFloat(it.quantity) || 0) * (parseFloat(it.unitPrice) || 0);
              const cost = it.costPrice !== undefined ? parseFloat(it.costPrice) : 0;
              subtotal += lineTotal;
              totalCost += ((parseFloat(it.quantity) || 0) * cost);
              return {
                id: idx + 1,
                quotationId: id,
                productId: it.productId || null,
                itemName: it.itemName,
                description: it.description || '',
                quantity: parseFloat(it.quantity) || 1,
                unitPrice: parseFloat(it.unitPrice) || 0,
                costPrice: cost,
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

            const profit = totalAmount - totalCost;
            const margin = totalAmount > 0 ? Number(((profit / totalAmount) * 100).toFixed(1)) : 0;

            quotations[targetIdx] = {
              ...quotations[targetIdx],
              quotationNumber: payload.quotationNumber,
              companyId: payload.companyId || quotations[targetIdx].companyId,
              companyName: payload.companyName || quotations[targetIdx].companyName,
              companyContactPerson: payload.companyContactPerson ?? quotations[targetIdx].companyContactPerson,
              companyContactPhone: payload.companyContactPhone ?? quotations[targetIdx].companyContactPhone,
              companyContactEmail: payload.companyContactEmail ?? quotations[targetIdx].companyContactEmail,
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
              totalCost,
              grossProfit: profit,
              grossMargin: margin,
              notes: payload.notes || null,
              updatedBy,
              updatedAt: new Date().toISOString(),
              items
            };

            addAuditLog('quotations', '報價單管理', 'UPDATE', '修改報價單', quotations[targetIdx].quotationNumber, quotations[targetIdx].customerName, updatedBy, `修改報價單內容，調整後總額 NT$ ${totalAmount.toLocaleString()}`);

            res.end(JSON.stringify({
              success: true,
              data: { id, quotationNumber: payload.quotationNumber },
              message: '報價單更新成功'
            }));
          } catch (err: any) {
            res.statusCode = 400;
            res.end(JSON.stringify({ success: false, data: null, message: '更新失敗', error: err.message }));
          }
          return;
        }

        const deleteQuotationMatch = url.match(/\/api\/quotations\/(\d+)/);
        if (deleteQuotationMatch && req.method === 'DELETE') {
          const id = parseInt(deleteQuotationMatch[1], 10);
          const target = quotations.find((q) => q.id === id);
          if (!target) {
            res.statusCode = 404;
            res.end(JSON.stringify({ success: false, data: null, message: '找不到該報價單' }));
            return;
          }
          const parsedUrl = new URL(url, 'http://localhost:3000');
          const operator = parsedUrl.searchParams.get('operator') || '系統管理者';
          quotations = quotations.filter((q) => q.id !== id);
          addAuditLog('quotations', '報價單管理', 'DELETE', '刪除報價單', target.quotationNumber, target.customerName, operator, `刪除報價單：${target.quotationNumber}`);
          res.end(JSON.stringify({
            success: true,
            data: { id, quotationNumber: target.quotationNumber },
            message: '報價單已成功刪除'
          }));
          return;
        }

        // ==========================================
        // COMPANIES API (/api/companies & /api/company)
        // ==========================================
        if (url.startsWith('/api/companies') || url.startsWith('/api/company')) {
          const parsedUrl = new URL(url, 'http://localhost:3000');
          const idMatch = url.match(/\/api\/companies\/(\d+)/);
          const compId = idMatch ? parseInt(idMatch[1], 10) : null;

          if (url === '/api/company' && req.method === 'GET') {
            const company = companies.find(c => c.isDefault) || companies[0];
            if (!company) {
              res.statusCode = 404;
              res.end(JSON.stringify({ success: false, message: '尚未建立公司資料' }));
              return;
            }
            res.end(JSON.stringify({ success: true, data: company, message: '取得公司基本資料成功' }));
            return;
          }

          if (compId && req.method === 'GET') {
            const comp = companies.find(c => c.id === compId);
            if (!comp) {
              res.statusCode = 404;
              res.end(JSON.stringify({ success: false, data: null, message: '找不到該公司基本資料' }));
              return;
            }
            res.end(JSON.stringify({ success: true, data: comp, message: '成功取得公司資料' }));
            return;
          }

          if (compId && req.method === 'PUT') {
            const payload = await getBody();
            const idx = companies.findIndex(c => c.id === compId);
            if (idx === -1) {
              res.statusCode = 404;
              res.end(JSON.stringify({ success: false, data: null, message: '找不到該公司基本資料' }));
              return;
            }
            const updatedBy = payload.updatedBy || '系統管理者';
            if (payload.isDefault) {
              companies.forEach(c => { c.isDefault = (c.id === compId); });
            }
            companies[idx] = {
              ...companies[idx],
              companyName: payload.companyName || companies[idx].companyName,
              taxId: payload.taxId ?? companies[idx].taxId,
              phone: payload.phone ?? companies[idx].phone,
              fax: payload.fax ?? companies[idx].fax,
              email: payload.email ?? companies[idx].email,
              website: payload.website ?? companies[idx].website,
              address: payload.address ?? companies[idx].address,
              contactPerson: payload.contactPerson ?? companies[idx].contactPerson,
              contactPhone: payload.contactPhone ?? companies[idx].contactPhone,
              contactEmail: payload.contactEmail ?? companies[idx].contactEmail,
              logoUrl: payload.logoUrl !== undefined ? payload.logoUrl : companies[idx].logoUrl,
              bankName: payload.bankName ?? companies[idx].bankName,
              bankAccount: payload.bankAccount ?? companies[idx].bankAccount,
              bankAccountName: payload.bankAccountName ?? companies[idx].bankAccountName,
              defaultTerms: payload.defaultTerms ?? companies[idx].defaultTerms,
              isDefault: payload.isDefault !== undefined ? payload.isDefault : companies[idx].isDefault,
              updatedBy,
              updatedAt: new Date().toISOString()
            };
            addAuditLog('company', '基本資料管理', 'UPDATE', '修改公司資料', companies[idx].companyName, companies[idx].companyName, updatedBy, `更新公司抬頭、LOGO、聯絡窗口與帳戶設定`);
            res.end(JSON.stringify({ success: true, data: companies[idx], message: '公司基本資料已成功儲存' }));
            return;
          }

          if (compId && req.method === 'DELETE') {
            if (companies.length <= 1) {
              res.statusCode = 400;
              res.end(JSON.stringify({ success: false, data: null, message: '系統必須保留至少一家開立主體公司' }));
              return;
            }
            const target = companies.find(c => c.id === compId);
            if (!target) {
              res.statusCode = 404;
              res.end(JSON.stringify({ success: false, data: null, message: '找不到該公司' }));
              return;
            }
            const operator = parsedUrl.searchParams.get('operator') || '系統管理者';
            companies = companies.filter(c => c.id !== compId);
            if (!companies.some(c => c.isDefault) && companies.length > 0) {
              companies[0].isDefault = true;
            }
            addAuditLog('company', '基本資料管理', 'DELETE', '刪除公司', target.companyName, target.companyName, operator, `刪除公司抬頭：${target.companyName}`);
            res.end(JSON.stringify({ success: true, data: { id: compId }, message: '公司基本資料已刪除' }));
            return;
          }

          if (req.method === 'POST') {
            const payload = await getBody();
            const newId = companies.length > 0 ? Math.max(...companies.map(c => c.id)) + 1 : 1;
            const createdBy = payload.createdBy || '系統管理者';
            if (payload.isDefault) {
              companies.forEach(c => { c.isDefault = false; });
            }
            const newCompany = {
              id: newId,
              companyName: payload.companyName || '新成立主體公司',
              taxId: payload.taxId || '',
              phone: payload.phone || '',
              fax: payload.fax || '',
              email: payload.email || '',
              website: payload.website || '',
              address: payload.address || '',
              contactPerson: payload.contactPerson || '',
              contactPhone: payload.contactPhone || '',
              contactEmail: payload.contactEmail || '',
              logoUrl: payload.logoUrl || '',
              bankName: payload.bankName || '',
              bankAccount: payload.bankAccount || '',
              bankAccountName: payload.bankAccountName || (payload.companyName || ''),
              defaultTerms: payload.defaultTerms || '1. 本報價單有效期限為 30 天。\n2. 付款條件為月結 30 天。',
              isDefault: payload.isDefault || companies.length === 0,
              createdBy,
              updatedBy: createdBy,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };
            companies.push(newCompany);
            addAuditLog('company', '基本資料管理', 'CREATE', '新增公司', newCompany.companyName, newCompany.companyName, createdBy, `新增主體公司：${newCompany.companyName}`);
            res.statusCode = 201;
            res.end(JSON.stringify({ success: true, data: newCompany, message: '公司基本資料建立成功' }));
            return;
          }

          if (req.method === 'GET') {
            res.end(JSON.stringify({
              success: true,
              data: companies,
              message: '成功取得所有主體公司清單'
            }));
            return;
          }
        }

        // ==========================================
        // AUTH API (/api/auth/login, /api/auth/logout)
        // ==========================================
        if (url === '/api/auth/login' && req.method === 'POST') {
          try {
            const payload = await getBody();
            const { username, password } = payload;
            if (!username) {
              res.statusCode = 400;
              res.end(JSON.stringify({ success: false, data: null, message: '請輸入使用者帳號' }));
              return;
            }
            const user = users.find(u => u.username.toLowerCase() === username.trim().toLowerCase());
            if (!user) {
              res.statusCode = 401;
              res.end(JSON.stringify({ success: false, data: null, message: '帳號不存在，請檢查輸入或選擇預設測試帳號' }));
              return;
            }
            if (user.status !== 'ACTIVE') {
              res.statusCode = 403;
              res.end(JSON.stringify({ success: false, data: null, message: '該帳號已被停用，請聯繫系統管理者' }));
              return;
            }
            const inputPwd = (password || '').trim();
            const isMatch = !user.password || user.password === inputPwd || 
              (user.username === 'admin' && ['admin888', 'admin123', 'admin'].includes(inputPwd)) ||
              (user.role === 'USER' && ['user123', '123456'].includes(inputPwd));

            if (!isMatch && inputPwd !== user.password) {
              res.statusCode = 401;
              res.end(JSON.stringify({ success: false, data: null, message: '密碼不正確，請確認密碼（管理員預設 admin888 或 admin123）' }));
              return;
            }

            addAuditLog('users', '使用者認證', 'LOGIN', '使用者登入', user.username, user.name, user.name, `${user.name} 成功登入系統`);

            res.statusCode = 200;
            res.end(JSON.stringify({
              success: true,
              data: {
                id: user.id,
                name: user.name,
                username: user.username,
                department: user.department,
                role: user.role,
                phone: user.phone,
                email: user.email,
                allowedMenus: user.allowedMenus,
                status: user.status,
                // 僅供 Vite 記憶體 Mock API 使用；正式 API 會簽發 HMAC 權杖。
                accessToken: 'vite-development-session'
              },
              message: `歡迎回來，${user.name}！登入成功`
            }));
          } catch (err: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, data: null, message: '登入程序異常', error: err.message }));
          }
          return;
        }

        if (url === '/api/auth/logout' && req.method === 'POST') {
          res.statusCode = 200;
          res.end(JSON.stringify({ success: true, data: null, message: '已安全登出系統' }));
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
            const createdBy = payload.createdBy || '系統管理者';
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
              createdBy,
              updatedBy: createdBy,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };

            users.push(newUser);
            addAuditLog('users', '使用者與權限管理', 'CREATE', '新增使用者', newUser.username, newUser.name, createdBy, `新增使用者：${newUser.name} (${newUser.role})`);
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

            const updatedBy = payload.updatedBy || '系統管理者';
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
              updatedBy,
              updatedAt: new Date().toISOString()
            };

            addAuditLog('users', '使用者與權限管理', 'UPDATE', '修改使用者權限', users[idx].username, users[idx].name, updatedBy, `更新使用者帳號資料與左側選單存取權限`);
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
          const parsedUrl = new URL(url, 'http://localhost:3000');
          const operator = parsedUrl.searchParams.get('operator') || '系統管理者';
          users = users.filter(u => u.id !== userId);
          addAuditLog('users', '使用者與權限管理', 'DELETE', '刪除使用者', target.username, target.name, operator, `刪除使用者：${target.name}`);
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
    // 正式介面位於 public/，本機 Vite 預覽也必須使用同一份入口，避免顯示空白 React 容器。
    root: 'public',
    // root 改為 public 後，仍需將同目錄的原生 JavaScript/CSS 一併複製到建置產物。
    publicDir: path.resolve(__dirname, 'public'),
    build: {
      outDir: path.resolve(__dirname, 'dist'),
      emptyOutDir: true,
    },
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
