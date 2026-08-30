/**
 * 極簡 Web 版報價與商務管理系統 - 前端核心邏輯 (Vanilla JS)
 * 涵蓋四大模組：客戶管理、產品管理、報價單管理、交易管理 + 儀表板總覽
 * 遵守命名慣例：變數/函式 camelCase, 常數 UPPER_SNAKE, 布林值具備 is/has/can 前綴
 */

// ============================================================================
// 1. 常數定義 (CONSTANTS)
// ============================================================================
const API_BASE_URL = "/api";
const DEFAULT_TAX_RATE = 5.0;

// ============================================================================
// 2. 狀態管理 (STATE MANAGEMENT)
// ============================================================================
const appState = {
  currentView: "dashboard", // 'dashboard' | 'customers' | 'products' | 'quotations' | 'transactions' | 'company' | 'users'
  
  // 當前登入使用者與權限控制
  currentUser: {
    id: "usr_admin",
    name: "系統管理員 (王總監)",
    username: "admin",
    role: "ADMIN",
    department: "資訊管理部",
    email: "admin@quotationpro.com.tw",
    phone: "02-2345-6789 #100",
    allowedMenus: ["dashboard", "customers", "products", "quotations", "transactions", "company", "users"]
  },

  // 使用者管理狀態
  users: [],
  currentUserId: null,
  isEditUserMode: false,
  userSearchKeyword: "",
  userRoleFilter: "",

  // 企業基本資料與抬頭設定
  companySettings: {
    companyName: "極簡資訊科技股份有限公司",
    taxId: "28491023",
    phone: "(02) 2345-6789",
    fax: "(02) 2345-6780",
    email: "contact@quotationpro.com.tw",
    website: "https://www.quotationpro.com.tw",
    address: "台北市信義區松仁路 100 號 18 樓",
    bankName: "台灣銀行 信義分行",
    bankAccount: "012-345-678901",
    bankAccountName: "極簡資訊科技股份有限公司",
    defaultTerms: "1. 本報價單有效期限為 30 天。\n2. 付款條件為月結 30 天。\n3. 保固服務：自驗收日起提供一年軟硬體保固與技術諮詢。"
  },

  // 報價單狀態
  quotations: [],
  currentQuotationId: null,
  isEditQuotationMode: false,
  quotationPagination: {
    currentPage: 1,
    pageSize: 10,
    totalRecords: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPrevPage: false
  },
  quotationSearchKeyword: "",
  quotationStatusFilter: "",

  // 客戶狀態
  customers: [],
  currentCustomerId: null,
  isEditCustomerMode: false,
  customerSearchKeyword: "",

  // 產品狀態
  products: [],
  currentProductId: null,
  isEditProductMode: false,
  productSearchKeyword: "",
  productCategoryFilter: "",

  // 交易狀態
  transactions: [],
  currentTransactionId: null,
  isEditTransactionMode: false,
  transactionSearchKeyword: "",
  transactionPaymentFilter: "",

  // 通用刪除目標
  deleteTarget: {
    type: null, // 'quotation' | 'customer' | 'product' | 'transaction' | 'user'
    id: null,
    title: ""
  },

  isSubmitting: false,
  isLoading: false
};

// ============================================================================
// 3. 工具函式 (UTILITY FUNCTIONS)
// ============================================================================

/**
 * 格式化貨幣數字為 NT$ 或千分位
 */
function formatCurrency(amount) {
  const numericVal = parseFloat(amount) || 0;
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(numericVal);
}

/**
 * 格式化日期格式為 YYYY-MM-DD
 */
function formatDate(dateString) {
  if (!dateString) return "-";
  const dateObj = new Date(dateString);
  if (isNaN(dateObj.getTime())) return dateString;
  return dateObj.toISOString().split("T")[0];
}

/**
 * 格式化日期與時間為 YYYY-MM-DD HH:mm
 */
function formatDateTime(dateString) {
  if (!dateString) return "-";
  const dateObj = new Date(dateString);
  if (isNaN(dateObj.getTime())) return dateString;
  const pad = (n) => String(n).padStart(2, "0");
  const year = dateObj.getFullYear();
  const month = pad(dateObj.getMonth() + 1);
  const day = pad(dateObj.getDate());
  const hours = pad(dateObj.getHours());
  const minutes = pad(dateObj.getMinutes());
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

/**
 * 取得狀態對應的 Bootstrap Badge 樣式 (報價單)
 */
function getStatusBadge(status) {
  const statusMap = {
    DRAFT: { label: "草稿", className: "badge-draft", icon: "📝" },
    SENT: { label: "已發送 / 審核中", className: "badge-sent", icon: "📤" },
    ACCEPTED: { label: "已簽約 / 已核准", className: "badge-accepted", icon: "✅" },
    REJECTED: { label: "已拒絕", className: "badge-rejected", icon: "❌" },
    EXPIRED: { label: "已過期", className: "badge-expired", icon: "⏳" }
  };
  const config = statusMap[status] || { label: status, className: "badge-draft", icon: "•" };
  return `<span class="badge ${config.className} px-2.5 py-1.5 fw-bold">${config.icon ? `<span class="me-1">${config.icon}</span>` : ""}${config.label}</span>`;
}

/**
 * 取得產品狀態 Badge
 */
function getProductStatusBadge(status) {
  const statusMap = {
    ACTIVE: { label: "供應中", className: "bg-success" },
    INACTIVE: { label: "暫停銷售", className: "bg-warning text-dark" },
    DISCONTINUED: { label: "已停售", className: "bg-secondary" }
  };
  const config = statusMap[status] || { label: status, className: "bg-secondary" };
  return `<span class="badge ${config.className} px-2 py-1">${config.label}</span>`;
}

/**
 * 取得付款狀態 Badge
 */
function getPaymentStatusBadge(status) {
  const statusMap = {
    PAID: { label: "已付款", className: "bg-success" },
    PENDING: { label: "請款中 / 待付", className: "bg-warning text-dark" },
    PARTIAL: { label: "部分付款", className: "bg-info text-dark" },
    REFUNDED: { label: "已退款", className: "bg-danger" }
  };
  const config = statusMap[status] || { label: status, className: "bg-secondary" };
  return `<span class="badge ${config.className} px-2 py-1">${config.label}</span>`;
}

/**
 * 取得交付進度 Badge
 */
function getFulfillmentStatusBadge(status) {
  const statusMap = {
    PROCESSING: { label: "處理中", className: "badge bg-info text-dark" },
    DELIVERED: { label: "已交付", className: "badge bg-primary" },
    COMPLETED: { label: "已結案", className: "badge bg-success" },
    CANCELLED: { label: "已取消", className: "badge bg-secondary" }
  };
  const config = statusMap[status] || { label: status, className: "badge bg-secondary" };
  return `<span class="${config.className} px-2 py-1">${config.label}</span>`;
}

/**
 * 取得發票狀況 Badge
 */
function getInvoiceStatusBadge(status) {
  const statusMap = {
    PAID: { label: "已付", className: "badge bg-success" },
    PENDING: { label: "待付", className: "badge bg-warning text-dark" },
    CANCELLED: { label: "取消", className: "badge bg-danger" }
  };
  const config = statusMap[status] || { label: status, className: "badge bg-secondary" };
  return `<span class="${config.className} px-1.5 py-0.5" style="font-size: 0.72rem;">${config.label}</span>`;
}

/**
 * 產生自動編號 (例如: QT-20260830-001)
 */
function generateQuotationNumber() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const randomSuffix = Math.floor(100 + Math.random() * 900);
  return `QT-${year}${month}${day}-${randomSuffix}`;
}

/**
 * 產生交易單號
 */
function generateTransactionNumber() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const randomSuffix = Math.floor(100 + Math.random() * 900);
  return `TX-${year}${month}${day}-${randomSuffix}`;
}

/**
 * 跳出 Toast / 提示訊息 (Vanilla JS)
 */
function showNotification(message, isSuccess = true) {
  const alertContainer = document.getElementById("alertContainer");
  if (!alertContainer) return;

  const alertDiv = document.createElement("div");
  alertDiv.className = `alert ${isSuccess ? "alert-success" : "alert-danger"} alert-dismissible fade show shadow-sm`;
  alertDiv.role = "alert";
  alertDiv.innerHTML = `
    <strong>${isSuccess ? "✅ 成功：" : "⚠️ 提示："}</strong> ${message}
    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
  `;

  alertContainer.appendChild(alertDiv);
  setTimeout(() => {
    alertDiv.classList.remove("show");
    setTimeout(() => alertDiv.remove(), 300);
  }, 4000);
}

/**
 * 手機版側邊欄切換
 */
function toggleSidebar() {
  const sidebar = document.getElementById("appSidebar");
  if (sidebar) {
    sidebar.classList.toggle("show");
  }
}

// ============================================================================
// 4. API 呼叫模組 (API SERVICES)
// ============================================================================

/**
 * 統一 Fetch API 封裝 (含錯誤攔截)
 */
async function fetchApi(endpoint, options = {}) {
  const defaultHeaders = {
    "Content-Type": "application/json",
    "Accept": "application/json"
  };

  const config = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers
    }
  };

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
    const result = await response.json();
    return result;
  } catch (error) {
    console.error(`[API_ERROR] ${endpoint}:`, error);
    return {
      success: false,
      data: null,
      message: "網路連線異常或服務尚未準備完成",
      error: error.message,
      pagination: null
    };
  }
}

// ============================================================================
// 5. 視圖切換與導覽控制 (VIEW ROUTING & RBAC MENU CONTROL)
// ============================================================================

/**
 * 依據當前登入者權限與 allowedMenus 動態控制左邊選單顯示/隱藏
 */
function applyUserMenuPermissions() {
  const user = appState.currentUser;
  if (!user) return;

  const isAdmin = user.role === "ADMIN";
  const allowedMenus = Array.isArray(user.allowedMenus) ? user.allowedMenus : ["dashboard"];

  // 1. 控制左邊各個選單按鈕的顯示/隱藏
  const navLinks = document.querySelectorAll(".sidebar-nav-link[data-menu-key]");
  let hasActiveMenuVisible = false;

  navLinks.forEach((link) => {
    const menuKey = link.getAttribute("data-menu-key");
    const isAllowed = isAdmin || allowedMenus.includes(menuKey);

    if (isAllowed) {
      link.classList.remove("d-none");
      link.classList.add("d-flex");
      if (menuKey === appState.currentView) {
        hasActiveMenuVisible = true;
      }
    } else {
      link.classList.add("d-none");
      link.classList.remove("d-flex");
    }
  });

  // 2. 更新側邊欄底部的當前使用者顯示資訊
  const sidebarAvatar = document.getElementById("sidebarUserAvatar");
  const sidebarName = document.getElementById("sidebarUserName");
  const sidebarDept = document.getElementById("sidebarUserDept");
  const sidebarRoleBadge = document.getElementById("sidebarUserRoleBadge");

  const initials = user.name ? user.name.slice(0, 2) : "US";
  if (sidebarAvatar) sidebarAvatar.textContent = initials;
  if (sidebarName) sidebarName.textContent = user.name || user.username;
  if (sidebarDept) sidebarDept.textContent = user.department || "未指定部門";
  if (sidebarRoleBadge) {
    sidebarRoleBadge.textContent = isAdmin ? "管理者" : "使用者";
    sidebarRoleBadge.className = isAdmin
      ? "badge bg-danger-subtle text-danger border border-danger-subtle px-1 py-0"
      : "badge bg-primary-subtle text-primary border border-primary-subtle px-1 py-0";
  }

  // 3. 更新頂部導覽列的使用者切換按鈕
  const headerAvatar = document.getElementById("headerUserAvatar");
  const headerName = document.getElementById("headerUserName");
  if (headerAvatar) headerAvatar.textContent = user.name ? user.name.slice(0, 1) : "U";
  if (headerName) headerName.textContent = `${user.name} (${isAdmin ? "管理者" : "使用者"})`;

  // 4. 若當前畫面未在授權清單中，自動切換至第一個可見選單
  if (!hasActiveMenuVisible) {
    const firstAllowed = isAdmin
      ? "dashboard"
      : (allowedMenus[0] || "dashboard");
    switchView(firstAllowed);
  }
}

/**
 * 切換各模組視圖
 * @param {string} viewName - 'dashboard' | 'customers' | 'products' | 'quotations' | 'transactions' | 'company' | 'users'
 */
function switchView(viewName) {
  // 檢查權限：若非 ADMIN 且該選單未被授權，則阻擋並跳轉
  const user = appState.currentUser;
  if (user && user.role !== "ADMIN") {
    const allowed = Array.isArray(user.allowedMenus) ? user.allowedMenus : ["dashboard"];
    if (!allowed.includes(viewName)) {
      showNotification(`您目前的帳號權限尚未開放存取「${viewName}」功能選單！`, false);
      const fallback = allowed[0] || "dashboard";
      if (viewName !== fallback) {
        switchView(fallback);
      }
      return;
    }
  }

  appState.currentView = viewName;

  // 1. 隱藏所有視圖
  const views = document.querySelectorAll(".app-view");
  views.forEach((view) => view.classList.add("d-none"));

  // 2. 顯示目標視圖
  const targetView = document.getElementById(`view-${viewName}`);
  if (targetView) {
    targetView.classList.remove("d-none");
  }

  // 3. 更新側邊欄導航 active 狀態
  const sidebarLinks = document.querySelectorAll(".sidebar-nav-link");
  sidebarLinks.forEach((link) => {
    link.classList.remove("active");
  });
  const activeLink = document.getElementById(`nav-${viewName}`);
  if (activeLink) {
    activeLink.classList.add("active");
  }

  // 4. 更新頂部標題
  const titleMap = {
    dashboard: "報價與商務管理控制台",
    customers: "客戶管理 (Customer Management)",
    products: "產品管理 (Product Management)",
    quotations: "報價單管理 (Quotation Management)",
    transactions: "交易管理 (Transaction Management)",
    company: "企業基本資料與報價單抬頭設定 (Company Profile)",
    users: "使用者帳號與選單權限管理 (User Access Control)"
  };
  const titleEl = document.getElementById("currentViewTitle");
  if (titleEl) {
    titleEl.textContent = titleMap[viewName] || "報價與商務管理系統";
  }

  // 手機版收起側邊欄
  const sidebar = document.getElementById("appSidebar");
  if (sidebar && sidebar.classList.contains("show")) {
    sidebar.classList.remove("show");
  }

  // 5. 載入對應視圖資料
  loadMetrics();
  if (viewName === "dashboard") {
    loadQuotations(1);
  } else if (viewName === "customers") {
    loadCustomers(1);
  } else if (viewName === "products") {
    loadProducts(1);
  } else if (viewName === "quotations") {
    loadQuotations(1);
  } else if (viewName === "transactions") {
    loadTransactions(1);
  } else if (viewName === "company") {
    loadCompanySettings();
  } else if (viewName === "users") {
    loadUsers();
  }
}

// ============================================================================
// 6. 指標與統計計算 (KPI METRICS)
// ============================================================================

/**
 * 載入並更新頂部 4 大 KPI 指標與報價單狀態分佈統計
 */
async function loadMetrics() {
  const response = await fetchApi("/metrics");
  if (response.success && response.data) {
    const data = response.data;
    
    const kpiRevenue = document.getElementById("kpiTotalRevenue");
    if (kpiRevenue) kpiRevenue.textContent = formatCurrency(data.totalRevenue ?? data.totalTransactionAmount ?? 0);

    const kpiQuotations = document.getElementById("kpiQuotationsTotal");
    if (kpiQuotations) kpiQuotations.textContent = formatCurrency(data.quotationsTotal ?? data.quotationsTotalValue ?? data.totalQuotationAmount ?? 0);

    const totalQCount = data.totalQuotationsCount ?? data.quotationsCount ?? data.totalQuotations ?? 0;
    const kpiQuotationsSub = document.getElementById("kpiQuotationsCountSub");
    if (kpiQuotationsSub) kpiQuotationsSub.textContent = `共 ${totalQCount} 筆開立單據`;

    const kpiCustomers = document.getElementById("kpiCustomersCount");
    if (kpiCustomers) kpiCustomers.textContent = `${data.totalCustomersCount ?? data.customersCount ?? data.totalCustomers ?? 0} 家`;

    const kpiProducts = document.getElementById("kpiProductsCount");
    if (kpiProducts) kpiProducts.textContent = `${data.totalProductsCount ?? data.productsCount ?? data.totalProducts ?? 0} 件`;

    // 取得各狀態數量
    const statusCounts = data.statusCounts || {
      DRAFT: appState.quotations.filter((q) => q.status === "DRAFT").length,
      SENT: appState.quotations.filter((q) => q.status === "SENT").length,
      ACCEPTED: appState.quotations.filter((q) => q.status === "ACCEPTED").length,
      REJECTED: appState.quotations.filter((q) => q.status === "REJECTED").length,
      EXPIRED: appState.quotations.filter((q) => q.status === "EXPIRED").length
    };

    const countDraft = document.getElementById("countDraft");
    if (countDraft) countDraft.textContent = `${statusCounts.DRAFT || 0} 筆`;

    const countSent = document.getElementById("countSent");
    if (countSent) countSent.textContent = `${statusCounts.SENT || 0} 筆`;

    const countAccepted = document.getElementById("countAccepted");
    if (countAccepted) countAccepted.textContent = `${statusCounts.ACCEPTED || 0} 筆`;

    const countRejected = document.getElementById("countRejected");
    if (countRejected) countRejected.textContent = `${statusCounts.REJECTED || 0} 筆`;

    const countExpired = document.getElementById("countExpired");
    if (countExpired) countExpired.textContent = `${statusCounts.EXPIRED || 0} 筆`;

    const totalBadge = document.getElementById("statusTotalCountBadge");
    if (totalBadge) totalBadge.textContent = `共 ${totalQCount} 筆單據`;
  }
}

/**
 * 儀表板點擊特定狀態標籤，快速跳轉至報價單管理並自動套用篩選
 * @param {string} status - 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED'
 */
function filterQuotationsByStatus(status) {
  switchView("quotations");
  const statusFilter = document.getElementById("statusFilter");
  if (statusFilter) {
    statusFilter.value = status;
  }
  loadQuotations(1);
}

// ============================================================================
// 7. 客戶管理模組 (CUSTOMER MANAGEMENT LOGIC)
// ============================================================================

/**
 * 載入客戶列表
 */
async function loadCustomers(page = 1) {
  const tableBody = document.getElementById("customerTableBody");
  const emptyState = document.getElementById("customerEmptyState");
  const summaryText = document.getElementById("customerSummaryText");

  if (tableBody) tableBody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted">正在載入客戶資料...</td></tr>`;

  const searchInput = document.getElementById("customerSearchInput");
  const search = searchInput ? searchInput.value.trim() : "";

  const query = new URLSearchParams({ page, pageSize: 50 });
  if (search) query.append("search", search);

  const response = await fetchApi(`/customers?${query.toString()}`);
  if (!response.success) {
    showNotification(response.message || "無法載入客戶名冊", false);
    return;
  }

  appState.customers = response.data || [];
  
  if (summaryText) {
    summaryText.textContent = `共登錄 ${appState.customers.length} 家合作夥伴與企業名冊`;
  }

  renderCustomerTable();
}

/**
 * 渲染客戶表格
 */
function renderCustomerTable() {
  const tableBody = document.getElementById("customerTableBody");
  const emptyState = document.getElementById("customerEmptyState");
  if (!tableBody) return;

  tableBody.innerHTML = "";

  if (appState.customers.length === 0) {
    if (emptyState) emptyState.classList.remove("d-none");
    return;
  }
  if (emptyState) emptyState.classList.add("d-none");

  appState.customers.forEach((c) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><span class="badge bg-light text-dark font-monospace border">${c.customerCode || "-"}</span></td>
      <td>
        <div class="fw-bold text-dark">${c.customerName}</div>
      </td>
      <td><span class="font-monospace fw-semibold ${c.taxId ? 'text-dark' : 'text-muted'}">${c.taxId || '-'}</span></td>
      <td>${c.contactPerson ? `<span class="fw-semibold text-dark">${c.contactPerson}</span>` : '<span class="text-muted">-</span>'}</td>
      <td><span class="small font-monospace">${c.phone || '<span class="text-muted">-</span>'}</span></td>
      <td><span class="small text-secondary">${c.email || '<span class="text-muted">-</span>'}</span></td>
      <td>
        <small class="text-muted text-truncate d-block" style="max-width: 220px;" title="${c.address || ''}">
          ${c.address ? `📍 ${c.address}` : '<span class="text-muted">-</span>'}
        </small>
      </td>
      <td>
        <div class="small fw-semibold text-dark">${c.updatedBy || c.createdBy || "系統管理員"}</div>
        <div class="small text-muted font-monospace">${formatDateTime(c.updatedAt || c.createdAt)}</div>
      </td>
      <td class="text-center no-print">
        <div class="btn-group btn-group-sm">
          <button type="button" class="btn btn-outline-secondary" onclick="openEditCustomerModal(${c.id})" title="編輯客戶">
            ✏️
          </button>
          <button type="button" class="btn btn-outline-primary" onclick="quickCreateQuotationForCustomer(${c.id})" title="以此客戶開立報價單">
            📑 報價
          </button>
          <button type="button" class="btn btn-outline-danger" onclick="triggerDeleteModal('customer', ${c.id}, '${c.customerName}')" title="刪除客戶">
            🗑️
          </button>
        </div>
      </td>
    `;
    tableBody.appendChild(tr);
  });
}

/**
 * 複製客戶通訊住址到寄送住址
 */
function copyCustomerAddressToShipping() {
  const addr = document.getElementById("customerAddress").value.trim();
  if (addr) {
    document.getElementById("customerShippingAddress").value = addr;
    showNotification("已將通訊地址複製至寄送住址！", true);
  } else {
    showNotification("請先填寫通訊地址", false);
  }
}

/**
 * 複製報價單客戶通訊住址到寄送住址
 */
function copyAddressToShipping() {
  const addr = document.getElementById("quotationCustomerAddress").value.trim();
  if (addr) {
    document.getElementById("quotationShippingAddress").value = addr;
    showNotification("已將通訊地址複製至寄送住址！", true);
  } else {
    showNotification("請先填寫通訊地址", false);
  }
}

/**
 * 開啟新增客戶彈窗
 */
function openCreateCustomerModal() {
  appState.isEditCustomerMode = false;
  appState.currentCustomerId = null;

  document.getElementById("customerModalTitle").textContent = "新增客戶 (New Customer)";
  document.getElementById("customerForm").reset();
  document.getElementById("customerId").value = "";
  document.getElementById("customerCode").value = `CUST-${String(Math.floor(100 + Math.random() * 900))}`;
  document.getElementById("customerContactPerson").value = "";
  document.getElementById("customerTaxId").value = "";
  document.getElementById("customerPaymentTerms").value = "月結 30 天 (Net 30)";
  document.getElementById("customerShippingAddress").value = "";

  const modal = new bootstrap.Modal(document.getElementById("customerModal"));
  modal.show();
}

/**
 * 開啟編輯客戶彈窗
 */
async function openEditCustomerModal(customerId) {
  const response = await fetchApi(`/customers/${customerId}`);
  if (!response.success || !response.data) {
    showNotification(response.message || "找不到該客戶資料", false);
    return;
  }

  const c = response.data;
  appState.isEditCustomerMode = true;
  appState.currentCustomerId = c.id;

  document.getElementById("customerModalTitle").textContent = "編輯客戶資料 (Edit Customer)";
  document.getElementById("customerId").value = c.id;
  document.getElementById("customerCode").value = c.customerCode || "";
  document.getElementById("customerName").value = c.customerName || "";
  document.getElementById("customerContactPerson").value = c.contactPerson || "";
  document.getElementById("customerTaxId").value = c.taxId || "";
  document.getElementById("customerEmail").value = c.email || "";
  document.getElementById("customerPhone").value = c.phone || "";
  document.getElementById("customerAddress").value = c.address || "";
  document.getElementById("customerShippingAddress").value = c.shippingAddress || "";
  document.getElementById("customerPaymentTerms").value = c.paymentTerms || "";
  document.getElementById("customerNotes").value = c.notes || "";

  const modal = new bootstrap.Modal(document.getElementById("customerModal"));
  modal.show();
}

/**
 * 處理客戶表單提交
 */
async function handleCustomerSubmit(event) {
  event.preventDefault();

  const customerName = document.getElementById("customerName").value.trim();
  if (!customerName) {
    showNotification("請填寫客戶名稱！", false);
    return;
  }

  const payload = {
    customerCode: document.getElementById("customerCode").value.trim() || null,
    customerName: customerName,
    contactPerson: document.getElementById("customerContactPerson").value.trim() || null,
    taxId: document.getElementById("customerTaxId").value.trim() || null,
    email: document.getElementById("customerEmail").value.trim() || null,
    phone: document.getElementById("customerPhone").value.trim() || null,
    address: document.getElementById("customerAddress").value.trim() || null,
    shippingAddress: document.getElementById("customerShippingAddress").value.trim() || null,
    paymentTerms: document.getElementById("customerPaymentTerms").value.trim() || null,
    notes: document.getElementById("customerNotes").value.trim() || null,
    createdBy: appState.currentUser?.name || "系統管理員",
    updatedBy: appState.currentUser?.name || "系統管理員"
  };

  const submitBtn = document.getElementById("submitCustomerBtn");
  submitBtn.disabled = true;

  let response;
  if (appState.isEditCustomerMode && appState.currentCustomerId) {
    response = await fetchApi(`/customers/${appState.currentCustomerId}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    });
  } else {
    response = await fetchApi("/customers", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  submitBtn.disabled = false;

  if (response.success) {
    showNotification(appState.isEditCustomerMode ? "客戶資料已成功更新！" : "客戶資料已建立完成！", true);
    const modalEl = document.getElementById("customerModal");
    const modalInstance = bootstrap.Modal.getInstance(modalEl);
    if (modalInstance) modalInstance.hide();

    loadCustomers(1);
    loadMetrics();
  } else {
    showNotification(response.message || "儲存客戶失敗", false);
  }
}

/**
 * 快捷從客戶開立報價單
 */
function quickCreateQuotationForCustomer(customerId) {
  const c = appState.customers.find((item) => item.id === customerId);
  openCreateQuotationModal();
  if (c) {
    document.getElementById("quotationCustomerName").value = c.customerName || "";
    document.getElementById("quotationCustomerTaxId").value = c.taxId || "";
    document.getElementById("quotationCustomerContactPerson").value = c.contactPerson || "";
    document.getElementById("quotationCustomerEmail").value = c.email || "";
    document.getElementById("quotationCustomerPhone").value = c.phone || "";
    document.getElementById("quotationCustomerAddress").value = c.address || "";
    document.getElementById("quotationShippingAddress").value = c.shippingAddress || c.address || "";
    document.getElementById("quotationPaymentTerms").value = c.paymentTerms || "月結 30 天 (Net 30)";
    
    const select = document.getElementById("quotationCustomerSelect");
    if (select) select.value = c.id;
  }
}

// ============================================================================
// 8. 產品管理模組 (PRODUCT MANAGEMENT LOGIC)
// ============================================================================

/**
 * 載入產品列表
 */
async function loadProducts(page = 1) {
  const tableBody = document.getElementById("productTableBody");
  const emptyState = document.getElementById("productEmptyState");
  const summaryText = document.getElementById("productSummaryText");

  if (tableBody) tableBody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted">正在載入產品資料...</td></tr>`;

  const searchInput = document.getElementById("productSearchInput");
  const categoryFilter = document.getElementById("productCategoryFilter");

  const search = searchInput ? searchInput.value.trim() : "";
  const category = categoryFilter ? categoryFilter.value : "";

  const query = new URLSearchParams({ page, pageSize: 50 });
  if (search) query.append("search", search);
  if (category) query.append("category", category);

  const response = await fetchApi(`/products?${query.toString()}`);
  if (!response.success) {
    showNotification(response.message || "無法載入產品庫", false);
    return;
  }

  appState.products = response.data || [];
  if (summaryText) {
    summaryText.textContent = `共 ${appState.products.length} 項商品與服務項目在庫`;
  }

  renderProductTable();
}

/**
 * 渲染產品表格
 */
function renderProductTable() {
  const tableBody = document.getElementById("productTableBody");
  const emptyState = document.getElementById("productEmptyState");
  if (!tableBody) return;

  tableBody.innerHTML = "";

  if (appState.products.length === 0) {
    if (emptyState) emptyState.classList.remove("d-none");
    return;
  }
  if (emptyState) emptyState.classList.add("d-none");

  appState.products.forEach((p) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><span class="badge bg-light text-dark font-monospace border">${p.productCode || "-"}</span></td>
      <td>
        <div class="fw-bold text-dark">${p.productName}</div>
        ${p.description ? `<small class="text-muted text-truncate d-block" style="max-width: 250px;">${p.description}</small>` : ""}
      </td>
      <td><span class="badge bg-secondary-subtle text-secondary border">${p.category || "一般"}</span></td>
      <td><span class="small">${p.unit || "件"}</span></td>
      <td class="text-end fw-bold font-monospace text-muted small">${formatCurrency(p.costPrice || 0)}</td>
      <td class="text-end fw-bold font-monospace text-primary">${formatCurrency(p.unitPrice)}</td>
      <td class="text-center">${getProductStatusBadge(p.status)}</td>
      <td>
        <div class="small fw-semibold text-dark">${p.updatedBy || p.createdBy || "系統管理員"}</div>
        <div class="small text-muted font-monospace">${formatDateTime(p.updatedAt || p.createdAt)}</div>
      </td>
      <td class="text-center no-print">
        <div class="btn-group btn-group-sm">
          <button type="button" class="btn btn-outline-secondary" onclick="openEditProductModal(${p.id})" title="編輯產品">
            ✏️
          </button>
          <button type="button" class="btn btn-outline-danger" onclick="triggerDeleteModal('product', ${p.id}, '${p.productName}')" title="刪除產品">
            🗑️
          </button>
        </div>
      </td>
    `;
    tableBody.appendChild(tr);
  });
}

/**
 * 開啟新增產品彈窗
 */
function openCreateProductModal() {
  appState.isEditProductMode = false;
  appState.currentProductId = null;

  document.getElementById("productModalTitle").textContent = "新增產品/服務項目 (New Product)";
  document.getElementById("productForm").reset();
  document.getElementById("productId").value = "";
  document.getElementById("productCode").value = `PRD-${String(Math.floor(100 + Math.random() * 900))}`;
  document.getElementById("productUnitPrice").value = 10000;
  document.getElementById("productCostPrice").value = 0;
  document.getElementById("productStockQuantity").value = 100;

  const modal = new bootstrap.Modal(document.getElementById("productModal"));
  modal.show();
}

/**
 * 開啟編輯產品彈窗
 */
async function openEditProductModal(productId) {
  const response = await fetchApi(`/products/${productId}`);
  if (!response.success || !response.data) {
    showNotification(response.message || "找不到該產品資料", false);
    return;
  }

  const p = response.data;
  appState.isEditProductMode = true;
  appState.currentProductId = p.id;

  document.getElementById("productModalTitle").textContent = "編輯產品/服務 (Edit Product)";
  document.getElementById("productId").value = p.id;
  document.getElementById("productCode").value = p.productCode || "";
  document.getElementById("productName").value = p.productName || "";
  document.getElementById("productCategory").value = p.category || "軟體開發與技術";
  document.getElementById("productUnit").value = p.unit || "件";
  document.getElementById("productStatus").value = p.status || "ACTIVE";
  document.getElementById("productUnitPrice").value = p.unitPrice || 0;
  document.getElementById("productCostPrice").value = p.costPrice || 0;
  document.getElementById("productStockQuantity").value = p.stockQuantity ?? 100;
  document.getElementById("productDescription").value = p.description || "";

  const modal = new bootstrap.Modal(document.getElementById("productModal"));
  modal.show();
}

/**
 * 處理產品表單提交
 */
async function handleProductSubmit(event) {
  event.preventDefault();

  const productName = document.getElementById("productName").value.trim();
  const unitPrice = parseFloat(document.getElementById("productUnitPrice").value);

  if (!productName) {
    showNotification("請填寫產品名稱！", false);
    return;
  }
  if (isNaN(unitPrice) || unitPrice < 0) {
    showNotification("請輸入有效的標準售價！", false);
    return;
  }

  const payload = {
    productCode: document.getElementById("productCode").value.trim() || null,
    productName: productName,
    category: document.getElementById("productCategory").value,
    unit: document.getElementById("productUnit").value.trim() || "件",
    unitPrice: unitPrice,
    costPrice: parseFloat(document.getElementById("productCostPrice").value) || 0,
    stockQuantity: parseInt(document.getElementById("productStockQuantity").value, 10) || 0,
    description: document.getElementById("productDescription").value.trim() || null,
    status: document.getElementById("productStatus").value,
    createdBy: appState.currentUser?.name || "系統管理員",
    updatedBy: appState.currentUser?.name || "系統管理員"
  };

  const submitBtn = document.getElementById("submitProductBtn");
  submitBtn.disabled = true;

  let response;
  if (appState.isEditProductMode && appState.currentProductId) {
    response = await fetchApi(`/products/${appState.currentProductId}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    });
  } else {
    response = await fetchApi("/products", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  submitBtn.disabled = false;

  if (response.success) {
    showNotification(appState.isEditProductMode ? "產品資料已成功更新！" : "產品項目已建立！", true);
    const modalEl = document.getElementById("productModal");
    const modalInstance = bootstrap.Modal.getInstance(modalEl);
    if (modalInstance) modalInstance.hide();

    loadProducts(1);
    loadMetrics();
  } else {
    showNotification(response.message || "儲存產品失敗", false);
  }
}

// ============================================================================
// 9. 報價單管理模組 (QUOTATION MANAGEMENT LOGIC)
// ============================================================================

/**
 * 載入報價單列表
 */
async function loadQuotations(page = 1) {
  if (appState.isLoading) return;
  appState.isLoading = true;
  appState.quotationPagination.currentPage = page;

  const tableBody = document.getElementById("quotationTableBody");
  const dashTableBody = document.getElementById("dashboardQuotationsTableBody");
  const emptyState = document.getElementById("emptyState");
  const loadingIndicator = document.getElementById("loadingIndicator");
  const summaryText = document.getElementById("listSummaryText");

  if (loadingIndicator) loadingIndicator.classList.remove("d-none");
  if (emptyState) emptyState.classList.add("d-none");

  const queryParams = new URLSearchParams({
    page: appState.quotationPagination.currentPage,
    pageSize: appState.quotationPagination.pageSize
  });

  if (appState.quotationSearchKeyword.trim()) {
    queryParams.append("search", appState.quotationSearchKeyword.trim());
  }
  if (appState.quotationStatusFilter) {
    queryParams.append("statusFilter", appState.quotationStatusFilter);
  }

  const response = await fetchApi(`/quotations?${queryParams.toString()}`);

  if (loadingIndicator) loadingIndicator.classList.add("d-none");
  appState.isLoading = false;

  if (!response.success) {
    showNotification(response.message || "載入報價單失敗", false);
    return;
  }

  appState.quotations = response.data || [];
  if (response.pagination) {
    appState.quotationPagination = response.pagination;
  }

  if (summaryText) {
    summaryText.textContent = `共計 ${appState.quotationPagination.totalRecords} 筆單據 (第 ${appState.quotationPagination.currentPage} / ${appState.quotationPagination.totalPages || 1} 頁)`;
  }

  renderQuotationTable();
  renderDashboardQuotationTable();
  renderPagination();
}

/**
 * 渲染主報價單表格
 */
function renderQuotationTable() {
  const tableBody = document.getElementById("quotationTableBody");
  const emptyState = document.getElementById("emptyState");
  if (!tableBody) return;

  tableBody.innerHTML = "";

  if (appState.quotations.length === 0) {
    if (emptyState) emptyState.classList.remove("d-none");
    return;
  }
  if (emptyState) emptyState.classList.add("d-none");

  appState.quotations.forEach((q) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <span class="font-monospace fw-bold text-dark">${q.quotationNumber}</span>
      </td>
      <td>
        <div class="fw-bold text-dark">${q.customerName}</div>
        <div class="small text-muted d-flex flex-wrap gap-2 mt-1">
          ${q.customerTaxId ? `<span class="badge bg-light text-dark border">統編: <span class="font-monospace">${q.customerTaxId}</span></span>` : ""}
          ${q.customerContactPerson ? `<span>👤 ${q.customerContactPerson}</span>` : ""}
        </div>
        ${q.customerAddress ? `<small class="text-secondary text-truncate d-block mt-1" style="max-width: 250px;" title="${q.customerAddress}">📍 ${q.customerAddress}</small>` : ""}
      </td>
      <td><span class="text-muted small">${formatDate(q.issueDate)}</span></td>
      <td><span class="text-muted small">${formatDate(q.expiryDate)}</span></td>
      <td class="text-center">${getStatusBadge(q.status)}</td>
      <td class="text-end font-monospace fw-bold text-primary">${formatCurrency(q.totalAmount)}</td>
      <td>
        <div class="small fw-semibold text-dark">${q.updatedBy || q.createdBy || "系統管理員"}</div>
        <div class="small text-muted font-monospace">${formatDateTime(q.updatedAt || q.createdAt)}</div>
      </td>
      <td class="text-center no-print">
        <div class="btn-group btn-group-sm">
          <button type="button" class="btn btn-outline-secondary" onclick="viewQuotationDetails(${q.id})" title="檢視明細 / 列印">
            👁️ 查看
          </button>
          <button type="button" class="btn btn-outline-primary" onclick="openEditQuotationModal(${q.id})" title="編輯報價單">
            ✏️ 編輯
          </button>
          <button type="button" class="btn btn-outline-success" onclick="convertQuotationToTransaction(${q.id})" title="核准轉為交易單">
            💳 轉交易
          </button>
          <button type="button" class="btn btn-outline-danger" onclick="triggerDeleteModal('quotation', ${q.id}, '${q.quotationNumber}')" title="刪除報價單">
            🗑️
          </button>
        </div>
      </td>
    `;
    tableBody.appendChild(tr);
  });
}

/**
 * 渲染儀表板近期的報價單概覽
 */
function renderDashboardQuotationTable() {
  const dashTableBody = document.getElementById("dashboardQuotationsTableBody");
  if (!dashTableBody) return;

  dashTableBody.innerHTML = "";
  const recent = appState.quotations.slice(0, 5);

  if (recent.length === 0) {
    dashTableBody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-muted">目前暫無報價單資料</td></tr>`;
    return;
  }

  recent.forEach((q) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><span class="font-monospace fw-bold text-dark">${q.quotationNumber}</span></td>
      <td><span class="fw-bold">${q.customerName}</span></td>
      <td><span class="text-muted small">${formatDate(q.issueDate)}</span></td>
      <td class="text-center">${getStatusBadge(q.status)}</td>
      <td class="text-end font-monospace fw-bold text-primary">${formatCurrency(q.totalAmount)}</td>
      <td class="text-center">
        <button type="button" class="btn btn-sm btn-link text-decoration-none" onclick="viewQuotationDetails(${q.id})">
          檢視明細 →
        </button>
      </td>
    `;
    dashTableBody.appendChild(tr);
  });
}

/**
 * 渲染分頁控制列
 */
function renderPagination() {
  const nav = document.getElementById("paginationNav");
  if (!nav) return;

  const { currentPage, totalPages, hasPrevPage, hasNextPage } = appState.quotationPagination;
  if (totalPages <= 1) {
    nav.innerHTML = "";
    return;
  }

  let itemsHtml = `
    <ul class="pagination pagination-sm justify-content-center mb-0">
      <li class="page-item ${!hasPrevPage ? "disabled" : ""}">
        <button class="page-link" onclick="loadQuotations(${currentPage - 1})" aria-label="上一頁">« 上一頁</button>
      </li>
  `;

  for (let i = 1; i <= totalPages; i++) {
    itemsHtml += `
      <li class="page-item ${i === currentPage ? "active" : ""}">
        <button class="page-link" onclick="loadQuotations(${i})">${i}</button>
      </li>
    `;
  }

  itemsHtml += `
      <li class="page-item ${!hasNextPage ? "disabled" : ""}">
        <button class="page-link" onclick="loadQuotations(${currentPage + 1})" aria-label="下一頁">下一頁 »</button>
      </li>
    </ul>
  `;

  nav.innerHTML = itemsHtml;
}

/**
 * 填充客戶選單供報價單快速選擇
 */
async function populateCustomerSelectOptions() {
  if (appState.customers.length === 0) {
    const res = await fetchApi("/customers?pageSize=100");
    if (res.success && res.data) appState.customers = res.data;
  }

  const select = document.getElementById("quotationCustomerSelect");
  if (!select) return;

  select.innerHTML = `<option value="">-- 手動輸入或選擇現有客戶 --</option>`;
  appState.customers.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c.id;
    const taxLabel = c.taxId ? `[統編:${c.taxId}] ` : '';
    const contactLabel = c.contactPerson ? `(聯絡人:${c.contactPerson})` : '';
    opt.textContent = `${c.customerName} ${taxLabel}${contactLabel}`;
    select.appendChild(opt);
  });
}

/**
 * 選擇客戶後自動帶入報價單表單
 */
function handleSelectCustomerForQuotation(customerId) {
  if (!customerId) return;
  const c = appState.customers.find((item) => item.id == customerId);
  if (c) {
    document.getElementById("quotationCustomerName").value = c.customerName || "";
    document.getElementById("quotationCustomerTaxId").value = c.taxId || "";
    document.getElementById("quotationCustomerContactPerson").value = c.contactPerson || "";
    document.getElementById("quotationCustomerEmail").value = c.email || "";
    document.getElementById("quotationCustomerPhone").value = c.phone || "";
    document.getElementById("quotationCustomerAddress").value = c.address || "";
    document.getElementById("quotationShippingAddress").value = c.shippingAddress || c.address || "";
    document.getElementById("quotationPaymentTerms").value = c.paymentTerms || "月結 30 天 (Net 30)";
  }
}

/**
 * 開啟新增報價單 Modal
 */
async function openCreateQuotationModal() {
  appState.isEditQuotationMode = false;
  appState.currentQuotationId = null;

  document.getElementById("quotationModalTitle").textContent = "新增報價單 (New Quotation)";
  document.getElementById("quotationForm").reset();

  document.getElementById("quotationNumber").value = generateQuotationNumber();
  document.getElementById("quotationIssueDate").value = formatDate(new Date());

  const expiry = new Date();
  expiry.setDate(expiry.getDate() + 30);
  document.getElementById("quotationExpiryDate").value = formatDate(expiry);

  document.getElementById("quotationCustomerTaxId").value = "";
  document.getElementById("quotationCustomerContactPerson").value = "";
  document.getElementById("quotationCustomerAddress").value = "";
  document.getElementById("quotationShippingAddress").value = "";
  document.getElementById("quotationPaymentTerms").value = "月結 30 天 (Net 30)";

  document.getElementById("quotationTaxMode").value = "EXCLUSIVE";
  document.getElementById("quotationTaxRate").value = DEFAULT_TAX_RATE;
  document.getElementById("quotationNotes").value = "1. 本報價單有效期限為 30 天。\n2. 付款條件為月結 30 天。\n3. 含全套系統建置、上線保固及售後技術支援。";

  // 確保產品庫已快取載入
  if (appState.products.length === 0) {
    const res = await fetchApi("/products?pageSize=100");
    if (res.success && res.data) appState.products = res.data;
  }

  await populateCustomerSelectOptions();

  // 清空項目容器並加入預設第一列
  const itemsContainer = document.getElementById("itemsContainer");
  itemsContainer.innerHTML = "";
  addItemRow();

  calculateSummary();

  const modal = new bootstrap.Modal(document.getElementById("quotationModal"));
  modal.show();
}

/**
 * 開啟編輯報價單 Modal
 */
async function openEditQuotationModal(quotationId) {
  const response = await fetchApi(`/quotations/${quotationId}`);
  if (!response.success || !response.data) {
    showNotification(response.message || "找不到該報價單資料", false);
    return;
  }

  const q = response.data;
  appState.isEditQuotationMode = true;
  appState.currentQuotationId = q.id;

  document.getElementById("quotationModalTitle").textContent = "編輯報價單 (Edit Quotation)";
  document.getElementById("quotationNumber").value = q.quotationNumber;
  document.getElementById("quotationCustomerName").value = q.customerName;
  document.getElementById("quotationCustomerTaxId").value = q.customerTaxId || "";
  document.getElementById("quotationCustomerContactPerson").value = q.customerContactPerson || "";
  document.getElementById("quotationCustomerEmail").value = q.customerEmail || "";
  document.getElementById("quotationCustomerPhone").value = q.customerPhone || "";
  document.getElementById("quotationCustomerAddress").value = q.customerAddress || "";
  document.getElementById("quotationShippingAddress").value = q.shippingAddress || "";
  document.getElementById("quotationPaymentTerms").value = q.paymentTerms || "";
  document.getElementById("quotationStatus").value = q.status || "DRAFT";
  document.getElementById("quotationIssueDate").value = formatDate(q.issueDate);
  document.getElementById("quotationExpiryDate").value = formatDate(q.expiryDate);
  
  document.getElementById("quotationTaxMode").value = q.taxMode || "EXCLUSIVE";
  document.getElementById("quotationTaxRate").value = q.taxRate !== undefined ? q.taxRate : DEFAULT_TAX_RATE;
  document.getElementById("quotationNotes").value = q.notes || "";

  if (appState.products.length === 0) {
    const res = await fetchApi("/products?pageSize=100");
    if (res.success && res.data) appState.products = res.data;
  }
  await populateCustomerSelectOptions();

  // 若能匹配到既有客戶，自動設定下拉選單值以利業務切換
  const customerSelect = document.getElementById("customerQuickSelect");
  if (customerSelect) {
    const matchedCustomer = appState.customers.find((c) => c.customerName === q.customerName || (c.taxId && c.taxId === q.customerTaxId));
    if (matchedCustomer) {
      customerSelect.value = matchedCustomer.id;
    } else {
      customerSelect.value = "";
    }
  }

  const itemsContainer = document.getElementById("itemsContainer");
  itemsContainer.innerHTML = "";

  if (q.items && q.items.length > 0) {
    q.items.forEach((item) => {
      addItemRow(item);
    });
  } else {
    addItemRow();
  }

  calculateSummary();

  // 若報價單有儲存的總額，將其帶入總金額欄位並重新觸發毛利計算
  if (q.totalAmount !== undefined && q.totalAmount !== null) {
    const totalInput = document.getElementById("quotationTotalAmountInput");
    if (totalInput) {
      totalInput.value = q.totalAmount;
      calculateSummary(true);
    }
  }

  const modal = new bootstrap.Modal(document.getElementById("quotationModal"));
  modal.show();
}

/**
 * 動態新增一列報價項目 (支援產品挑選與自訂輸入，版面寬敞清晰)
 */
function addItemRow(itemData = {}) {
  const container = document.getElementById("itemsContainer");
  const rowIndex = container.children.length;

  let productOptions = `<option value="">-- 🔍 挑選標準庫商品 (或下方自訂輸入) --</option>`;
  appState.products.forEach((p) => {
    const isSelected = itemData.productId === p.id ? "selected" : "";
    productOptions += `<option value="${p.id}" ${isSelected} data-price="${p.unitPrice}" data-name="${p.productName}" data-desc="${p.description || ""}">${p.productName} (${formatCurrency(p.unitPrice)})</option>`;
  });

  const rowDiv = document.createElement("div");
  rowDiv.className = "item-row p-3 mb-3 rounded-3 bg-white border shadow-sm";
  rowDiv.innerHTML = `
    <div class="row g-3 align-items-start">
      <!-- 1. 品項挑選與自訂名稱 -->
      <div class="col-12 col-lg-4">
        <label class="form-label small fw-bold text-dark mb-1">
          📦 報價品項名稱 <span class="text-danger">*</span>
        </label>
        <select class="form-select form-select-sm mb-2 product-picker bg-light" onchange="handleProductPickerChange(this)">
          ${productOptions}
        </select>
        <input type="text" class="form-control item-name fw-bold" placeholder="請輸入品項名稱 *" value="${itemData.itemName || ""}" required>
      </div>

      <!-- 2. 規格描述與備註說明 -->
      <div class="col-12 col-lg-3">
        <label class="form-label small fw-bold text-dark mb-1">
          📝 規格說明 / 備註條款
        </label>
        <textarea rows="3" class="form-control item-desc text-secondary" placeholder="填寫規格、型號或服務範疇...">${itemData.description || ""}</textarea>
      </div>

      <!-- 3. 數量 -->
      <div class="col-6 col-sm-4 col-lg-1">
        <label class="form-label small fw-bold text-dark mb-1 text-end d-block">
          數量
        </label>
        <input type="number" class="form-control text-end item-qty font-monospace fw-bold" placeholder="數量" value="${itemData.quantity || 1}" min="0.01" step="any" oninput="calculateSummary()" required>
      </div>

      <!-- 4. 單價 (NT$) -->
      <div class="col-6 col-sm-4 col-lg-2">
        <label class="form-label small fw-bold text-dark mb-1 text-end d-block">
          單價 (NT$)
        </label>
        <div class="input-group">
          <span class="input-group-text bg-light text-muted px-2 small font-monospace">$</span>
          <input type="number" class="form-control text-end item-price font-monospace fw-bold" placeholder="單價" value="${itemData.unitPrice || 0}" min="0" step="any" oninput="calculateSummary()" required>
        </div>
      </div>

      <!-- 5. 小計金額 -->
      <div class="col-8 col-sm-3 col-lg-1 text-end">
        <label class="form-label small fw-bold text-dark mb-1 d-block text-end">
          金額小計
        </label>
        <div class="py-2">
          <span class="fw-bold font-monospace text-primary fs-6 item-subtotal d-block text-end">NT$ 0</span>
        </div>
      </div>

      <!-- 6. 刪除按鈕 -->
      <div class="col-4 col-sm-1 col-lg-1 text-end">
        <label class="form-label small fw-bold text-transparent mb-1 d-block">
          操作
        </label>
        <button type="button" class="btn btn-outline-danger w-100 py-2 d-flex align-items-center justify-content-center" onclick="removeItemRow(this)" title="刪除此項目">
          🗑️
        </button>
      </div>
    </div>
  `;

  container.appendChild(rowDiv);
  calculateSummary();
}

/**
 * 產品下拉選單變更時自動填入品名、描述與單價
 */
function handleProductPickerChange(selectEl) {
  const selectedOption = selectEl.options[selectEl.selectedIndex];
  const row = selectEl.closest(".item-row");
  if (!row) return;

  if (selectEl.value) {
    const nameInput = row.querySelector(".item-name");
    const descInput = row.querySelector(".item-desc");
    const priceInput = row.querySelector(".item-price");

    if (nameInput) nameInput.value = selectedOption.getAttribute("data-name") || "";
    if (descInput) descInput.value = selectedOption.getAttribute("data-desc") || "";
    if (priceInput) priceInput.value = selectedOption.getAttribute("data-price") || "0";

    calculateSummary();
  }
}

/**
 * 移除一列報價項目
 */
function removeItemRow(btn) {
  const container = document.getElementById("itemsContainer");
  if (container.children.length <= 1) {
    showNotification("報價單必須至少保留一筆項目！", false);
    return;
  }
  btn.closest(".item-row").remove();
  calculateSummary();
}

/**
 * 計稅方式變更事件
 */
function handleTaxModeChange() {
  const taxMode = document.getElementById("quotationTaxMode").value;
  const taxRateInput = document.getElementById("quotationTaxRate");

  if (taxMode === "ZERO") {
    taxRateInput.value = 0;
  } else {
    if (parseFloat(taxRateInput.value) === 0) {
      taxRateInput.value = 5;
    }
  }
  calculateSummary();
}

/**
 * 計算金額彙總 (Subtotal, Tax, Total, 含稅/未稅, 成本, 毛利率)
 * @param {boolean} isManualTotalChange 是否為手動修改總金額觸發
 */
function calculateSummary(isManualTotalChange = false) {
  const itemRows = document.querySelectorAll(".item-row");
  let itemsSum = 0;
  let totalCost = 0;
  let validItemsCount = 0;

  itemRows.forEach((row) => {
    const qty = parseFloat(row.querySelector(".item-qty").value) || 0;
    const price = parseFloat(row.querySelector(".item-price").value) || 0;
    const lineTotal = Math.round(qty * price * 100) / 100;
    const itemName = row.querySelector(".item-name").value.trim();

    // 取得關聯產品的成本單價（若未選產品則預設為 0）
    const productPicker = row.querySelector(".product-picker");
    let costPerUnit = 0;
    if (productPicker && productPicker.value) {
      const selectedProduct = appState.products.find((p) => String(p.id) === String(productPicker.value));
      if (selectedProduct && selectedProduct.costPrice) {
        costPerUnit = parseFloat(selectedProduct.costPrice) || 0;
      }
    }

    if (itemName) {
      validItemsCount++;
    }

    totalCost += Math.round(qty * costPerUnit * 100) / 100;
    row.querySelector(".item-subtotal").textContent = formatCurrency(lineTotal);
    itemsSum += lineTotal;
  });

  const taxMode = document.getElementById("quotationTaxMode").value || "EXCLUSIVE";
  const taxRate = parseFloat(document.getElementById("quotationTaxRate").value) || 0;
  const subtotalLabel = document.getElementById("summarySubtotalLabel");
  const untaxedRow = document.getElementById("taxInclusiveUntaxedRow");
  const untaxedAmountEl = document.getElementById("summaryUntaxedAmount");
  const totalAmountInput = document.getElementById("quotationTotalAmountInput");

  let subtotal = itemsSum;
  let taxAmount = 0;
  let calculatedStandardTotal = 0;

  if (taxMode === "INCLUSIVE") {
    // 內含稅：項目總額即為應付總額，未稅小計逆推
    calculatedStandardTotal = itemsSum;
    const untaxed = Math.round(calculatedStandardTotal / (1 + (taxRate / 100)));
    taxAmount = calculatedStandardTotal - untaxed;
    subtotal = itemsSum;

    if (subtotalLabel) subtotalLabel.textContent = "項目總計 (含稅)：";
    if (untaxedRow) untaxedRow.classList.remove("d-none");
    if (untaxedRow) untaxedRow.classList.add("d-flex");
    if (untaxedAmountEl) untaxedAmountEl.textContent = formatCurrency(untaxed);
  } else if (taxMode === "ZERO") {
    // 零稅率 / 免稅
    taxAmount = 0;
    calculatedStandardTotal = itemsSum;
    subtotal = itemsSum;

    if (subtotalLabel) subtotalLabel.textContent = "項目合計 (免稅)：";
    if (untaxedRow) untaxedRow.classList.add("d-none");
    if (untaxedRow) untaxedRow.classList.remove("d-flex");
  } else {
    // 外加稅 (EXCLUSIVE)
    subtotal = itemsSum;
    taxAmount = Math.round(subtotal * (taxRate / 100));
    calculatedStandardTotal = subtotal + taxAmount;

    if (subtotalLabel) subtotalLabel.textContent = "項目合計 (未稅)：";
    if (untaxedRow) untaxedRow.classList.add("d-none");
    if (untaxedRow) untaxedRow.classList.remove("d-flex");
  }

  // 若非手動修改總金額（例如調整品項、數量、單價或稅率），自動同步總金額輸入框
  if (!isManualTotalChange && totalAmountInput) {
    totalAmountInput.value = calculatedStandardTotal;
  }

  // 取得目前實際設定之應付總額（支援業務手動調整或協議折讓）
  const actualTotal = totalAmountInput && totalAmountInput.value !== ""
    ? parseFloat(totalAmountInput.value) || 0
    : calculatedStandardTotal;

  // 依據實際總額推算實際未稅營收 (用於精確計算毛利)
  let actualRevenueUntaxed = actualTotal;
  if (taxMode === "INCLUSIVE" || taxMode === "EXCLUSIVE") {
    if (taxRate > 0) {
      // 若為外加稅且手動調整了總額，未稅營收 = 總額 / (1 + taxRate/100)
      actualRevenueUntaxed = actualTotal / (1 + (taxRate / 100));
    }
  }

  // 毛利與毛利率計算
  const grossProfit = Math.round((actualRevenueUntaxed - totalCost) * 100) / 100;
  const grossMargin = actualRevenueUntaxed > 0
    ? (grossProfit / actualRevenueUntaxed) * 100
    : 0;

  // 更新介面數值
  document.getElementById("summarySubtotal").textContent = formatCurrency(subtotal);
  document.getElementById("summaryTaxAmount").textContent = formatCurrency(taxAmount);

  const costEl = document.getElementById("summaryTotalCost");
  const profitEl = document.getElementById("summaryGrossProfit");
  const marginEl = document.getElementById("summaryGrossMargin");
  const countEl = document.getElementById("summaryItemsCount");

  if (countEl) countEl.textContent = `${validItemsCount} 項品項`;
  if (costEl) costEl.textContent = formatCurrency(totalCost);
  if (profitEl) {
    profitEl.textContent = formatCurrency(grossProfit);
    if (grossProfit >= 0) {
      profitEl.className = "fw-bold font-monospace text-success small";
    } else {
      profitEl.className = "fw-bold font-monospace text-danger small";
    }
  }
  if (marginEl) {
    marginEl.textContent = `${grossMargin.toFixed(1)}%`;
    if (grossMargin >= 30) {
      marginEl.className = "fw-bold font-monospace text-success small";
    } else if (grossMargin >= 15) {
      marginEl.className = "fw-bold font-monospace text-primary small";
    } else if (grossMargin >= 0) {
      marginEl.className = "fw-bold font-monospace text-warning small";
    } else {
      marginEl.className = "fw-bold font-monospace text-danger small";
    }
  }
}

/**
 * 手動修改總金額輸入框事件
 */
function handleManualTotalChange() {
  calculateSummary(true);
}

/**
 * 還原總金額為依據明細自動計算之標準金額
 */
function resetTotalToCalculated() {
  calculateSummary(false);
  showNotification("已還原為依品項明細與稅率自動計算之標準總金額！", true);
}

/**
 * 處理報價單表單提交
 */
async function handleQuotationSubmit(event) {
  event.preventDefault();

  const form = document.getElementById("quotationForm");
  if (!form.checkValidity()) {
    form.classList.add("was-validated");
    showNotification("請完整填寫所有標示必填的欄位！", false);
    return;
  }

  const quotationNumber = document.getElementById("quotationNumber").value.trim();
  const customerName = document.getElementById("quotationCustomerName").value.trim();
  const issueDate = document.getElementById("quotationIssueDate").value;

  if (!quotationNumber || !customerName || !issueDate) {
    showNotification("請填寫單號、客戶名稱與開立日期！", false);
    return;
  }

  // 抓取所有明細項目
  const itemRows = document.querySelectorAll(".item-row");
  const items = [];
  let itemsSum = 0;

  itemRows.forEach((row, index) => {
    const itemName = row.querySelector(".item-name").value.trim();
    const description = row.querySelector(".item-desc").value.trim();
    const quantity = parseFloat(row.querySelector(".item-qty").value) || 1;
    const unitPrice = parseFloat(row.querySelector(".item-price").value) || 0;
    const lineTotal = Math.round(quantity * unitPrice * 100) / 100;
    const productId = parseInt(row.querySelector(".product-picker").value, 10) || null;

    if (itemName) {
      items.push({
        itemName,
        description: description || null,
        quantity,
        unitPrice,
        lineTotal,
        productId: productId || null,
        sortOrder: index
      });
      itemsSum += lineTotal;
    }
  });

  if (items.length === 0) {
    showNotification("請至少填寫一項有效的報價明細項目！", false);
    return;
  }

  const taxMode = document.getElementById("quotationTaxMode").value || "EXCLUSIVE";
  const taxRate = parseFloat(document.getElementById("quotationTaxRate").value) || 0;
  
  // 讀取手動調整或自動計算之總金額
  const totalAmountInput = document.getElementById("quotationTotalAmountInput");
  let totalAmount = totalAmountInput && totalAmountInput.value !== ""
    ? parseFloat(totalAmountInput.value)
    : itemsSum;

  let subtotal = itemsSum;
  let taxAmount = 0;

  if (taxMode === "INCLUSIVE") {
    const untaxed = Math.round(totalAmount / (1 + (taxRate / 100)));
    taxAmount = totalAmount - untaxed;
    subtotal = untaxed; // 後端存未稅 subtotal
  } else if (taxMode === "ZERO") {
    taxAmount = 0;
    subtotal = totalAmount;
  } else {
    // 外加稅：若總金額有被手動覆寫，以總金額逆推或以明細稅額調整
    taxAmount = Math.round(itemsSum * (taxRate / 100));
    subtotal = itemsSum;
  }

  const payload = {
    quotationNumber,
    customerName,
    customerTaxId: document.getElementById("quotationCustomerTaxId").value.trim() || null,
    customerContactPerson: document.getElementById("quotationCustomerContactPerson").value.trim() || null,
    customerEmail: document.getElementById("quotationCustomerEmail").value.trim() || null,
    customerPhone: document.getElementById("quotationCustomerPhone").value.trim() || null,
    customerAddress: document.getElementById("quotationCustomerAddress").value.trim() || null,
    shippingAddress: document.getElementById("quotationShippingAddress").value.trim() || null,
    paymentTerms: document.getElementById("quotationPaymentTerms").value.trim() || null,
    issueDate,
    expiryDate: document.getElementById("quotationExpiryDate").value || null,
    status: document.getElementById("quotationStatus").value || "DRAFT",
    taxMode,
    subtotal,
    taxRate,
    taxAmount,
    totalAmount,
    notes: document.getElementById("quotationNotes").value.trim() || null,
    items,
    createdBy: appState.currentUser?.name || "系統管理員",
    updatedBy: appState.currentUser?.name || "系統管理員"
  };

  const submitBtn = document.getElementById("submitQuotationBtn");
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>儲存中...`;

  let response;
  if (appState.isEditQuotationMode && appState.currentQuotationId) {
    response = await fetchApi(`/quotations/${appState.currentQuotationId}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    });
  } else {
    response = await fetchApi("/quotations", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  submitBtn.disabled = false;
  submitBtn.innerHTML = `💾 儲存報價單`;

  if (response.success) {
    showNotification(appState.isEditQuotationMode ? "報價單已成功更新！" : "報價單建立成功！", true);
    const modalEl = document.getElementById("quotationModal");
    const modalInstance = bootstrap.Modal.getInstance(modalEl);
    if (modalInstance) modalInstance.hide();

    loadQuotations(appState.quotationPagination.currentPage);
    loadMetrics();
  } else {
    showNotification(response.message || "儲存報價單失敗", false);
  }
}

/**
 * 即時預覽目前正在編輯中的報價單 (Instant Preview)
 */
function previewCurrentQuotation() {
  const quotationNumber = document.getElementById("quotationNumber").value.trim() || "QT-PREVIEW";
  const customerName = document.getElementById("quotationCustomerName").value.trim() || "客戶名稱 (尚未填寫)";
  const customerTaxId = document.getElementById("quotationCustomerTaxId").value.trim();
  const customerContactPerson = document.getElementById("quotationCustomerContactPerson").value.trim();
  const customerPhone = document.getElementById("quotationCustomerPhone").value.trim();
  const customerEmail = document.getElementById("quotationCustomerEmail").value.trim();
  const customerAddress = document.getElementById("quotationCustomerAddress").value.trim();
  const shippingAddress = document.getElementById("quotationShippingAddress").value.trim();
  const paymentTerms = document.getElementById("quotationPaymentTerms").value.trim();
  const issueDate = document.getElementById("quotationIssueDate").value || formatDate(new Date());
  const expiryDate = document.getElementById("quotationExpiryDate").value || "";
  const status = document.getElementById("quotationStatus").value || "DRAFT";
  const taxMode = document.getElementById("quotationTaxMode").value || "EXCLUSIVE";
  const taxRate = parseFloat(document.getElementById("quotationTaxRate").value) || 0;
  const notes = document.getElementById("quotationNotes").value.trim();

  // 抓取所有明細項目
  const itemRows = document.querySelectorAll(".item-row");
  const items = [];
  let itemsSum = 0;

  itemRows.forEach((row) => {
    const itemName = row.querySelector(".item-name").value.trim();
    const description = row.querySelector(".item-desc").value.trim();
    const quantity = parseFloat(row.querySelector(".item-qty").value) || 0;
    const unitPrice = parseFloat(row.querySelector(".item-price").value) || 0;
    const lineTotal = quantity * unitPrice;

    if (itemName) {
      items.push({
        itemName,
        description,
        quantity,
        unitPrice,
        lineTotal
      });
      itemsSum += lineTotal;
    }
  });

  if (items.length === 0) {
    showNotification("請至少填寫一項報價品項名稱以進行即時預覽！", false);
    return;
  }

  const totalAmountInput = document.getElementById("quotationTotalAmountInput");
  let totalAmount = totalAmountInput && totalAmountInput.value !== ""
    ? parseFloat(totalAmountInput.value)
    : itemsSum;

  let subtotal = itemsSum;
  let taxAmount = 0;
  let taxModeLabel = "營業稅 (外加 5%)";

  if (taxMode === "INCLUSIVE") {
    const untaxed = Math.round(totalAmount / (1 + (taxRate / 100)));
    taxAmount = totalAmount - untaxed;
    subtotal = untaxed;
    taxModeLabel = `營業稅 (內含 ${taxRate}%)`;
  } else if (taxMode === "ZERO") {
    taxAmount = 0;
    subtotal = totalAmount;
    taxModeLabel = "營業稅 (免稅 / 0%)";
  } else {
    taxAmount = Math.round(itemsSum * (taxRate / 100));
    subtotal = itemsSum;
    taxModeLabel = `營業稅 (外加 ${taxRate}%)`;
  }

  const mockData = {
    quotationNumber: `${quotationNumber} [預覽]`,
    customerName,
    customerTaxId,
    customerContactPerson,
    customerPhone,
    customerEmail,
    customerAddress,
    shippingAddress,
    paymentTerms,
    issueDate,
    expiryDate,
    status,
    taxMode,
    subtotal,
    taxRate,
    taxAmount,
    totalAmount,
    notes,
    items
  };

  renderQuotationPreviewModal(mockData, true);
}

/**
 * 檢視報價單明細彈窗 (已存單據)
 */
async function viewQuotationDetails(quotationId) {
  const response = await fetchApi(`/quotations/${quotationId}`);
  if (!response.success || !response.data) {
    showNotification(response.message || "載入詳細資料失敗", false);
    return;
  }

  renderQuotationPreviewModal(response.data, false);
}

/**
 * 渲染報價單預覽/檢視彈窗內容
 */
function renderQuotationPreviewModal(q, isDraftPreview = false) {
  const container = document.getElementById("viewQuotationContent");

  let itemsHtml = "";
  if (q.items && q.items.length > 0) {
    q.items.forEach((item, index) => {
      itemsHtml += `
        <tr>
          <td class="text-center text-muted fw-bold">${index + 1}</td>
          <td>
            <div class="fw-bold text-dark fs-6 mb-1">${item.itemName}</div>
            ${item.description ? `<div class="text-muted small" style="white-space: pre-line; line-height: 1.6;">${item.description}</div>` : ""}
          </td>
          <td class="text-end font-monospace fw-semibold">${item.quantity}</td>
          <td class="text-end font-monospace text-secondary">${formatCurrency(item.unitPrice)}</td>
          <td class="text-end fw-bold font-monospace text-primary fs-6">${formatCurrency(item.lineTotal)}</td>
        </tr>
      `;
    });
  }

  let taxModeText = `營業稅額 (${q.taxRate || 5}%)：`;
  if (q.taxMode === "INCLUSIVE") {
    taxModeText = `內含營業稅 (${q.taxRate || 5}%)：`;
  } else if (q.taxMode === "ZERO") {
    taxModeText = `營業稅 (免稅 0%)：`;
  }

  container.innerHTML = `
    <div class="p-4 printable-area">
      ${isDraftPreview ? `
        <div class="alert alert-warning d-flex align-items-center gap-2 mb-3 py-2 px-3 shadow-sm no-print">
          <span>👁️</span>
          <strong>即時預覽模式：</strong> 此為當前編輯欄位即時預覽效果，尚未正式儲存至資料庫。
        </div>
      ` : ""}

      <div class="d-flex justify-content-between align-items-center border-bottom pb-3 mb-4">
        <div>
          <h3 class="fw-bold text-primary mb-1">正式商業報價單</h3>
          <div class="font-monospace text-secondary fs-6">單號：${q.quotationNumber}</div>
        </div>
        <div class="text-end">
          <div class="mb-2">${getStatusBadge(q.status)}</div>
          <div class="small text-muted">開立日期：${formatDate(q.issueDate)}</div>
          <div class="small text-muted">有效截止：${formatDate(q.expiryDate)}</div>
        </div>
      </div>

      <div class="row g-3 mb-4">
        <div class="col-sm-6">
          <div class="p-3 bg-light rounded border h-100">
            <h6 class="text-secondary fw-bold mb-2">買方 / 客戶資料 (Client Details)</h6>
            <div class="fs-5 fw-bold text-dark mb-2">${q.customerName}</div>
            <div class="small text-dark mb-1"><strong>統一編號：</strong><span class="font-monospace">${q.customerTaxId || "未提供 (無統編)"}</span></div>
            <div class="small text-dark mb-1"><strong>主要聯絡人：</strong>${q.customerContactPerson || "未提供"}</div>
            <div class="small text-muted mb-1"><strong>聯絡電話：</strong>${q.customerPhone || "未提供"}</div>
            <div class="small text-muted mb-1"><strong>電子信箱：</strong>${q.customerEmail || "未提供"}</div>
            <div class="small text-muted mb-1"><strong>通訊地址：</strong>${q.customerAddress || "未提供"}</div>
            ${q.shippingAddress ? `<div class="small text-primary mb-1"><strong>寄送住址：</strong>${q.shippingAddress}</div>` : ""}
            ${q.paymentTerms ? `<div class="small text-success"><strong>付款條件：</strong>${q.paymentTerms}</div>` : ""}
          </div>
        </div>
        <div class="col-sm-6">
          <div class="p-3 bg-light rounded border h-100">
            <h6 class="text-secondary fw-bold mb-2">開立單位 / 本公司資訊 (Vendor Details)</h6>
            <div class="fs-6 fw-bold text-dark mb-2">${appState.companySettings?.companyName || "極簡資訊科技股份有限公司"}</div>
            <div class="small text-muted mb-1"><strong>統一編號：</strong><span class="font-monospace">${appState.companySettings?.taxId || "28491023"}</span></div>
            <div class="small text-muted mb-1"><strong>聯絡電話：</strong>${appState.companySettings?.phone || "02-2345-6789"}</div>
            <div class="small text-muted mb-1"><strong>傳真號碼：</strong>${appState.companySettings?.fax || "02-2345-6780"}</div>
            <div class="small text-muted mb-1"><strong>電子信箱：</strong>${appState.companySettings?.email || "contact@quotationpro.com.tw"}</div>
            <div class="small text-muted mb-1"><strong>公司地址：</strong>${appState.companySettings?.address || "台北市信義區松仁路 100 號 18 樓"}</div>
            ${appState.companySettings?.bankName ? `<div class="small text-primary mt-2 pt-2 border-top"><strong>匯款銀行：</strong>${appState.companySettings.bankName} (${appState.companySettings.bankAccount || ""})</div>` : ""}
          </div>
        </div>
      </div>

      <div class="table-responsive mb-4">
        <table class="table table-bordered table-striped align-middle">
          <thead class="table-light">
            <tr class="text-secondary small fw-bold">
              <th style="width: 55px;" class="text-center">#</th>
              <th style="min-width: 280px;">報價項目與詳細規格說明</th>
              <th class="text-end" style="width: 110px;">數量</th>
              <th class="text-end" style="width: 160px;">單價 (NT$)</th>
              <th class="text-end" style="width: 170px;">金額小計 (NT$)</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>
      </div>

      <div class="row justify-content-end mb-4">
        <div class="col-md-5">
          <div class="p-3 bg-light rounded border">
            <div class="d-flex justify-content-between mb-2">
              <span class="text-muted">項目小計 (未稅)：</span>
              <span class="fw-bold">${formatCurrency(q.subtotal)}</span>
            </div>
            <div class="d-flex justify-content-between mb-2">
              <span class="text-muted">${taxModeText}</span>
              <span>${formatCurrency(q.taxAmount)}</span>
            </div>
            <hr class="my-2">
            <div class="d-flex justify-content-between align-items-center">
              <span class="fs-6 fw-bold">總計金額：</span>
              <span class="fs-4 fw-bold text-primary font-monospace">${formatCurrency(q.totalAmount)}</span>
            </div>
          </div>
        </div>
      </div>

      ${q.notes ? `
        <div class="border rounded p-3 bg-light mb-4">
          <h6 class="fw-bold mb-1 text-dark">商業備註與合約條款：</h6>
          <p class="mb-0 text-muted small" style="white-space: pre-line;">${q.notes}</p>
        </div>
      ` : ""}

      <div class="pt-4 border-top text-center text-muted small">
        感謝您的洽詢與支持！如有任何問題請隨時與我們聯絡。
      </div>
    </div>
  `;

  const modal = new bootstrap.Modal(document.getElementById("viewQuotationModal"));
  modal.show();
}

/**
 * 將報價單核准並自動轉為交易管理紀錄
 */
async function convertQuotationToTransaction(quotationId) {
  const confirmed = confirm("確定要將此報價單核准轉為「交易紀錄」嗎？\n系統將自動建立對應的請款與交付帳目。");
  if (!confirmed) return;

  const response = await fetchApi(`/transactions/from-quotation/${quotationId}`, {
    method: "POST"
  });

  if (response.success) {
    showNotification("🎉 報價單已成功轉為交易紀錄！狀態已同步標記為已簽約 (ACCEPTED)", true);
    loadQuotations(1);
    loadTransactions(1);
    loadMetrics();
  } else {
    showNotification(response.message || "轉單失敗", false);
  }
}

// ============================================================================
// 10. 交易管理模組 (TRANSACTION MANAGEMENT LOGIC)
// ============================================================================

/**
 * 載入交易列表
 */
async function loadTransactions(page = 1) {
  const tableBody = document.getElementById("transactionTableBody");
  const emptyState = document.getElementById("transactionEmptyState");
  const summaryText = document.getElementById("transactionSummaryText");

  if (tableBody) tableBody.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-muted">正在載入交易紀錄...</td></tr>`;

  const searchInput = document.getElementById("transactionSearchInput");
  const filter = document.getElementById("transactionPaymentFilter");

  const search = searchInput ? searchInput.value.trim() : "";
  const paymentStatus = filter ? filter.value : "";

  const query = new URLSearchParams({ page, pageSize: 50 });
  if (search) query.append("search", search);
  if (paymentStatus) query.append("paymentStatus", paymentStatus);

  const response = await fetchApi(`/transactions?${query.toString()}`);
  if (!response.success) {
    showNotification(response.message || "無法載入交易紀錄", false);
    return;
  }

  appState.transactions = response.data || [];
  if (summaryText) {
    summaryText.textContent = `共 ${appState.transactions.length} 筆交易帳目`;
  }

  renderTransactionTable();
}

/**
 * 渲染交易表格
 */
function renderTransactionTable() {
  const tableBody = document.getElementById("transactionTableBody");
  const emptyState = document.getElementById("transactionEmptyState");
  if (!tableBody) return;

  tableBody.innerHTML = "";

  if (appState.transactions.length === 0) {
    if (emptyState) emptyState.classList.remove("d-none");
    return;
  }
  if (emptyState) emptyState.classList.add("d-none");

  appState.transactions.forEach((tx) => {
    const totalAmount = parseFloat(tx.totalAmount) || 0;
    const costPrice = parseFloat(tx.costPrice) || 0;
    const paidAmount = parseFloat(tx.paidAmount) || 0;
    const remaining = tx.remainingAmount !== undefined ? parseFloat(tx.remainingAmount) : Math.max(0, totalAmount - paidAmount);
    const grossProfit = tx.grossProfit !== undefined ? parseFloat(tx.grossProfit) : (totalAmount - costPrice);
    const grossMargin = tx.grossMargin !== undefined ? parseFloat(tx.grossMargin) : (totalAmount > 0 ? (grossProfit / totalAmount) * 100 : 0);

    const profitColorClass = grossProfit >= 0 ? "text-primary" : "text-danger";

    // 發票列表簡述
    let invoiceHtml = '<span class="text-muted small">尚未開立發票</span>';
    if (tx.invoices && tx.invoices.length > 0) {
      invoiceHtml = tx.invoices.map((inv) => `
        <div class="small d-flex align-items-center justify-content-between gap-1 mb-1">
          <span class="font-monospace fw-semibold">${inv.invoiceNumber}</span>
          <span class="text-secondary">${formatCurrency(inv.amount)}</span>
          ${getInvoiceStatusBadge(inv.status)}
        </div>
      `).join("");
    }

    const modifier = tx.updatedBy || tx.createdBy || "系統管理員";
    const modTime = formatDateTime(tx.updatedAt || tx.createdAt || tx.transactionDate);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><span class="font-monospace fw-bold text-dark">${tx.transactionNumber}</span></td>
      <td>
        <div class="fw-bold text-dark">${tx.customerName}</div>
        ${tx.quotationNumber ? `<span class="badge bg-light text-primary border font-monospace mt-1">${tx.quotationNumber}</span>` : '<span class="text-muted small">獨立交易</span>'}
        ${tx.customerEmail ? `<div class="text-muted small mt-0.5">${tx.customerEmail}</div>` : ""}
      </td>
      <td><span class="text-muted small">${formatDate(tx.transactionDate)}</span></td>
      <td class="text-end font-monospace fw-bold text-dark">${formatCurrency(totalAmount)}</td>
      <td class="text-end font-monospace text-secondary">${formatCurrency(costPrice)}</td>
      <td class="text-end font-monospace">
        <div class="fw-bold ${profitColorClass}">${formatCurrency(grossProfit)}</div>
        <div class="small text-muted">${grossMargin.toFixed(1)}%</div>
      </td>
      <td class="text-end font-monospace">
        <div class="text-success fw-bold">已付: ${formatCurrency(paidAmount)}</div>
        <div class="text-danger small">待付: ${formatCurrency(remaining)}</div>
      </td>
      <td>
        <div class="p-1.5 bg-light rounded border border-light-subtle">
          ${invoiceHtml}
        </div>
      </td>
      <td class="text-center">
        <div>${getPaymentStatusBadge(tx.paymentStatus)}</div>
        <div class="mt-1">${getFulfillmentStatusBadge(tx.fulfillmentStatus)}</div>
      </td>
      <td>
        <div class="small text-dark fw-semibold">${modifier}</div>
        <div class="small text-muted">${modTime}</div>
      </td>
      <td class="text-center no-print">
        <div class="btn-group btn-group-sm">
          ${tx.paymentStatus !== "PAID" ? `
            <button type="button" class="btn btn-outline-success" onclick="markTransactionPaid(${tx.id})" title="標記為已結清付款">
              💰 已結
            </button>
          ` : ""}
          <button type="button" class="btn btn-outline-secondary" onclick="openEditTransactionModal(${tx.id})" title="編輯交易與發票">
            ✏️
          </button>
          <button type="button" class="btn btn-outline-danger" onclick="triggerDeleteModal('transaction', ${tx.id}, '${tx.transactionNumber}')" title="刪除交易">
            🗑️
          </button>
        </div>
      </td>
    `;
    tableBody.appendChild(tr);
  });
}

/**
 * 即時計算交易 Modal 中的財務指標 (毛利, 毛利率, 待收款)
 */
function calculateTxFinancials() {
  const totalAmount = parseFloat(document.getElementById("txTotalAmount")?.value) || 0;
  const costPrice = parseFloat(document.getElementById("txCostPrice")?.value) || 0;
  const paidAmount = parseFloat(document.getElementById("txPaidAmount")?.value) || 0;

  const remaining = Math.max(0, totalAmount - paidAmount);
  const profit = totalAmount - costPrice;
  const margin = totalAmount > 0 ? (profit / totalAmount) * 100 : 0;

  const remEl = document.getElementById("txRemainingDisplay");
  const profEl = document.getElementById("txProfitDisplay");
  const margEl = document.getElementById("txMarginDisplay");

  if (remEl) remEl.textContent = formatCurrency(remaining);
  if (profEl) {
    profEl.textContent = formatCurrency(profit);
    profEl.className = `fs-5 fw-bold font-monospace ${profit >= 0 ? "text-primary" : "text-danger"}`;
  }
  if (margEl) {
    margEl.textContent = `${margin.toFixed(1)} %`;
    margEl.className = `fs-5 fw-bold font-monospace ${margin >= 0 ? "text-primary" : "text-danger"}`;
  }
}

/**
 * 付款狀態切換自動同步已付款金額
 */
function handleTxPaymentStatusChange(status) {
  const totalAmount = parseFloat(document.getElementById("txTotalAmount")?.value) || 0;
  const paidInput = document.getElementById("txPaidAmount");
  if (!paidInput) return;

  if (status === "PAID" && totalAmount > 0 && parseFloat(paidInput.value) === 0) {
    paidInput.value = totalAmount;
  } else if (status === "PENDING" && parseFloat(paidInput.value) === totalAmount) {
    paidInput.value = 0;
  }
  calculateTxFinancials();
}

/**
 * 新增一筆發票列 (Transaction Modal)
 */
function addTxInvoiceRow(invData = {}) {
  const tableBody = document.getElementById("txInvoicesTableBody");
  if (!tableBody) return;

  const row = document.createElement("tr");
  row.className = "tx-invoice-row";

  const defaultDate = invData.issueDate ? formatDate(invData.issueDate) : formatDate(new Date());
  const status = invData.status || "PAID";

  row.innerHTML = `
    <td>
      <input type="text" class="form-control form-control-sm font-monospace inv-number" placeholder="例如：AB-12345678" value="${invData.invoiceNumber || ""}" required>
    </td>
    <td>
      <input type="date" class="form-control form-control-sm inv-date" value="${defaultDate}" required>
    </td>
    <td>
      <input type="number" class="form-control form-control-sm text-end font-monospace inv-amount" min="0" step="1" placeholder="金額" value="${invData.amount !== undefined ? invData.amount : 0}" required oninput="calculateTxInvoicesSum()">
    </td>
    <td>
      <select class="form-select form-select-sm inv-status">
        <option value="PAID" ${status === "PAID" ? "selected" : ""}>已付 (PAID)</option>
        <option value="PENDING" ${status === "PENDING" ? "selected" : ""}>待付 (PENDING)</option>
        <option value="CANCELLED" ${status === "CANCELLED" ? "selected" : ""}>取消 (CANCELLED)</option>
      </select>
    </td>
    <td>
      <input type="text" class="form-control form-control-sm inv-notes" placeholder="發票品項或備註" value="${invData.notes || ""}">
    </td>
    <td class="text-center">
      <button type="button" class="btn btn-outline-danger btn-sm py-0 px-1" onclick="removeTxInvoiceRow(this)" title="刪除此發票">
        🗑️
      </button>
    </td>
  `;

  tableBody.appendChild(row);
}

/**
 * 移除一筆發票列
 */
function removeTxInvoiceRow(btn) {
  const row = btn.closest(".tx-invoice-row");
  if (row) row.remove();
}

/**
 * 自動依發票金額加總（可輔助使用者確認收款）
 */
function calculateTxInvoicesSum() {
  const rows = document.querySelectorAll(".tx-invoice-row");
  let paidSum = 0;
  rows.forEach((r) => {
    const status = r.querySelector(".inv-status")?.value;
    const amount = parseFloat(r.querySelector(".inv-amount")?.value) || 0;
    if (status === "PAID") {
      paidSum += amount;
    }
  });

  const paidInput = document.getElementById("txPaidAmount");
  if (paidInput && parseFloat(paidInput.value) === 0 && paidSum > 0) {
    paidInput.value = paidSum;
    calculateTxFinancials();
  }
}

/**
 * 取得當前 Modal 中所有發票列資料
 */
function getTxInvoicesData() {
  const rows = document.querySelectorAll(".tx-invoice-row");
  const invoices = [];

  rows.forEach((r) => {
    const invoiceNumber = r.querySelector(".inv-number")?.value.trim();
    const issueDate = r.querySelector(".inv-date")?.value;
    const amount = parseFloat(r.querySelector(".inv-amount")?.value) || 0;
    const status = r.querySelector(".inv-status")?.value || "PAID";
    const notes = r.querySelector(".inv-notes")?.value.trim() || null;

    if (invoiceNumber && issueDate) {
      invoices.push({
        invoiceNumber,
        issueDate,
        amount,
        status,
        notes
      });
    }
  });

  return invoices;
}

/**
 * 標記交易為已收款完成
 */
async function markTransactionPaid(txId) {
  const tx = appState.transactions.find((item) => item.id === txId);
  if (!tx) return;

  const currentUserName = appState.currentUser?.name || "系統管理員";
  const payload = {
    ...tx,
    paidAmount: tx.totalAmount,
    paymentStatus: "PAID",
    fulfillmentStatus: tx.fulfillmentStatus === "PROCESSING" ? "COMPLETED" : tx.fulfillmentStatus,
    updatedBy: currentUserName
  };

  const response = await fetchApi(`/transactions/${txId}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });

  if (response.success) {
    showNotification("交易已更新為已付款 (PAID)！", true);
    loadTransactions(1);
    loadMetrics();
  } else {
    showNotification(response.message || "更新失敗", false);
  }
}

/**
 * 開啟新增交易 Modal
 */
function openCreateTransactionModal() {
  appState.isEditTransactionMode = false;
  appState.currentTransactionId = null;

  document.getElementById("transactionModalTitle").textContent = "新增交易紀錄 (New Transaction)";
  document.getElementById("transactionForm").reset();
  document.getElementById("txId").value = "";
  document.getElementById("txQuotationId").value = "";
  document.getElementById("txNumber").value = generateTransactionNumber();
  document.getElementById("txDate").value = formatDate(new Date());
  document.getElementById("txTotalAmount").value = 10000;
  document.getElementById("txCostPrice").value = 0;
  document.getElementById("txPaidAmount").value = 0;
  document.getElementById("txPaymentStatus").value = "PENDING";
  document.getElementById("txFulfillmentStatus").value = "PROCESSING";
  document.getElementById("txOperator").value = appState.currentUser?.name || "系統管理員";
  document.getElementById("txNotes").value = "";

  // 清空發票表格
  const invoicesTbody = document.getElementById("txInvoicesTableBody");
  if (invoicesTbody) invoicesTbody.innerHTML = "";

  calculateTxFinancials();

  const modal = new bootstrap.Modal(document.getElementById("transactionModal"));
  modal.show();
}

/**
 * 開啟編輯交易 Modal
 */
async function openEditTransactionModal(txId) {
  const response = await fetchApi(`/transactions/${txId}`);
  if (!response.success || !response.data) {
    showNotification(response.message || "找不到該筆交易", false);
    return;
  }

  const tx = response.data;
  appState.isEditTransactionMode = true;
  appState.currentTransactionId = tx.id;

  document.getElementById("transactionModalTitle").textContent = "編輯交易紀錄與發票明細 (Edit Transaction & Invoices)";
  document.getElementById("txId").value = tx.id;
  document.getElementById("txQuotationId").value = tx.quotationId || "";
  document.getElementById("txNumber").value = tx.transactionNumber;
  document.getElementById("txQuotationNumber").value = tx.quotationNumber || "";
  document.getElementById("txCustomerName").value = tx.customerName;
  document.getElementById("txCustomerEmail").value = tx.customerEmail || "";
  document.getElementById("txDate").value = formatDate(tx.transactionDate);
  document.getElementById("txTotalAmount").value = tx.totalAmount;
  document.getElementById("txCostPrice").value = tx.costPrice || 0;
  document.getElementById("txPaidAmount").value = tx.paidAmount || 0;
  document.getElementById("txPaymentMethod").value = tx.paymentMethod || "電匯 (Wire Transfer)";
  document.getElementById("txPaymentStatus").value = tx.paymentStatus || "PENDING";
  document.getElementById("txFulfillmentStatus").value = tx.fulfillmentStatus || "PROCESSING";
  document.getElementById("txOperator").value = appState.currentUser?.name || tx.updatedBy || tx.createdBy || "系統管理員";
  document.getElementById("txNotes").value = tx.notes || "";

  // 渲染發票明細
  const invoicesTbody = document.getElementById("txInvoicesTableBody");
  if (invoicesTbody) {
    invoicesTbody.innerHTML = "";
    if (tx.invoices && tx.invoices.length > 0) {
      tx.invoices.forEach((inv) => addTxInvoiceRow(inv));
    }
  }

  calculateTxFinancials();

  const modal = new bootstrap.Modal(document.getElementById("transactionModal"));
  modal.show();
}

/**
 * 處理交易表單提交
 */
async function handleTransactionSubmit(event) {
  event.preventDefault();

  const customerName = document.getElementById("txCustomerName").value.trim();
  const totalAmount = parseFloat(document.getElementById("txTotalAmount").value);
  const costPrice = parseFloat(document.getElementById("txCostPrice").value) || 0;
  const paidAmount = parseFloat(document.getElementById("txPaidAmount").value) || 0;
  const transactionDate = document.getElementById("txDate").value;

  if (!customerName || isNaN(totalAmount) || !transactionDate) {
    showNotification("請填寫客戶名稱、金額與交易日期！", false);
    return;
  }

  const invoices = getTxInvoicesData();
  const currentUserName = appState.currentUser?.name || "系統管理員";

  const payload = {
    transactionNumber: document.getElementById("txNumber").value.trim() || generateTransactionNumber(),
    quotationNumber: document.getElementById("txQuotationNumber").value.trim() || null,
    customerName,
    customerEmail: document.getElementById("txCustomerEmail").value.trim() || null,
    transactionDate,
    totalAmount,
    costPrice,
    paidAmount,
    paymentMethod: document.getElementById("txPaymentMethod").value,
    paymentStatus: document.getElementById("txPaymentStatus").value,
    fulfillmentStatus: document.getElementById("txFulfillmentStatus").value,
    notes: document.getElementById("txNotes").value.trim() || null,
    invoices,
    createdBy: currentUserName,
    updatedBy: currentUserName
  };

  const submitBtn = document.getElementById("submitTxBtn");
  submitBtn.disabled = true;

  let response;
  if (appState.isEditTransactionMode && appState.currentTransactionId) {
    response = await fetchApi(`/transactions/${appState.currentTransactionId}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    });
  } else {
    response = await fetchApi("/transactions", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  submitBtn.disabled = false;

  if (response.success) {
    showNotification(appState.isEditTransactionMode ? "交易與發票紀錄已成功更新！" : "交易紀錄建立成功！", true);
    const modalEl = document.getElementById("transactionModal");
    const modalInstance = bootstrap.Modal.getInstance(modalEl);
    if (modalInstance) modalInstance.hide();

    loadTransactions(1);
    loadMetrics();
  } else {
    showNotification(response.message || "儲存交易失敗", false);
  }
}

// ============================================================================
// 11. 通用刪除確認與執行 (UNIFIED DELETE CONFIRMATION)
// ============================================================================

/**
 * 觸發通用刪除確認 Modal
 */
function triggerDeleteModal(type, id, title) {
  appState.deleteTarget = { type, id, title };

  const titleMap = {
    quotation: "⚠️ 確認刪除報價單",
    customer: "⚠️ 確認刪除客戶",
    product: "⚠️ 確認刪除產品",
    transaction: "⚠️ 確認刪除交易紀錄"
  };

  document.getElementById("deleteModalTitle").textContent = titleMap[type] || "⚠️ 確認刪除";
  document.getElementById("deleteModalBodyText").innerHTML = `您確定要刪除「<strong class="text-danger">${title}</strong>」嗎？`;

  const modal = new bootstrap.Modal(document.getElementById("deleteConfirmModal"));
  modal.show();
}

/**
 * 執行刪除作業
 */
async function executeDelete() {
  const { type, id } = appState.deleteTarget;
  if (!type || !id) return;

  const btn = document.getElementById("confirmDeleteBtn");
  btn.disabled = true;

  let endpoint = "";
  if (type === "quotation") endpoint = `/quotations/${id}`;
  else if (type === "customer") endpoint = `/customers/${id}`;
  else if (type === "product") endpoint = `/products/${id}`;
  else if (type === "transaction") endpoint = `/transactions/${id}`;
  else if (type === "user") endpoint = `/users/${id}`;

  const response = await fetchApi(endpoint, { method: "DELETE" });
  btn.disabled = false;

  const modalEl = document.getElementById("deleteConfirmModal");
  const modalInstance = bootstrap.Modal.getInstance(modalEl);
  if (modalInstance) modalInstance.hide();

  if (response.success) {
    showNotification("資料已成功從資料庫刪除！", true);
    if (type === "quotation") loadQuotations(appState.quotationPagination.currentPage);
    else if (type === "customer") loadCustomers(1);
    else if (type === "product") loadProducts(1);
    else if (type === "transaction") loadTransactions(1);
    else if (type === "user") loadUsers();
    loadMetrics();
  } else {
    showNotification(response.message || "刪除失敗", false);
  }
}

// ============================================================================
// 12. 企業基本資料管理 (COMPANY SETTINGS MANAGEMENT)
// ============================================================================

/**
 * 載入公司基本資料設定
 */
async function loadCompanySettings() {
  const response = await fetchApi("/company");
  if (response.success && response.data) {
    appState.companySettings = response.data;
    populateCompanyForm(response.data);
    syncCompanyPreview();
  }
}

/**
 * 將公司設定資料填入表單
 */
function populateCompanyForm(data) {
  if (!data) return;
  const setValue = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val || "";
  };

  setValue("companyNameInput", data.companyName);
  setValue("companyTaxIdInput", data.taxId);
  setValue("companyPhoneInput", data.phone);
  setValue("companyFaxInput", data.fax);
  setValue("companyEmailInput", data.email);
  setValue("companyWebsiteInput", data.website);
  setValue("companyAddressInput", data.address);
  setValue("companyBankNameInput", data.bankName);
  setValue("companyBankAccountInput", data.bankAccount);
  setValue("companyBankAccountNameInput", data.bankAccountName);
  setValue("companyDefaultTermsInput", data.defaultTerms);
}

/**
 * 即時同步右側報價單抬頭卡片預覽
 */
function syncCompanyPreview() {
  const getText = (id, fallback) => {
    const el = document.getElementById(id);
    return el && el.value.trim() ? el.value.trim() : fallback;
  };

  const name = getText("companyNameInput", "極簡資訊科技股份有限公司");
  const taxId = getText("companyTaxIdInput", "28491023");
  const phone = getText("companyPhoneInput", "(02) 2345-6789");
  const fax = getText("companyFaxInput", "(02) 2345-6780");
  const email = getText("companyEmailInput", "contact@quotationpro.com.tw");
  const address = getText("companyAddressInput", "台北市信義區松仁路 100 號 18 樓");
  const bankName = getText("companyBankNameInput", "台灣銀行 信義分行");
  const bankAccount = getText("companyBankAccountInput", "012-345-678901");
  const bankAccountName = getText("companyBankAccountNameInput", "極簡資訊科技股份有限公司");
  const terms = getText("companyDefaultTermsInput", "1. 本報價單有效期限為 30 天。\n2. 付款條件為月結 30 天。");

  const prevName = document.getElementById("prevCompanyName");
  const prevTaxId = document.getElementById("prevCompanyTaxId");
  const prevPhone = document.getElementById("prevCompanyPhone");
  const prevFax = document.getElementById("prevCompanyFax");
  const prevEmail = document.getElementById("prevCompanyEmail");
  const prevAddress = document.getElementById("prevCompanyAddress");
  const prevBank = document.getElementById("prevCompanyBank");
  const prevTerms = document.getElementById("prevCompanyTerms");

  if (prevName) prevName.textContent = name;
  if (prevTaxId) prevTaxId.textContent = taxId;
  if (prevPhone) prevPhone.textContent = phone;
  if (prevFax) prevFax.textContent = fax;
  if (prevEmail) prevEmail.textContent = email;
  if (prevAddress) prevAddress.textContent = address;
  if (prevBank) prevBank.textContent = `${bankName} / 帳號：${bankAccount} (戶名：${bankAccountName})`;
  if (prevTerms) prevTerms.textContent = terms;
}

/**
 * 處理公司基本資料儲存提交
 */
async function handleCompanySettingsSubmit(event) {
  event.preventDefault();

  const form = document.getElementById("companySettingsForm");
  if (!form.checkValidity()) {
    form.classList.add("was-validated");
    showNotification("請完整填寫公司名稱、統一編號與聯絡資訊！", false);
    return;
  }

  const payload = {
    companyName: document.getElementById("companyNameInput").value.trim(),
    taxId: document.getElementById("companyTaxIdInput").value.trim(),
    phone: document.getElementById("companyPhoneInput").value.trim(),
    fax: document.getElementById("companyFaxInput").value.trim() || null,
    email: document.getElementById("companyEmailInput").value.trim(),
    website: document.getElementById("companyWebsiteInput").value.trim() || null,
    address: document.getElementById("companyAddressInput").value.trim(),
    bankName: document.getElementById("companyBankNameInput").value.trim() || null,
    bankAccount: document.getElementById("companyBankAccountInput").value.trim() || null,
    bankAccountName: document.getElementById("companyBankAccountNameInput").value.trim() || null,
    defaultTerms: document.getElementById("companyDefaultTermsInput").value.trim() || null,
    updatedBy: appState.currentUser?.name || "系統管理員"
  };

  const btn = document.getElementById("saveCompanyBtn");
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>儲存中...`;

  const response = await fetchApi("/company", {
    method: "PUT",
    body: JSON.stringify(payload)
  });

  btn.disabled = false;
  btn.innerHTML = `💾 儲存企業基本資料`;

  if (response.success) {
    appState.companySettings = response.data;
    showNotification("企業基本資料與報價單抬頭設定已成功更新！", true);
    syncCompanyPreview();
  } else {
    showNotification(response.message || "儲存公司資料失敗", false);
  }
}

// ============================================================================
// 13. 使用者與權限管理 (USER & RBAC PERMISSION MANAGEMENT)
// ============================================================================

/**
 * 載入使用者清單
 */
async function loadUsers() {
  const tbody = document.getElementById("userTableBody");
  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center py-5">
          <div class="spinner-border text-primary" role="status">
            <span class="visually-hidden">載入中...</span>
          </div>
          <div class="text-muted mt-2 small">正在載入使用者與權限清單...</div>
        </td>
      </tr>
    `;
  }

  const response = await fetchApi("/users");
  if (response.success && Array.isArray(response.data)) {
    appState.users = response.data;
    renderUserTable();
  } else {
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center py-5 text-danger">
            ⚠️ 載入使用者失敗：${response.message || "連線異常"}
          </td>
        </tr>
      `;
    }
  }
}

/**
 * 依據搜尋關鍵字與角色篩選並渲染使用者清單表格
 */
function renderUserTable() {
  const tbody = document.getElementById("userTableBody");
  if (!tbody) return;

  const keyword = (appState.userSearchKeyword || "").toLowerCase().trim();
  const roleFilter = appState.userRoleFilter || "";

  let filtered = appState.users.filter((u) => {
    const matchKeyword = !keyword ||
      (u.name && u.name.toLowerCase().includes(keyword)) ||
      (u.username && u.username.toLowerCase().includes(keyword)) ||
      (u.department && u.department.toLowerCase().includes(keyword)) ||
      (u.email && u.email.toLowerCase().includes(keyword)) ||
      (u.phone && u.phone.toLowerCase().includes(keyword));

    const matchRole = !roleFilter || u.role === roleFilter;
    return matchKeyword && matchRole;
  });

  const totalEl = document.getElementById("userTotalCount");
  if (totalEl) totalEl.textContent = `${filtered.length} 位同仁`;

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center py-5 text-muted">
          <div class="fs-4 mb-2">🔍</div>
          <div>查無符合條件的使用者資料</div>
        </td>
      </tr>
    `;
    return;
  }

  const menuNameMap = {
    dashboard: "📊 儀表板",
    customers: "👥 客戶",
    products: "📦 產品",
    quotations: "📑 報價單",
    transactions: "💳 交易",
    company: "🏢 基本資料",
    users: "👤 使用者"
  };

  tbody.innerHTML = filtered.map((u) => {
    const isAdmin = u.role === "ADMIN";
    const initials = u.name ? u.name.slice(0, 2) : "US";
    const isCurrentLoggedIn = appState.currentUser && appState.currentUser.id === u.id;

    // 格式化開放選單標籤
    let menusHtml = "";
    if (isAdmin) {
      menusHtml = `<span class="badge bg-danger-subtle text-danger border border-danger-subtle">全功能開放 (7項)</span>`;
    } else {
      const allowed = Array.isArray(u.allowedMenus) ? u.allowedMenus : [];
      if (allowed.length === 0) {
        menusHtml = `<span class="badge bg-secondary-subtle text-secondary border">無開放選單</span>`;
      } else {
        menusHtml = allowed.map((m) => `<span class="badge bg-light text-dark border me-1 mb-1 font-monospace" style="font-size: 0.75rem;">${menuNameMap[m] || m}</span>`).join("");
      }
    }

    return `
      <tr class="${isCurrentLoggedIn ? "table-primary bg-opacity-25" : ""}">
        <!-- 姓名與帳號 -->
        <td>
          <div class="d-flex align-items-center gap-2">
            <div class="user-avatar-sm ${isAdmin ? "bg-danger" : "bg-primary"} text-white">
              ${initials}
            </div>
            <div>
              <div class="fw-bold text-dark d-flex align-items-center gap-1">
                ${u.name}
                ${isCurrentLoggedIn ? `<span class="badge bg-primary text-white" style="font-size: 0.65rem;">目前登入</span>` : ""}
              </div>
              <div class="font-monospace text-muted small">帳號: @${u.username}</div>
            </div>
          </div>
        </td>

        <!-- 所屬部門 -->
        <td>
          <div class="fw-semibold text-dark">${u.department || "-"}</div>
        </td>

        <!-- 聯絡方式 -->
        <td>
          <div class="small text-dark font-monospace">${u.email || "-"}</div>
          <div class="small text-muted font-monospace">${u.phone || "-"}</div>
        </td>

        <!-- 權限角色 -->
        <td class="text-center">
          <div class="mb-1">
            ${isAdmin
              ? `<span class="badge bg-danger px-2 py-1"><span class="me-1">👑</span>管理者</span>`
              : `<span class="badge bg-primary px-2 py-1"><span class="me-1">👤</span>使用者</span>`}
          </div>
        </td>

        <!-- 左側可見選單 -->
        <td style="max-width: 240px;">
          <div class="d-flex flex-wrap align-items-center">
            ${menusHtml}
          </div>
        </td>

        <!-- 最後修改人/時間 -->
        <td>
          <div class="small fw-semibold text-dark">${u.updatedBy || u.createdBy || "系統管理員"}</div>
          <div class="small text-muted font-monospace">${formatDateTime(u.updatedAt || u.createdAt)}</div>
        </td>

        <!-- 狀態 -->
        <td class="text-center">
          ${u.status === "ACTIVE"
            ? `<span class="badge bg-success-subtle text-success border border-success-subtle">啟用</span>`
            : `<span class="badge bg-secondary-subtle text-secondary border">停用</span>`}
        </td>

        <!-- 操作 -->
        <td class="text-center no-print">
          <div class="btn-group btn-group-sm">
            <button type="button" class="btn btn-outline-primary" onclick="openEditUserModal('${u.id}')" title="編輯帳號與選單權限">
              ✏️ 編輯
            </button>
            <button type="button" class="btn btn-outline-secondary" onclick="switchActiveUser('${u.id}')" title="切換為此使用者登入">
              🔄 切換
            </button>
            <button type="button" class="btn btn-outline-danger" onclick="triggerDeleteUser('${u.id}', '${u.name}')" title="刪除使用者" ${isCurrentLoggedIn ? "disabled" : ""}>
              🗑️
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

/**
 * 開啟新增使用者 Modal
 */
function openCreateUserModal() {
  appState.isEditUserMode = false;
  appState.currentUserId = null;

  document.getElementById("userModalTitle").textContent = "新增使用者與權限設定 (New User)";
  document.getElementById("userForm").reset();
  document.getElementById("userId").value = "";
  document.getElementById("userUsernameInput").readOnly = false;
  document.getElementById("userPasswordInput").placeholder = "預設密碼：123456 (可自訂)";
  document.getElementById("userRoleInput").value = "USER";
  document.getElementById("userStatusInput").value = "ACTIVE";

  // 預設使用者開放前 5 項選單
  resetMenuPermissionsByRole("USER");

  const modal = new bootstrap.Modal(document.getElementById("userModal"));
  modal.show();
}

/**
 * 開啟編輯使用者 Modal
 */
function openEditUserModal(userId) {
  const user = appState.users.find((u) => u.id === userId);
  if (!user) {
    showNotification("找不到該使用者資料", false);
    return;
  }

  appState.isEditUserMode = true;
  appState.currentUserId = user.id;

  document.getElementById("userModalTitle").textContent = `編輯使用者：${user.name} (@${user.username})`;
  document.getElementById("userId").value = user.id;
  document.getElementById("userNameInput").value = user.name || "";
  document.getElementById("userUsernameInput").value = user.username || "";
  document.getElementById("userPasswordInput").value = "";
  document.getElementById("userPasswordInput").placeholder = "留空代表不變更密碼";
  document.getElementById("userDeptInput").value = user.department || "";
  document.getElementById("userPhoneInput").value = user.phone || "";
  document.getElementById("userEmailInput").value = user.email || "";
  document.getElementById("userRoleInput").value = user.role || "USER";
  document.getElementById("userStatusInput").value = user.status || "ACTIVE";

  // 填入勾選之選單
  const allowed = Array.isArray(user.allowedMenus) ? user.allowedMenus : [];
  const checkboxes = document.querySelectorAll(".menu-perm-checkbox");
  checkboxes.forEach((cb) => {
    cb.checked = user.role === "ADMIN" || allowed.includes(cb.value);
  });

  const modal = new bootstrap.Modal(document.getElementById("userModal"));
  modal.show();
}

/**
 * 角色切換事件
 */
function handleUserRoleChange(role) {
  if (role === "ADMIN") {
    setMenuPermissionsAll(true);
  } else {
    resetMenuPermissionsByRole("USER");
  }
}

/**
 * 全選或全清選單勾選框
 */
function setMenuPermissionsAll(checked) {
  const checkboxes = document.querySelectorAll(".menu-perm-checkbox");
  checkboxes.forEach((cb) => {
    cb.checked = checked;
  });
}

/**
 * 依角色建議預設選單勾選
 */
function resetMenuPermissionsByRole(forcedRole = null) {
  const role = forcedRole || document.getElementById("userRoleInput").value;
  const checkboxes = document.querySelectorAll(".menu-perm-checkbox");

  if (role === "ADMIN") {
    checkboxes.forEach((cb) => (cb.checked = true));
  } else {
    // 一般使用者預設開放業務相關之 5 大選單
    const defaultUserMenus = ["dashboard", "customers", "products", "quotations", "transactions"];
    checkboxes.forEach((cb) => {
      cb.checked = defaultUserMenus.includes(cb.value);
    });
  }
}

/**
 * 處理使用者表單提交
 */
async function handleUserSubmit(event) {
  event.preventDefault();

  const form = document.getElementById("userForm");
  if (!form.checkValidity()) {
    form.classList.add("was-validated");
    showNotification("請完整填寫同仁姓名、帳號、部門與信箱！", false);
    return;
  }

  // 抓取勾選的選單
  const checkedMenus = [];
  const checkboxes = document.querySelectorAll(".menu-perm-checkbox:checked");
  checkboxes.forEach((cb) => checkedMenus.push(cb.value));

  const role = document.getElementById("userRoleInput").value;
  if (role !== "ADMIN" && checkedMenus.length === 0) {
    showNotification("一般使用者至少需開放一項功能選單！", false);
    return;
  }

  const payload = {
    name: document.getElementById("userNameInput").value.trim(),
    username: document.getElementById("userUsernameInput").value.trim(),
    department: document.getElementById("userDeptInput").value.trim(),
    phone: document.getElementById("userPhoneInput").value.trim() || null,
    email: document.getElementById("userEmailInput").value.trim(),
    role,
    status: document.getElementById("userStatusInput").value || "ACTIVE",
    allowedMenus: role === "ADMIN" ? ["dashboard", "customers", "products", "quotations", "transactions", "company", "users"] : checkedMenus,
    createdBy: appState.currentUser?.name || "系統管理員",
    updatedBy: appState.currentUser?.name || "系統管理員"
  };

  const passwordVal = document.getElementById("userPasswordInput").value.trim();
  if (passwordVal) {
    payload.password = passwordVal;
  }

  const submitBtn = document.getElementById("submitUserBtn");
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>儲存中...`;

  let response;
  if (appState.isEditUserMode && appState.currentUserId) {
    response = await fetchApi(`/users/${appState.currentUserId}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    });
  } else {
    response = await fetchApi("/users", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  submitBtn.disabled = false;
  submitBtn.innerHTML = `💾 儲存使用者`;

  if (response.success) {
    showNotification(appState.isEditUserMode ? "使用者資料已成功更新！" : "使用者帳號建立成功！", true);
    const modalEl = document.getElementById("userModal");
    const modalInstance = bootstrap.Modal.getInstance(modalEl);
    if (modalInstance) modalInstance.hide();

    // 若更新的是當前登入者，同步更新 appState.currentUser
    if (appState.currentUser && appState.currentUser.id === response.data.id) {
      appState.currentUser = response.data;
      applyUserMenuPermissions();
    }

    loadUsers();
  } else {
    showNotification(response.message || "儲存使用者失敗", false);
  }
}

/**
 * 觸發刪除使用者確認
 */
function triggerDeleteUser(userId, name) {
  if (appState.currentUser && appState.currentUser.id === userId) {
    showNotification("無法刪除目前正在登入使用的帳號！", false);
    return;
  }
  triggerDeleteModal("user", userId, `同仁：${name}`);
}

// ============================================================================
// 14. 快速切換登入者 (SWITCH USER)
// ============================================================================

/**
 * 開啟切換登入者彈窗
 */
async function openSwitchUserModal() {
  if (appState.users.length === 0) {
    const res = await fetchApi("/users");
    if (res.success && Array.isArray(res.data)) {
      appState.users = res.data;
    }
  }

  const listContainer = document.getElementById("switchUserList");
  if (!listContainer) return;

  const menuNameMap = {
    dashboard: "儀表板",
    customers: "客戶",
    products: "產品",
    quotations: "報價單",
    transactions: "交易",
    company: "基本資料",
    users: "使用者"
  };

  listContainer.innerHTML = appState.users.map((u) => {
    const isCurrent = appState.currentUser && appState.currentUser.id === u.id;
    const isAdmin = u.role === "ADMIN";
    const initials = u.name ? u.name.slice(0, 2) : "US";
    const allowed = Array.isArray(u.allowedMenus) ? u.allowedMenus : [];
    const menusText = isAdmin
      ? "所有 7 項選單"
      : allowed.map((m) => menuNameMap[m] || m).join(", ");

    return `
      <button type="button" class="list-group-item list-group-item-action d-flex align-items-center justify-content-between p-3 ${isCurrent ? "active" : ""}" onclick="switchActiveUser('${u.id}')">
        <div class="d-flex align-items-center gap-3">
          <div class="user-avatar-sm ${isAdmin ? (isCurrent ? "bg-white text-danger" : "bg-danger text-white") : (isCurrent ? "bg-white text-primary" : "bg-primary text-white")}">
            ${initials}
          </div>
          <div class="text-start">
            <div class="fw-bold ${isCurrent ? "text-white" : "text-dark"}">
              ${u.name}
              <span class="badge ${isCurrent ? "bg-white text-primary" : (isAdmin ? "bg-danger" : "bg-primary")} ms-1 font-monospace" style="font-size: 0.7rem;">
                ${isAdmin ? "ADMIN" : "USER"}
              </span>
            </div>
            <div class="small ${isCurrent ? "text-white-50" : "text-muted"}">
              部門: ${u.department || "-"} | 帳號: @${u.username}
            </div>
            <div class="small ${isCurrent ? "text-white-50" : "text-secondary"} mt-1" style="font-size: 0.75rem;">
              開放選單: ${menusText}
            </div>
          </div>
        </div>
        <div>
          ${isCurrent
            ? `<span class="badge bg-light text-primary px-2 py-1">目前身份</span>`
            : `<span class="btn btn-sm btn-outline-secondary">點擊切換</span>`}
        </div>
      </button>
    `;
  }).join("");

  const modal = new bootstrap.Modal(document.getElementById("switchUserModal"));
  modal.show();
}

/**
 * 切換當前登入者並套用選單權限
 */
function switchActiveUser(userId) {
  const targetUser = appState.users.find((u) => u.id === userId);
  if (!targetUser) {
    showNotification("找不到目標使用者！", false);
    return;
  }

  appState.currentUser = targetUser;
  applyUserMenuPermissions();

  const modalEl = document.getElementById("switchUserModal");
  const modalInstance = bootstrap.Modal.getInstance(modalEl);
  if (modalInstance) modalInstance.hide();

  showNotification(`已成功切換為「${targetUser.name}」(${targetUser.role === "ADMIN" ? "管理者" : "使用者"})！左側選單已即時調整。`, true);

  // 若使用者正在使用者管理列表，重新渲染以標記當前登入者
  if (appState.currentView === "users") {
    renderUserTable();
  }
}

// ============================================================================
// 15. 資料庫檢查與初始化 (DATABASE SYNC)
// ============================================================================

async function triggerInitDb() {
  const btn = document.getElementById("initDbBtn");
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>檢查中...`;
  }

  const response = await fetchApi("/init-db", { method: "POST" });

  if (btn) {
    btn.disabled = false;
    btn.innerHTML = `⚙️ 資料庫檢查`;
  }

  if (response.success) {
    showNotification("PostgreSQL 4 大模組與使用者、企業資料庫資料表結構已確認就緒！", true);
    loadMetrics();
    loadQuotations(1);
  } else {
    showNotification(`資料庫初始化: ${response.message} (${response.error || "請確認 POSTGRES_URL"})`, false);
  }
}

// ============================================================================
// 16. DOM 就緒後全域事件監聽 (EVENT LISTENERS)
// ============================================================================

document.addEventListener("DOMContentLoaded", () => {
  // 1. 報價單表單監聽
  const quotationForm = document.getElementById("quotationForm");
  if (quotationForm) {
    quotationForm.addEventListener("submit", handleQuotationSubmit);
  }

  // 2. 報價單搜尋與篩選
  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        appState.quotationSearchKeyword = searchInput.value;
        loadQuotations(1);
      }
    });
  }

  const searchBtn = document.getElementById("searchBtn");
  if (searchBtn) {
    searchBtn.addEventListener("click", () => {
      appState.quotationSearchKeyword = searchInput ? searchInput.value : "";
      loadQuotations(1);
    });
  }

  const statusFilterSelect = document.getElementById("statusFilter");
  if (statusFilterSelect) {
    statusFilterSelect.addEventListener("change", (e) => {
      appState.quotationStatusFilter = e.target.value;
      loadQuotations(1);
    });
  }

  // 3. 通用刪除按鈕
  const confirmDeleteBtn = document.getElementById("confirmDeleteBtn");
  if (confirmDeleteBtn) {
    confirmDeleteBtn.addEventListener("click", executeDelete);
  }

  // 4. 資料庫初始化按鈕
  const initDbBtn = document.getElementById("initDbBtn");
  if (initDbBtn) {
    initDbBtn.addEventListener("click", triggerInitDb);
  }

  // 5. 使用者搜尋與篩選監聽
  const userSearchInput = document.getElementById("userSearchInput");
  if (userSearchInput) {
    userSearchInput.addEventListener("input", (e) => {
      appState.userSearchKeyword = e.target.value;
      renderUserTable();
    });
  }

  const userRoleFilter = document.getElementById("userRoleFilter");
  if (userRoleFilter) {
    userRoleFilter.addEventListener("change", (e) => {
      appState.userRoleFilter = e.target.value;
      renderUserTable();
    });
  }

  // 6. 公司基本資料表單即時同步預覽
  const companyForm = document.getElementById("companySettingsForm");
  if (companyForm) {
    companyForm.addEventListener("input", syncCompanyPreview);
  }

  // 7. 初始載入
  loadCompanySettings();
  loadUsers();
  applyUserMenuPermissions();

  loadMetrics();
  loadQuotations(1);
  loadCustomers(1);
  loadProducts(1);
  loadTransactions(1);
});
