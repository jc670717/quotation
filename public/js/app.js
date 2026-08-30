/**
 * ============================================================
 * 報價管理系統 (Quotation Management System) - 核心前端邏輯
 * 採用原生 JavaScript (Vanilla JS ES6+) 與 Bootstrap 5
 * 完整實作 9 大模組：儀表板、客戶、廠商、產品、報價單、交易、多公司/LOGO、使用者權限、修改歷程
 * ============================================================
 */

// 全域狀態儲存物件
const appState = {
  // 當前登入操作使用者 (預設管理者)
  currentUser: {
    id: 1,
    name: '系統管理者 (王總監)',
    username: 'admin',
    department: '資訊管理部',
    role: 'ADMIN',
    allowedMenus: ['dashboard', 'customers', 'vendors', 'products', 'quotations', 'transactions', 'company', 'users', 'audit_logs']
  },
  allUsers: [],
  allCompanies: [],
  currentCompany: null,
  customers: [],
  vendors: [],
  products: [],
  quotations: [],
  transactions: [],
  auditLogs: [],
  currentView: 'dashboard',
  deleteCallback: null
};

// 格式化數字為千分位貨幣字串
function formatCurrency(amount) {
  const num = parseFloat(amount) || 0;
  return 'NT$ ' + Math.round(num).toLocaleString('zh-TW');
}

// 格式化日期時間
function formatDate(dateStr) {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  } catch {
    return dateStr;
  }
}

function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
  } catch {
    return dateStr;
  }
}

// 顯示全域提示訊息 (Alert)
function showAlert(message, type = 'success', duration = 3500) {
  const container = document.getElementById('alertContainer');
  if (!container) return;

  const alertDiv = document.createElement('div');
  alertDiv.className = `alert alert-${type} alert-dismissible fade show shadow-sm py-2 px-3 mb-3 d-flex align-items-center justify-content-between`;
  alertDiv.role = 'alert';
  alertDiv.innerHTML = `
    <div>
      <span class="me-2">${type === 'success' ? '✅' : (type === 'danger' ? '❌' : 'ℹ️')}</span>
      <span>${message}</span>
    </div>
    <button type="button" class="btn-close py-2" data-bs-dismiss="alert" aria-label="Close"></button>
  `;

  container.appendChild(alertDiv);
  setTimeout(() => {
    try {
      const bsAlert = bootstrap.Alert.getOrCreateInstance(alertDiv);
      bsAlert.close();
    } catch {
      alertDiv.remove();
    }
  }, duration);
}

// 通用 Fetch API 請求包裝
async function fetchApi(endpoint, options = {}) {
  try {
    const defaultHeaders = { 'Content-Type': 'application/json' };
    const accessToken = localStorage.getItem('qms_access_token') || sessionStorage.getItem('qms_access_token');
    if (accessToken) defaultHeaders.Authorization = `Bearer ${accessToken}`;
    const config = {
      ...options,
      headers: { ...defaultHeaders, ...(options.headers || {}) }
    };
    const res = await fetch(endpoint, config);
    let result = {};
    try {
      result = await res.json();
    } catch (e) {
      result = { success: false, message: `伺服器回應格式錯誤 (HTTP ${res.status})` };
    }

    if (!res.ok) {
      if (result.detail) {
        const detailMsg = typeof result.detail === 'string'
          ? result.detail
          : Array.isArray(result.detail)
            ? result.detail.map(d => `${d.loc ? d.loc.join('.') : ''}: ${d.msg}`).join(', ')
            : JSON.stringify(result.detail);
        return { success: false, message: `請求驗證失敗：${detailMsg}`, error: detailMsg };
      }
      if (result.message) {
        return { success: false, message: result.message, error: result.error || '' };
      }
      return { success: false, message: `請求失敗 (HTTP ${res.status})` };
    }

    if (result && result.success === false && result.error) {
      result.message = `${result.message || '操作失敗'}：${result.error}`;
    }
    return result;
  } catch (err) {
    console.error(`Fetch API Error [${endpoint}]:`, err);
    return { success: false, data: null, message: '網路連線或 API 請求發生錯誤: ' + err.message, error: err.message };
  }
}

// ============================================================
// 1. 使用者認證、登入/登出與初始化 (Authentication & Lifecycle)
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  await initializeApp();
});

async function initializeApp() {
  // 未登入前不可預載帳號或商務資料，避免未授權請求與資料外洩。
  const savedUserJson = localStorage.getItem('qms_user') || sessionStorage.getItem('qms_user');
  const accessToken = localStorage.getItem('qms_access_token') || sessionStorage.getItem('qms_access_token');
  if (!savedUserJson || !accessToken) {
    showLoginScreen();
    return;
  }

  try {
    appState.currentUser = JSON.parse(savedUserJson);
  } catch {
    localStorage.removeItem('qms_user');
    sessionStorage.removeItem('qms_user');
    localStorage.removeItem('qms_access_token');
    sessionStorage.removeItem('qms_access_token');
    showLoginScreen();
    return;
  }

  await loadInitialUsers();
  await loadInitialCompanies();
  await loadInitialVendors();
  await loadInitialCustomers();
  await loadInitialProducts();

  showAppLayout();
  renderCurrentUserHeader();
  applySidebarMenuPermissions();
  switchView('dashboard');
}

// 顯示全螢幕登入畫面
function showLoginScreen() {
  const loginScreen = document.getElementById('loginScreen');
  const mainLayout = document.getElementById('mainAppLayout');
  const errorAlert = document.getElementById('loginErrorAlert');

  if (loginScreen) loginScreen.classList.remove('d-none');
  if (mainLayout) mainLayout.classList.add('d-none');
  if (errorAlert) {
    errorAlert.classList.add('d-none');
    errorAlert.textContent = '';
  }

  // 預設將游標置於帳號輸入框
  const usernameInput = document.getElementById('loginUsername');
  if (usernameInput) {
    usernameInput.value = '';
    usernameInput.focus();
  }
  const pwdInput = document.getElementById('loginPassword');
  if (pwdInput) pwdInput.value = '';
}

// 顯示主系統介面
function showAppLayout() {
  const loginScreen = document.getElementById('loginScreen');
  const mainLayout = document.getElementById('mainAppLayout');

  if (loginScreen) loginScreen.classList.add('d-none');
  if (mainLayout) mainLayout.classList.remove('d-none');
}

// 切換密碼可見性
function togglePasswordVisibility(fieldId, btn) {
  const field = document.getElementById(fieldId);
  if (!field) return;
  if (field.type === 'password') {
    field.type = 'text';
    btn.textContent = '🔒 隱藏密碼';
  } else {
    field.type = 'password';
    btn.textContent = '👁️ 顯示密碼';
  }
}

// 處理登入表單送出
async function handleLogin(e) {
  if (e && e.preventDefault) e.preventDefault();

  const usernameInput = document.getElementById('loginUsername');
  const passwordInput = document.getElementById('loginPassword');
  const rememberMe = document.getElementById('rememberMe');
  const errorAlert = document.getElementById('loginErrorAlert');
  const submitBtn = document.getElementById('loginSubmitBtn');

  const username = usernameInput ? usernameInput.value.trim() : '';
  const password = passwordInput ? passwordInput.value.trim() : '';

  if (!username) {
    if (errorAlert) {
      errorAlert.textContent = '請輸入使用者帳號';
      errorAlert.classList.remove('d-none');
    }
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status"></span>登入中...';
  }

  const res = await fetchApi('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password })
  });

  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<span>🚀</span><span>登入系統</span>';
  }

  if (res.success && res.data) {
    const { accessToken, ...currentUser } = res.data;
    if (!accessToken) {
      if (errorAlert) {
        errorAlert.textContent = '伺服器未提供登入憑證，請聯繫系統管理員。';
        errorAlert.classList.remove('d-none');
      }
      return;
    }
    appState.currentUser = currentUser;
    const isRemember = rememberMe ? rememberMe.checked : true;
    if (isRemember) {
      localStorage.setItem('qms_user', JSON.stringify(currentUser));
      localStorage.setItem('qms_access_token', accessToken);
    } else {
      sessionStorage.setItem('qms_user', JSON.stringify(currentUser));
      sessionStorage.setItem('qms_access_token', accessToken);
    }

    showAppLayout();
    renderCurrentUserHeader();
    applySidebarMenuPermissions();
    switchView('dashboard');
    showAlert(res.message || `歡迎回來，${res.data.name}！`, 'success');
  } else {
    if (errorAlert) {
      errorAlert.textContent = res.message || '登入失敗，請確認帳號與密碼。';
      errorAlert.classList.remove('d-none');
    }
  }
}

// 一鍵快速登入（供測試帳號使用）
async function quickLogin(username, password) {
  const usernameInput = document.getElementById('loginUsername');
  const passwordInput = document.getElementById('loginPassword');
  if (usernameInput) usernameInput.value = username;
  if (passwordInput) passwordInput.value = password;

  const errorAlert = document.getElementById('loginErrorAlert');
  if (errorAlert) errorAlert.classList.add('d-none');

  await handleLogin();
}

// 安全登出處理
async function handleLogout() {
  await fetchApi('/api/auth/logout', { method: 'POST' });
  localStorage.removeItem('qms_user');
  sessionStorage.removeItem('qms_user');
  localStorage.removeItem('qms_access_token');
  sessionStorage.removeItem('qms_access_token');

  showLoginScreen();
  showAlert('您已成功安全登出系統', 'info');
}

// 載入使用者清單
async function loadInitialUsers() {
  const res = await fetchApi('/api/users');
  if (res.success && Array.isArray(res.data) && res.data.length > 0) {
    appState.allUsers = res.data;
    // 如果預設使用者存在則更新
    const found = appState.allUsers.find(u => u.id === appState.currentUser.id) || appState.allUsers[0];
    appState.currentUser = found;
  }
}

// 載入公司清單
async function loadInitialCompanies() {
  const res = await fetchApi('/api/companies');
  if (res.success && Array.isArray(res.data) && res.data.length > 0) {
    appState.allCompanies = res.data;
    const defaultComp = appState.allCompanies.find(c => c.isDefault) || appState.allCompanies[0];
    appState.currentCompany = defaultComp;
  }
}

// 載入廠商清單
async function loadInitialVendors() {
  const res = await fetchApi('/api/vendors');
  if (res.success && Array.isArray(res.data)) {
    appState.vendors = res.data;
  }
}

// 載入客戶清單
async function loadInitialCustomers() {
  const res = await fetchApi('/api/customers');
  if (res.success && Array.isArray(res.data)) {
    appState.customers = res.data;
  }
}

// 載入產品清單
async function loadInitialProducts() {
  const res = await fetchApi('/api/products');
  if (res.success && Array.isArray(res.data)) {
    appState.products = res.data;
  }
}

// 切換手機版側邊欄
function toggleSidebar() {
  const sidebar = document.getElementById('appSidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (sidebar && backdrop) {
    sidebar.classList.toggle('show');
    backdrop.classList.toggle('show');
  }
}

// 根據當前使用者權限過濾左側選單項目
function applySidebarMenuPermissions() {
  const allowed = appState.currentUser.allowedMenus || [];
  const isAdmin = appState.currentUser.role === 'ADMIN';

  const menuLinks = document.querySelectorAll('#sidebarNavMenu .sidebar-nav-link');
  menuLinks.forEach(link => {
    const key = link.getAttribute('data-menu-key');
    if (isAdmin || allowed.includes(key)) {
      link.style.display = 'flex';
    } else {
      link.style.display = 'none';
    }
  });
}

// 切換頁面主視圖
function switchView(viewName) {
  const allowed = appState.currentUser.allowedMenus || [];
  const isAdmin = appState.currentUser.role === 'ADMIN';

  // 權限防護：若無權限且非管理員，導向儀表板
  if (!isAdmin && !allowed.includes(viewName) && viewName !== 'dashboard') {
    showAlert(`您的帳號 (${appState.currentUser.name}) 無存取「${viewName}」功能之權限`, 'warning');
    viewName = 'dashboard';
  }

  appState.currentView = viewName;

  // 隱藏所有視圖
  document.querySelectorAll('.app-view').forEach(v => {
    v.style.display = 'none';
  });

  // 顯示選定視圖
  const targetView = document.getElementById(`view-${viewName}`);
  if (targetView) {
    targetView.style.display = 'block';
  }

  // 更新側邊欄 active 狀態
  document.querySelectorAll('.sidebar-nav-link').forEach(link => {
    link.classList.remove('active');
  });
  const activeLink = document.getElementById(`nav-${viewName}`);
  if (activeLink) {
    activeLink.classList.add('active');
  }

  // 關閉手機側邊欄
  const sidebar = document.getElementById('appSidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (sidebar && sidebar.classList.contains('show')) {
    sidebar.classList.remove('show');
    backdrop.classList.remove('show');
  }

  // 更新頂部標題與載入該視圖資料
  const titleMap = {
    dashboard: '報價與商務管理控制台',
    customers: '客戶資料管理',
    vendors: '廠商資料管理',
    products: '產品與服務品項管理',
    quotations: '報價單作業管理',
    transactions: '交易與發票收款管理',
    company: '主體公司基本資料管理',
    users: '使用者與權限管理',
    audit_logs: '系統作業與修改歷程記錄'
  };
  const titleEl = document.getElementById('currentViewTitle');
  if (titleEl) {
    titleEl.textContent = titleMap[viewName] || '商務管理系統';
  }

  // 調度各模組載入函式
  switch (viewName) {
    case 'dashboard':
      loadDashboard();
      break;
    case 'customers':
      loadCustomers();
      break;
    case 'vendors':
      loadVendors();
      break;
    case 'products':
      loadProducts();
      break;
    case 'quotations':
      loadQuotations();
      break;
    case 'transactions':
      loadTransactions();
      break;
    case 'company':
      loadCompanySettings();
      break;
    case 'users':
      loadUsers();
      break;
    case 'audit_logs':
      loadAuditLogs();
      break;
  }
}

// 渲染頂部使用者身分面板
function renderCurrentUserHeader() {
  const u = appState.currentUser;
  if (!u) return;

  const headerAvatar = document.getElementById('headerUserAvatar');
  const headerName = document.getElementById('headerUserName');
  const headerRoleBadge = document.getElementById('headerUserRoleBadge');
  const headerDept = document.getElementById('headerUserDept');

  const shortName = (u.name || 'User').substring(0, 1);
  if (headerAvatar) headerAvatar.textContent = shortName;
  if (headerName) headerName.textContent = u.name || u.username;
  if (headerDept) headerDept.textContent = u.department || '未分配部門';

  if (headerRoleBadge) {
    if (u.role === 'ADMIN') {
      headerRoleBadge.className = 'badge bg-danger-subtle text-danger border border-danger-subtle px-1 py-0';
      headerRoleBadge.textContent = '系統管理者';
    } else {
      headerRoleBadge.className = 'badge bg-primary-subtle text-primary border border-primary-subtle px-1 py-0';
      headerRoleBadge.textContent = '業務人員';
    }
  }
}

// 開啟切換使用者 Modal
function openSwitchUserModal() {
  const listGroup = document.getElementById('switchUserListGroup');
  if (!listGroup) return;

  listGroup.innerHTML = '';
  appState.allUsers.forEach(u => {
    const isCurrent = u.id === appState.currentUser.id;
    const item = document.createElement('a');
    item.href = '#';
    item.className = `list-group-item list-group-item-action d-flex align-items-center justify-content-between p-3 ${isCurrent ? 'active' : ''}`;
    item.onclick = (e) => {
      e.preventDefault();
      switchCurrentUser(u.id);
    };

    const roleName = u.role === 'ADMIN' ? '系統管理者' : '一般使用者';
    item.innerHTML = `
      <div class="d-flex align-items-center gap-3">
        <div class="rounded-circle d-flex align-items-center justify-content-center fw-bold ${isCurrent ? 'bg-white text-primary' : 'bg-primary text-white'}" style="width: 40px; height: 40px;">
          ${(u.name || u.username).substring(0, 1)}
        </div>
        <div>
          <div class="fw-bold fs-6">${u.name} <small class="fw-normal ${isCurrent ? 'text-white-50' : 'text-muted'}">(@${u.username})</small></div>
          <div class="small ${isCurrent ? 'text-white-50' : 'text-secondary'}">
            部門：${u.department || '無'} ｜ 角色：${roleName}
          </div>
        </div>
      </div>
      <div>
        ${isCurrent ? '<span class="badge bg-light text-primary fw-bold">目前使用中</span>' : '<span class="btn btn-sm btn-outline-primary">切換此帳號</span>'}
      </div>
    `;
    listGroup.appendChild(item);
  });

  const modal = new bootstrap.Modal(document.getElementById('switchUserModal'));
  modal.show();
}

// 執行切換使用者
function switchCurrentUser(userId) {
  const found = appState.allUsers.find(u => u.id === userId);
  if (!found) return;

  appState.currentUser = found;
  renderCurrentUserHeader();
  applySidebarMenuPermissions();
  
  const modalEl = document.getElementById('switchUserModal');
  const modal = bootstrap.Modal.getInstance(modalEl);
  if (modal) modal.hide();

  showAlert(`已成功切換為使用者「${found.name}」(${found.role === 'ADMIN' ? '系統管理者' : '業務人員'})`, 'success');
  switchView(appState.currentView);
}


// ============================================================
// 2. 儀表板模組 (Dashboard View)
// 當年度 4 大 KPI 指標 (營業收入、報價總額、已結案毛利、已結案毛利率) + 0 筆隱藏狀態分佈
// ============================================================

async function loadDashboard() {
  // 同步取得指標資料
  const metricsRes = await fetchApi('/api/metrics');
  const quotationsRes = await fetchApi('/api/quotations?pageSize=5');
  const transactionsRes = await fetchApi('/api/transactions');

  if (metricsRes.success && metricsRes.data) {
    const d = metricsRes.data;
    const currentYear = d.currentYear || new Date().getFullYear().toString();

    // 更新當年度標籤
    document.querySelectorAll('[id^="kpiYearTag"]').forEach(el => el.textContent = currentYear);
    const headerYearBadge = document.getElementById('headerYearBadge');
    if (headerYearBadge) headerYearBadge.textContent = `${currentYear} 年度商務資料`;

    // 1. 當年度營業收入
    const revEl = document.getElementById('kpiRevenueVal');
    if (revEl) revEl.textContent = formatCurrency(d.yearRevenue);

    // 2. 當年度報價單總額
    const qValEl = document.getElementById('kpiQuotationVal');
    const qCountEl = document.getElementById('kpiQuotationCount');
    if (qValEl) qValEl.textContent = formatCurrency(d.yearQuotationTotal);
    if (qCountEl) qCountEl.textContent = d.yearQuotationCount || 0;

    // 3. 當年度已結案毛利
    const cpValEl = document.getElementById('kpiClosedProfitVal');
    if (cpValEl) cpValEl.textContent = formatCurrency(d.closedProfit);

    // 4. 當年度已結案毛利率
    const cmValEl = document.getElementById('kpiClosedMarginVal');
    if (cmValEl) cmValEl.textContent = (d.closedMargin || 0).toFixed(1) + ' %';

    // 報價單狀態分佈 (0 筆狀態自動隱藏)
    renderDashboardStatusDistribution(d.statusCounts || {});
  }

  // 渲染最近報價單
  if (quotationsRes.success && Array.isArray(quotationsRes.data)) {
    renderDashboardRecentQuotations(quotationsRes.data);
  }

  // 渲染最近交易單
  if (transactionsRes.success && Array.isArray(transactionsRes.data)) {
    renderDashboardRecentTransactions(transactionsRes.data.slice(0, 5));
  }
}

// 渲染狀態分佈 (0 筆不顯示)
function renderDashboardStatusDistribution(statusCounts) {
  const container = document.getElementById('statusDistributionContainer');
  if (!container) return;
  container.innerHTML = '';

  const statusMeta = {
    DRAFT: { name: '草稿 (Draft)', class: 'badge-draft' },
    SENT: { name: '已送出 (Sent)', class: 'badge-sent' },
    ACCEPTED: { name: '已核准 (Accepted)', class: 'badge-accepted' },
    REJECTED: { name: '已拒絕 (Rejected)', class: 'badge-rejected' },
    EXPIRED: { name: '已過期 (Expired)', class: 'badge-expired' }
  };

  let hasAnyNonZero = false;

  Object.entries(statusMeta).forEach(([key, meta]) => {
    const count = statusCounts[key] || 0;
    // 嚴格過濾：0 筆就不顯示
    if (count > 0) {
      hasAnyNonZero = true;
      const badge = document.createElement('div');
      badge.className = `p-2 px-3 rounded border d-flex align-items-center gap-2 bg-white shadow-sm`;
      badge.innerHTML = `
        <span class="${meta.class}">${meta.name}</span>
        <span class="fs-5 fw-bold text-dark font-monospace">${count}</span>
        <small class="text-muted">筆</small>
      `;
      container.appendChild(badge);
    }
  });

  if (!hasAnyNonZero) {
    container.innerHTML = '<span class="text-muted py-2 small">目前當年度尚無報價單狀態統計數據。</span>';
  }
}

// 儀表板最近報價單清單
function renderDashboardRecentQuotations(quotations) {
  const tbody = document.getElementById('dashboardRecentQuotationsTbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (quotations.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted">尚無報價單紀錄</td></tr>';
    return;
  }

  quotations.forEach(q => {
    const tr = document.createElement('tr');
    const statusBadges = {
      DRAFT: '<span class="badge-draft">草稿</span>',
      SENT: '<span class="badge-sent">已送出</span>',
      ACCEPTED: '<span class="badge-accepted">已核准</span>',
      REJECTED: '<span class="badge-rejected">已拒絕</span>',
      EXPIRED: '<span class="badge-expired">已過期</span>'
    };

    const profit = q.grossProfit !== undefined ? q.grossProfit : ((q.totalAmount || 0) - (q.totalCost || 0));
    const margin = q.grossMargin !== undefined ? q.grossMargin : (q.totalAmount > 0 ? ((profit / q.totalAmount) * 100).toFixed(1) : 0);

    tr.innerHTML = `
      <td><span class="quotation-code">${q.quotationNumber}</span></td>
      <td><div class="fw-semibold text-dark">${q.customerName}</div></td>
      <td><span class="fw-bold text-dark">${formatCurrency(q.totalAmount)}</span></td>
      <td><span class="text-success fw-bold">${formatCurrency(profit)}</span> <small class="text-muted">(${margin}%)</small></td>
      <td>${statusBadges[q.status] || q.status}</td>
      <td class="text-end">
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-secondary" onclick="openViewQuotationModal(${q.id})" title="檢視報價單">👁️</button>
          ${q.status !== 'ACCEPTED' ? `<button class="btn btn-outline-success" onclick="convertToTransaction(${q.id})" title="一鍵轉交易">💳 轉交易</button>` : ''}
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// 儀表板最近交易單清單
function renderDashboardRecentTransactions(transactions) {
  const tbody = document.getElementById('dashboardRecentTransactionsTbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (transactions.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted">尚無交易立案紀錄</td></tr>';
    return;
  }

  transactions.forEach(t => {
    const tr = document.createElement('tr');
    const paymentBadges = {
      PAID: '<span class="badge bg-success-subtle text-success border border-success-subtle">已結案</span>',
      PARTIAL: '<span class="badge bg-warning-subtle text-warning border border-warning-subtle">部分付</span>',
      PENDING: '<span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle">待付款</span>',
      REFUNDED: '<span class="badge bg-danger-subtle text-danger border border-danger-subtle">已退款</span>'
    };

    tr.innerHTML = `
      <td><span class="quotation-code font-monospace">${t.transactionNumber}</span></td>
      <td><div class="fw-semibold text-dark text-truncate" style="max-width: 120px;">${t.customerName}</div></td>
      <td>
        <div class="small fw-bold text-primary">${formatCurrency(t.paidAmount || 0)}</div>
        <div class="small text-muted">總: ${formatCurrency(t.totalAmount)}</div>
      </td>
      <td>${paymentBadges[t.paymentStatus] || t.paymentStatus}</td>
      <td class="text-end">
        <button class="btn btn-outline-primary btn-sm" onclick="openEditTransactionModal(${t.id})" title="管理發票與收款">編輯</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}


// ============================================================
// 3. 客戶管理模組 (Customers View)
// ============================================================

async function loadCustomers() {
  const res = await fetchApi('/api/customers');
  if (res.success && Array.isArray(res.data)) {
    appState.customers = res.data;
    renderCustomersTable(appState.customers);
  }
}

function renderCustomersTable(customers) {
  const tbody = document.getElementById('customersTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (customers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-muted">查無客戶資料</td></tr>';
    return;
  }

  customers.forEach(c => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="quotation-code">${c.customerCode || '-'}</span></td>
      <td>
        <div class="fw-bold text-dark">${c.customerName}</div>
        <div class="small text-muted">${c.notes || ''}</div>
      </td>
      <td><span class="font-monospace">${c.taxId || '-'}</span></td>
      <td><span class="fw-semibold">${c.contactPerson || '-'}</span></td>
      <td>
        <div>📞 ${c.phone || '-'}</div>
        <div class="small text-muted">✉️ ${c.email || '-'}</div>
      </td>
      <td><small class="text-secondary">${c.address || '-'}</small></td>
      <td>
        <div class="small fw-semibold text-dark">${c.updatedBy || c.createdBy || '系統管理者'}</div>
        <div class="small text-muted">${formatDateTime(c.updatedAt || c.createdAt)}</div>
      </td>
      <td class="text-end">
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-primary" onclick="openEditCustomerModal(${c.id})" title="編輯客戶">✏️ 編輯</button>
          <button class="btn btn-outline-danger" onclick="confirmDeleteCustomer(${c.id}, '${c.customerName}')" title="刪除客戶">🗑️</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function handleCustomerSearch() {
  const keyword = (document.getElementById('customerSearchInput')?.value || '').toLowerCase().trim();
  const filtered = appState.customers.filter(c => {
    return (
      (c.customerName || '').toLowerCase().includes(keyword) ||
      (c.customerCode || '').toLowerCase().includes(keyword) ||
      (c.contactPerson || '').toLowerCase().includes(keyword) ||
      (c.phone || '').includes(keyword) ||
      (c.email || '').toLowerCase().includes(keyword)
    );
  });
  renderCustomersTable(filtered);
}

function openCreateCustomerModal() {
  const form = document.getElementById('customerForm');
  if (form) form.reset();
  document.getElementById('c_id').value = '';
  document.getElementById('customerModalTitle').textContent = '➕ 新增客戶資料';
  
  const modal = new bootstrap.Modal(document.getElementById('customerModal'));
  modal.show();
}

function openEditCustomerModal(id) {
  const c = appState.customers.find(item => item.id === id);
  if (!c) return;

  document.getElementById('c_id').value = c.id;
  document.getElementById('c_code').value = c.customerCode || '';
  document.getElementById('c_name').value = c.customerName || '';
  document.getElementById('c_tax_id').value = c.taxId || '';
  document.getElementById('c_contact_person').value = c.contactPerson || '';
  document.getElementById('c_phone').value = c.phone || '';
  document.getElementById('c_email').value = c.email || '';
  document.getElementById('c_payment_terms').value = c.paymentTerms || '';
  document.getElementById('c_address').value = c.address || '';
  document.getElementById('c_notes').value = c.notes || '';

  document.getElementById('customerModalTitle').textContent = `✏️ 編輯客戶：${c.customerName}`;
  const modal = new bootstrap.Modal(document.getElementById('customerModal'));
  modal.show();
}

async function handleSaveCustomer(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (form.dataset.isSubmitting === 'true') return;
  form.dataset.isSubmitting = 'true';
  const submitButton = form.querySelector('button[type="submit"]');
  if (submitButton) submitButton.disabled = true;
  try {
  const id = document.getElementById('c_id').value;
  const isEdit = !!id;

  const payload = {
    customerCode: document.getElementById('c_code').value.trim(),
    customerName: document.getElementById('c_name').value.trim(),
    taxId: document.getElementById('c_tax_id').value.trim(),
    contactPerson: document.getElementById('c_contact_person').value.trim(),
    phone: document.getElementById('c_phone').value.trim(),
    email: document.getElementById('c_email').value.trim(),
    paymentTerms: document.getElementById('c_payment_terms').value.trim(),
    address: document.getElementById('c_address').value.trim(),
    notes: document.getElementById('c_notes').value.trim(),
    createdBy: appState.currentUser.name,
    updatedBy: appState.currentUser.name
  };

  const endpoint = isEdit ? `/api/customers/${id}` : '/api/customers';
  const method = isEdit ? 'PUT' : 'POST';

  const res = await fetchApi(endpoint, { method, body: JSON.stringify(payload) });
  if (res.success) {
    showAlert(isEdit ? '客戶資料更新成功！' : '客戶建立成功！', 'success');
    const modalEl = document.getElementById('customerModal');
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();
    await loadCustomers();
  } else {
    showAlert(res.error ? `${res.message || '儲存失敗'}: ${res.error}` : (res.message || '儲存失敗'), 'danger', 6000);
  }
  } finally {
    form.dataset.isSubmitting = 'false';
    if (submitButton) submitButton.disabled = false;
  }
}

function confirmDeleteCustomer(id, name) {
  openDeleteConfirmModal(`確定要刪除客戶「${name}」嗎？`, async () => {
    const res = await fetchApi(`/api/customers/${id}?operator=${encodeURIComponent(appState.currentUser.name)}`, { method: 'DELETE' });
    if (res.success) {
      showAlert(`客戶「${name}」已成功刪除`, 'success');
      await loadCustomers();
    } else {
      showAlert(res.message || '刪除失敗', 'danger');
    }
  });
}


// ============================================================
// 4. 廠商管理模組 (Vendors View) - NEW MODULE
// 廠商名稱、統計、電話、住址、聯絡人、Email、備註產品及服務項目、修改人/時間
// ============================================================

async function loadVendors() {
  const res = await fetchApi('/api/vendors');
  if (res.success && Array.isArray(res.data)) {
    appState.vendors = res.data;
    renderVendorsTable(appState.vendors);
  }
}

function renderVendorsTable(vendors) {
  const tbody = document.getElementById('vendorsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (vendors.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" class="text-center py-4 text-muted">尚無廠商資料</td></tr>';
    return;
  }

  vendors.forEach(v => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="quotation-code">${v.vendorCode || '-'}</span></td>
      <td>
        <div class="fw-bold text-dark">${v.vendorName}</div>
        <div class="small text-muted">${v.notes || ''}</div>
      </td>
      <td><span class="font-monospace">${v.taxId || '-'}</span></td>
      <td><span class="fw-semibold">${v.contactPerson || '-'}</span></td>
      <td>
        <div>📞 ${v.phone || '-'}</div>
        <div class="small text-muted">✉️ ${v.email || '-'}</div>
      </td>
      <td><small class="text-dark fw-semibold">${v.productsAndServices || '-'}</small></td>
      <td>
        <span class="badge bg-primary-subtle text-primary border border-primary-subtle">${v.totalProducts || 0} 種產品</span>
        <div class="small text-muted mt-1">合作 ${v.cooperationCount || 0} 次</div>
      </td>
      <td>
        <div class="small fw-semibold text-dark">${v.updatedBy || v.createdBy || '系統管理者'}</div>
        <div class="small text-muted">${formatDateTime(v.updatedAt || v.createdAt)}</div>
      </td>
      <td class="text-end">
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-primary" onclick="openEditVendorModal(${v.id})" title="編輯廠商">✏️ 編輯</button>
          <button class="btn btn-outline-danger" onclick="confirmDeleteVendor(${v.id}, '${v.vendorName}')" title="刪除廠商">🗑️</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function handleVendorSearch() {
  const keyword = (document.getElementById('vendorSearchInput')?.value || '').toLowerCase().trim();
  const filtered = appState.vendors.filter(v => {
    return (
      (v.vendorName || '').toLowerCase().includes(keyword) ||
      (v.vendorCode || '').toLowerCase().includes(keyword) ||
      (v.contactPerson || '').toLowerCase().includes(keyword) ||
      (v.phone || '').includes(keyword) ||
      (v.email || '').toLowerCase().includes(keyword) ||
      (v.productsAndServices || '').toLowerCase().includes(keyword)
    );
  });
  renderVendorsTable(filtered);
}

function openCreateVendorModal() {
  const form = document.getElementById('vendorForm');
  if (form) form.reset();
  document.getElementById('v_id').value = '';
  document.getElementById('vendorModalTitle').textContent = '➕ 新增協力廠商';
  
  const modal = new bootstrap.Modal(document.getElementById('vendorModal'));
  modal.show();
}

function openEditVendorModal(id) {
  const v = appState.vendors.find(item => item.id === id);
  if (!v) return;

  document.getElementById('v_id').value = v.id;
  document.getElementById('v_code').value = v.vendorCode || '';
  document.getElementById('v_name').value = v.vendorName || '';
  document.getElementById('v_tax_id').value = v.taxId || '';
  document.getElementById('v_contact_person').value = v.contactPerson || '';
  document.getElementById('v_phone').value = v.phone || '';
  document.getElementById('v_email').value = v.email || '';
  document.getElementById('v_address').value = v.address || '';
  document.getElementById('v_products_services').value = v.productsAndServices || '';
  document.getElementById('v_notes').value = v.notes || '';

  document.getElementById('vendorModalTitle').textContent = `✏️ 編輯廠商：${v.vendorName}`;
  const modal = new bootstrap.Modal(document.getElementById('vendorModal'));
  modal.show();
}

async function handleSaveVendor(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (form.dataset.isSubmitting === 'true') return;
  form.dataset.isSubmitting = 'true';
  const submitButton = form.querySelector('button[type="submit"]');
  if (submitButton) submitButton.disabled = true;
  try {
  const id = document.getElementById('v_id').value;
  const isEdit = !!id;

  const payload = {
    vendorCode: document.getElementById('v_code').value.trim(),
    vendorName: document.getElementById('v_name').value.trim(),
    taxId: document.getElementById('v_tax_id').value.trim(),
    contactPerson: document.getElementById('v_contact_person').value.trim(),
    phone: document.getElementById('v_phone').value.trim(),
    email: document.getElementById('v_email').value.trim(),
    address: document.getElementById('v_address').value.trim(),
    productsAndServices: document.getElementById('v_products_services').value.trim(),
    notes: document.getElementById('v_notes').value.trim(),
    createdBy: appState.currentUser.name,
    updatedBy: appState.currentUser.name
  };

  const endpoint = isEdit ? `/api/vendors/${id}` : '/api/vendors';
  const method = isEdit ? 'PUT' : 'POST';

  const res = await fetchApi(endpoint, { method, body: JSON.stringify(payload) });
  if (res.success) {
    showAlert(isEdit ? '廠商資料更新成功！' : '廠商建立成功！', 'success');
    const modalEl = document.getElementById('vendorModal');
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();
    await loadVendors();
  } else {
    showAlert(res.message || '儲存失敗', 'danger');
  }
  } finally {
    form.dataset.isSubmitting = 'false';
    if (submitButton) submitButton.disabled = false;
  }
}

function confirmDeleteVendor(id, name) {
  openDeleteConfirmModal(`確定要刪除協力廠商「${name}」嗎？`, async () => {
    const res = await fetchApi(`/api/vendors/${id}?operator=${encodeURIComponent(appState.currentUser.name)}`, { method: 'DELETE' });
    if (res.success) {
      showAlert(`廠商「${name}」已成功刪除`, 'success');
      await loadVendors();
    } else {
      showAlert(res.message || '刪除失敗', 'danger');
    }
  });
}


// ============================================================
// 5. 產品管理模組 (Products View)
// 支援圖片上傳、品牌、型號、廠商下拉選單與修改、成本價與毛利計算
// ============================================================

async function loadProducts() {
  const res = await fetchApi('/api/products');
  if (res.success && Array.isArray(res.data)) {
    appState.products = res.data;
    renderProductsTable(appState.products);
  }
}

function renderProductsTable(products) {
  const tbody = document.getElementById('productsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (products.length === 0) {
    tbody.innerHTML = '<tr><td colspan="13" class="text-center py-4 text-muted">尚無產品資料</td></tr>';
    return;
  }

  products.forEach(p => {
    const tr = document.createElement('tr');
    const cost = parseFloat(p.costPrice) || 0;
    const price = parseFloat(p.unitPrice) || 0;
    const profit = price - cost;
    const margin = price > 0 ? ((profit / price) * 100).toFixed(1) : '0.0';

    // 縮圖
    const thumbHtml = p.imageUrl ? 
      `<img src="${p.imageUrl}" alt="${p.productName}" class="rounded border" style="width: 48px; height: 48px; object-fit: cover;" />` :
      `<div class="bg-light rounded border text-muted d-flex align-items-center justify-content-center small" style="width: 48px; height: 48px;">📦</div>`;

    tr.innerHTML = `
      <td>${thumbHtml}</td>
      <td><span class="quotation-code">${p.productCode || '-'}</span></td>
      <td>
        <div class="fw-bold text-dark">${p.productName}</div>
        <div class="small text-muted text-truncate" style="max-width: 220px;">${p.description || ''}</div>
      </td>
      <td>
        <div class="fw-semibold text-dark">${p.brand || '自研'}</div>
        <div class="small text-muted font-monospace">${p.model || '-'}</div>
      </td>
      <td><span class="badge bg-secondary-subtle text-secondary">${p.category || '一般'}</span></td>
      <td><span class="text-muted">${p.unit || '件'}</span></td>
      <td><span class="text-danger fw-semibold">${formatCurrency(cost)}</span></td>
      <td><span class="text-primary fw-bold">${formatCurrency(price)}</span></td>
      <td>
        <span class="fw-bold text-success">${formatCurrency(profit)}</span>
        <div class="small text-muted">(${margin}%)</div>
      </td>
      <td>
        ${p.status === 'ACTIVE' ? '<span class="badge bg-success-subtle text-success">銷售中</span>' : '<span class="badge bg-secondary-subtle text-secondary">已停售</span>'}
      </td>
      <td>
        <div class="small fw-semibold text-dark">${p.updatedBy || p.createdBy || '系統管理者'}</div>
        <div class="small text-muted">${formatDateTime(p.updatedAt || p.createdAt)}</div>
      </td>
      <td class="text-end">
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-primary" onclick="openEditProductModal(${p.id})" title="編輯產品">✏️ 編輯</button>
          <button class="btn btn-outline-danger" onclick="confirmDeleteProduct(${p.id}, '${p.productName}')" title="刪除產品">🗑️</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function handleProductSearch() {
  const keyword = (document.getElementById('productSearchInput')?.value || '').toLowerCase().trim();
  const cat = document.getElementById('productCategoryFilter')?.value || '';

  const filtered = appState.products.filter(p => {
    if (cat && p.category !== cat) return false;
    return (
      (p.productName || '').toLowerCase().includes(keyword) ||
      (p.productCode || '').toLowerCase().includes(keyword) ||
      (p.brand || '').toLowerCase().includes(keyword) ||
      (p.model || '').toLowerCase().includes(keyword) ||
      (p.vendor || '').toLowerCase().includes(keyword) ||
      (p.description || '').toLowerCase().includes(keyword)
    );
  });
  renderProductsTable(filtered);
}

// 產品圖片選擇轉換為 Base64
function handleProductImageFileChange(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (file.size > 2 * 1024 * 1024) {
    showAlert('圖片大小不得超過 2MB', 'warning');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const base64 = e.target.result;
    document.getElementById('p_image_url').value = base64;
    const box = document.getElementById('productImagePreviewBox');
    if (box) {
      box.innerHTML = `<img src="${base64}" alt="Preview" style="max-width: 100%; max-height: 100%; object-fit: contain;" />`;
    }
  };
  reader.readAsDataURL(file);
}

function removeProductImage() {
  document.getElementById('p_image_url').value = '';
  const fileInput = document.getElementById('productImageFileInput');
  if (fileInput) fileInput.value = '';
  const box = document.getElementById('productImagePreviewBox');
  if (box) box.innerHTML = '<span class="text-muted small text-center">無圖片</span>';
}

function populateProductVendorSelect(selectedVendorName = '') {
  const sel = document.getElementById('p_vendor_select');
  if (!sel) return;
  sel.innerHTML = '<option value="">-- 請選擇現有廠商 (或於右欄輸入) --</option>';

  appState.vendors.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.vendorName;
    opt.textContent = `${v.vendorName} (${v.vendorCode})`;
    if (v.vendorName === selectedVendorName) opt.selected = true;
    sel.appendChild(opt);
  });
}

function handleProductVendorSelect(val) {
  const vendorInput = document.getElementById('p_vendor');
  if (vendorInput && val) {
    vendorInput.value = val;
  }
}

function openCreateProductModal() {
  const form = document.getElementById('productForm');
  if (form) form.reset();
  document.getElementById('p_id').value = '';
  removeProductImage();
  populateProductVendorSelect();
  document.getElementById('productModalTitle').textContent = '➕ 新增產品 / 服務品項';
  
  const modal = new bootstrap.Modal(document.getElementById('productModal'));
  modal.show();
}

function openEditProductModal(id) {
  const p = appState.products.find(item => item.id === id);
  if (!p) return;

  document.getElementById('p_id').value = p.id;
  document.getElementById('p_code').value = p.productCode || '';
  document.getElementById('p_name').value = p.productName || '';
  document.getElementById('p_brand').value = p.brand || '';
  document.getElementById('p_model').value = p.model || '';
  document.getElementById('p_vendor').value = p.vendor || '';
  document.getElementById('p_category').value = p.category || '一般商品';
  document.getElementById('p_unit').value = p.unit || '件';
  document.getElementById('p_cost_price').value = p.costPrice || 0;
  document.getElementById('p_unit_price').value = p.unitPrice || 0;
  document.getElementById('p_stock').value = p.stockQuantity || 100;
  document.getElementById('p_status').value = p.status || 'ACTIVE';
  document.getElementById('p_description').value = p.description || '';
  document.getElementById('p_image_url').value = p.imageUrl || '';

  populateProductVendorSelect(p.vendor);

  const box = document.getElementById('productImagePreviewBox');
  if (box) {
    if (p.imageUrl) {
      box.innerHTML = `<img src="${p.imageUrl}" alt="${p.productName}" style="max-width: 100%; max-height: 100%; object-fit: contain;" />`;
    } else {
      box.innerHTML = '<span class="text-muted small text-center">無圖片</span>';
    }
  }

  document.getElementById('productModalTitle').textContent = `✏️ 編輯產品：${p.productName}`;
  const modal = new bootstrap.Modal(document.getElementById('productModal'));
  modal.show();
}

async function handleSaveProduct(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (form.dataset.isSubmitting === 'true') return;
  form.dataset.isSubmitting = 'true';
  const submitButton = form.querySelector('button[type="submit"]');
  if (submitButton) submitButton.disabled = true;
  try {
  const id = document.getElementById('p_id').value;
  const isEdit = !!id;

  const vendorName = document.getElementById('p_vendor').value.trim();
  const foundVendor = appState.vendors.find(v => v.vendorName === vendorName);

  const imgVal = document.getElementById('p_image_url').value || '';

  const payload = {
    productCode: document.getElementById('p_code').value.trim(),
    productName: document.getElementById('p_name').value.trim(),
    brand: document.getElementById('p_brand').value.trim(),
    model: document.getElementById('p_model').value.trim(),
    vendor: vendorName,
    vendorId: foundVendor ? foundVendor.id : null,
    image: imgVal,
    imageUrl: imgVal,
    category: document.getElementById('p_category').value,
    unit: document.getElementById('p_unit').value.trim() || '件',
    costPrice: parseFloat(document.getElementById('p_cost_price').value) || 0,
    unitPrice: parseFloat(document.getElementById('p_unit_price').value) || 0,
    stockQuantity: parseInt(document.getElementById('p_stock').value, 10) || 0,
    status: document.getElementById('p_status').value,
    description: document.getElementById('p_description').value.trim(),
    createdBy: appState.currentUser.name,
    updatedBy: appState.currentUser.name
  };

  const endpoint = isEdit ? `/api/products/${id}` : '/api/products';
  const method = isEdit ? 'PUT' : 'POST';

  const res = await fetchApi(endpoint, { method, body: JSON.stringify(payload) });
  if (res.success) {
    showAlert(isEdit ? '產品資訊更新成功！' : '產品建立成功！', 'success');
    const modalEl = document.getElementById('productModal');
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();
    await loadProducts();
  } else {
    showAlert(res.error ? `${res.message || '儲存失敗'} (${res.error})` : (res.message || '儲存失敗'), 'danger', 6000);
  }
  } finally {
    form.dataset.isSubmitting = 'false';
    if (submitButton) submitButton.disabled = false;
  }
}

function confirmDeleteProduct(id, name) {
  openDeleteConfirmModal(`確定要刪除產品「${name}」嗎？`, async () => {
    const res = await fetchApi(`/api/products/${id}?operator=${encodeURIComponent(appState.currentUser.name)}`, { method: 'DELETE' });
    if (res.success) {
      showAlert(`產品「${name}」已成功刪除`, 'success');
      await loadProducts();
    } else {
      showAlert(res.message || '刪除失敗', 'danger');
    }
  });
}


// ============================================================
// 6. 報價單管理模組 (Quotations View)
// 支援最上方開立公司選擇並自動帶入聯絡窗口、一鍵轉交易、檢視、列印與毛利試算
// ============================================================

async function loadQuotations() {
  const res = await fetchApi('/api/quotations');
  if (res.success && Array.isArray(res.data)) {
    appState.quotations = res.data;
    renderQuotationsTable(appState.quotations);
  }
}

function renderQuotationsTable(quotations) {
  const tbody = document.getElementById('quotationsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (quotations.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" class="text-center py-4 text-muted">尚無報價單紀錄</td></tr>';
    return;
  }

  quotations.forEach(q => {
    const tr = document.createElement('tr');
    const statusBadges = {
      DRAFT: '<span class="badge-draft">草稿 (Draft)</span>',
      SENT: '<span class="badge-sent">已送出 (Sent)</span>',
      ACCEPTED: '<span class="badge-accepted">已核准 (Accepted)</span>',
      REJECTED: '<span class="badge-rejected">已拒絕 (Rejected)</span>',
      EXPIRED: '<span class="badge-expired">已過期 (Expired)</span>'
    };

    const profit = q.grossProfit !== undefined ? q.grossProfit : ((q.totalAmount || 0) - (q.totalCost || 0));
    const margin = q.grossMargin !== undefined ? q.grossMargin : (q.totalAmount > 0 ? ((profit / q.totalAmount) * 100).toFixed(1) : 0);

    tr.innerHTML = `
      <td><span class="quotation-code">${q.quotationNumber}</span></td>
      <td><span class="badge bg-light text-dark border">${q.companyName || '極簡資訊科技'}</span></td>
      <td>
        <div class="fw-bold text-dark">${q.customerName}</div>
        <div class="small text-muted">${q.customerContactPerson ? `窗口: ${q.customerContactPerson}` : ''}</div>
      </td>
      <td><span class="small">${formatDate(q.issueDate)}</span></td>
      <td>${statusBadges[q.status] || q.status}</td>
      <td><span class="fw-bold text-primary">${formatCurrency(q.totalAmount)}</span></td>
      <td><span class="text-danger fw-semibold">${formatCurrency(q.totalCost || 0)}</span></td>
      <td>
        <span class="text-success fw-bold">${formatCurrency(profit)}</span>
        <div class="small text-muted">(${margin}%)</div>
      </td>
      <td>
        <div class="small fw-semibold text-dark">${q.updatedBy || q.createdBy || '系統管理者'}</div>
        <div class="small text-muted">${formatDateTime(q.updatedAt || q.createdAt)}</div>
      </td>
      <td class="text-end">
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-secondary" onclick="openViewQuotationModal(${q.id})" title="檢視正式報價單">👁️</button>
          ${q.status !== 'ACCEPTED' ? `<button class="btn btn-outline-success" onclick="convertToTransaction(${q.id})" title="轉為交易單">💳 轉交易</button>` : ''}
          <button class="btn btn-outline-primary" onclick="openEditQuotationModal(${q.id})" title="編輯報價單">✏️</button>
          <button class="btn btn-outline-danger" onclick="confirmDeleteQuotation(${q.id}, '${q.quotationNumber}')" title="刪除報價單">🗑️</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function handleQuotationSearch() {
  const keyword = (document.getElementById('quotationSearchInput')?.value || '').toLowerCase().trim();
  const status = document.getElementById('quotationStatusFilter')?.value || '';

  const filtered = appState.quotations.filter(q => {
    if (status && q.status !== status) return false;
    return (
      (q.quotationNumber || '').toLowerCase().includes(keyword) ||
      (q.customerName || '').toLowerCase().includes(keyword) ||
      (q.companyName || '').toLowerCase().includes(keyword) ||
      (q.customerContactPerson || '').toLowerCase().includes(keyword)
    );
  });
  renderQuotationsTable(filtered);
}

// 報價單開立主體公司切換 -> 自動帶入聯絡窗口資料
function handleQuotationCompanyChange() {
  const companySelect = document.getElementById('q_company_id');
  const compId = parseInt(companySelect.value, 10);
  const comp = appState.allCompanies.find(c => c.id === compId) || appState.allCompanies[0];
  if (!comp) return;

  document.getElementById('q_company_name').value = comp.companyName;
  document.getElementById('q_company_contact_person').value = comp.contactPerson || '';
  document.getElementById('q_company_contact_phone').value = comp.contactPhone || comp.phone || '';
  document.getElementById('q_company_contact_email').value = comp.contactEmail || comp.email || '';

  document.getElementById('q_company_contact_person_text').textContent = comp.contactPerson || '未設定';
  document.getElementById('q_company_contact_phone_text').textContent = comp.contactPhone || comp.phone || '無電話';
  document.getElementById('q_company_contact_email_text').textContent = comp.contactEmail || comp.email || '無 Email';

  // 若尚未輸入備註，帶入該公司的預設條款
  const notesField = document.getElementById('q_notes');
  if (notesField && !notesField.value.trim() && comp.defaultTerms) {
    notesField.value = comp.defaultTerms;
  }
}

// 填入報價單公司下拉選單
function populateQuotationCompanySelect(selectedCompanyId = null) {
  const sel = document.getElementById('q_company_id');
  if (!sel) return;
  sel.innerHTML = '';

  appState.allCompanies.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = `${c.companyName} ${c.isDefault ? '(系統預設)' : ''}`;
    if (selectedCompanyId ? (c.id === selectedCompanyId) : c.isDefault) {
      opt.selected = true;
    }
    sel.appendChild(opt);
  });

  handleQuotationCompanyChange();
}

// 填入報價單客戶下拉選單
function populateQuotationCustomerSelect(selectedCustomerId = null) {
  const sel = document.getElementById('q_customer_select');
  if (!sel) return;
  sel.innerHTML = '<option value="">-- 請選擇既有客戶 (自動帶入統編與通訊資料) --</option>';

  appState.customers.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = `${c.customerName} (${c.customerCode || '無編號'})`;
    if (c.id === selectedCustomerId) opt.selected = true;
    sel.appendChild(opt);
  });
}

function handleQuotationCustomerSelect(customerId) {
  if (!customerId) return;
  const c = appState.customers.find(item => item.id === parseInt(customerId, 10));
  if (!c) return;

  document.getElementById('q_customer_id').value = c.id;
  document.getElementById('q_customer_name').value = c.customerName;
  document.getElementById('q_customer_tax_id').value = c.taxId || '';
  document.getElementById('q_customer_contact').value = c.contactPerson || '';
  document.getElementById('q_customer_phone').value = c.phone || '';
  document.getElementById('q_customer_email').value = c.email || '';
  document.getElementById('q_customer_address').value = c.address || '';
}

// 動態增加報價單明細列
function addQuotationItemRow(item = null) {
  const container = document.getElementById('quotationItemsContainer');
  if (!container) return;

  const rowId = 'q_item_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
  const rowDiv = document.createElement('div');
  rowDiv.className = 'item-row p-3 mb-2';
  rowDiv.id = rowId;

  // 產品下拉選單選項
  let productOptions = '<option value="">-- 關聯現有產品 (選填) --</option>';
  appState.products.forEach(p => {
    productOptions += `<option value="${p.id}" data-price="${p.unitPrice}" data-cost="${p.costPrice}" data-desc="${p.description || ''}" ${item && item.productId === p.id ? 'selected' : ''}>${p.productName} [售: ${formatCurrency(p.unitPrice)}]</option>`;
  });

  const itemName = item ? item.itemName : '';
  const itemDesc = item ? (item.description || '') : '';
  const quantity = item ? (item.quantity || 1) : 1;
  const costPrice = item ? (item.costPrice !== undefined ? item.costPrice : 0) : 0;
  const unitPrice = item ? (item.unitPrice || 0) : 0;
  const lineTotal = quantity * unitPrice;

  rowDiv.innerHTML = `
    <div class="row g-2 align-items-center">
      <div class="col-12 col-md-4">
        <select class="form-select form-select-sm mb-1 item-prod-select" onchange="handleQuotationItemProductChange('${rowId}', this)">
          ${productOptions}
        </select>
        <input type="text" class="form-control form-control-sm item-name-input" required placeholder="品項名稱 *" value="${itemName}" />
      </div>
      <div class="col-12 col-md-3">
        <textarea class="form-control form-control-sm item-desc-input" rows="2" placeholder="規格與明細描述">${itemDesc}</textarea>
      </div>
      <div class="col-4 col-md-1">
        <label class="small text-muted d-md-none">數量</label>
        <input type="number" class="form-control form-control-sm text-center item-qty-input" min="0.01" step="any" required value="${quantity}" oninput="calculateQuotationTotals()" />
      </div>
      <div class="col-4 col-md-1">
        <label class="small text-muted d-md-none">成本</label>
        <input type="number" class="form-control form-control-sm text-end item-cost-input text-danger" min="0" step="any" value="${costPrice}" oninput="calculateQuotationTotals()" placeholder="成本" />
      </div>
      <div class="col-4 col-md-1">
        <label class="small text-muted d-md-none">單價</label>
        <input type="number" class="form-control form-control-sm text-end item-price-input text-primary fw-semibold" min="0" step="any" required value="${unitPrice}" oninput="calculateQuotationTotals()" placeholder="單價" />
      </div>
      <div class="col-8 col-md-1 text-end">
        <div class="small text-muted d-md-none">小計</div>
        <span class="fw-bold text-dark item-line-total">${formatCurrency(lineTotal)}</span>
      </div>
      <div class="col-4 col-md-1 text-end">
        <button type="button" class="btn btn-outline-danger btn-sm" onclick="removeQuotationItemRow('${rowId}')" title="刪除品項">✕</button>
      </div>
    </div>
  `;

  container.appendChild(rowDiv);
  calculateQuotationTotals();
}

function handleQuotationItemProductChange(rowId, selectEl) {
  const selectedOpt = selectEl.options[selectEl.selectedIndex];
  if (!selectedOpt || !selectedOpt.value) return;

  const row = document.getElementById(rowId);
  if (!row) return;

  const nameInput = row.querySelector('.item-name-input');
  const descInput = row.querySelector('.item-desc-input');
  const priceInput = row.querySelector('.item-price-input');
  const costInput = row.querySelector('.item-cost-input');

  const prod = appState.products.find(p => p.id === parseInt(selectedOpt.value, 10));
  if (prod) {
    if (nameInput) nameInput.value = prod.productName;
    if (descInput) descInput.value = prod.description || `${prod.brand ? '品牌: ' + prod.brand : ''} ${prod.model ? '型號: ' + prod.model : ''}`;
    if (priceInput) priceInput.value = prod.unitPrice || 0;
    if (costInput) costInput.value = prod.costPrice || 0;
  }
  calculateQuotationTotals();
}

function removeQuotationItemRow(rowId) {
  const row = document.getElementById(rowId);
  if (row) row.remove();
  calculateQuotationTotals();
}

// 即時計算報價單總計、稅額、總成本與毛利率
function calculateQuotationTotals() {
  const container = document.getElementById('quotationItemsContainer');
  if (!container) return;

  let subtotal = 0;
  let totalCost = 0;

  const rows = container.querySelectorAll('.item-row');
  rows.forEach(row => {
    const qty = parseFloat(row.querySelector('.item-qty-input')?.value) || 0;
    const price = parseFloat(row.querySelector('.item-price-input')?.value) || 0;
    const cost = parseFloat(row.querySelector('.item-cost-input')?.value) || 0;
    const lineTotal = qty * price;

    subtotal += lineTotal;
    totalCost += (qty * cost);

    const lineTotalEl = row.querySelector('.item-line-total');
    if (lineTotalEl) lineTotalEl.textContent = formatCurrency(lineTotal);
  });

  const taxMode = document.querySelector('input[name="q_tax_mode"]:checked')?.value || 'EXCLUSIVE';
  const taxRate = 5;
  let taxAmount = 0;
  let totalAmount = 0;
  let subtotalCalculated = subtotal;

  if (taxMode === 'INCLUSIVE') {
    totalAmount = subtotal;
    const untaxed = Math.round(totalAmount / (1 + (taxRate / 100)));
    taxAmount = totalAmount - untaxed;
    subtotalCalculated = untaxed;
  } else if (taxMode === 'ZERO') {
    taxAmount = 0;
    totalAmount = subtotal;
    subtotalCalculated = subtotal;
  } else {
    // EXCLUSIVE
    taxAmount = Math.round(subtotal * (taxRate / 100));
    totalAmount = subtotal + taxAmount;
    subtotalCalculated = subtotal;
  }

  const profit = totalAmount - totalCost;
  const margin = totalAmount > 0 ? ((profit / totalAmount) * 100).toFixed(1) : '0.0';

  document.getElementById('q_subtotal_display').textContent = formatCurrency(subtotalCalculated);
  document.getElementById('q_tax_amount_display').textContent = formatCurrency(taxAmount);
  document.getElementById('q_total_amount_display').textContent = formatCurrency(totalAmount);
  document.getElementById('q_cost_display').textContent = formatCurrency(totalCost);
  document.getElementById('q_profit_display').textContent = `${formatCurrency(profit)} (${margin}%)`;
}

function openCreateQuotationModal() {
  const form = document.getElementById('quotationForm');
  if (form) form.reset();
  document.getElementById('q_id').value = '';
  
  // 生成當日單號 QT-YYYYMMDD-XX
  const today = new Date().toISOString().split('T')[0];
  const dateStr = today.replace(/-/g, '');
  const randNum = String(Math.floor(Math.random() * 90 + 10));
  document.getElementById('q_number').value = `QT-${dateStr}-${randNum}`;
  document.getElementById('q_issue_date').value = today;

  // 有效期限預設 30 天後
  const expDate = new Date();
  expDate.setDate(expDate.getDate() + 30);
  document.getElementById('q_expiry_date').value = expDate.toISOString().split('T')[0];

  populateQuotationCompanySelect();
  populateQuotationCustomerSelect();

  const container = document.getElementById('quotationItemsContainer');
  if (container) container.innerHTML = '';
  addQuotationItemRow(); // 預設一行明細

  document.getElementById('quotationModalTitle').textContent = '➕ 開立新報價單';
  const modal = new bootstrap.Modal(document.getElementById('quotationModal'));
  modal.show();
}

function openEditQuotationModal(id) {
  const q = appState.quotations.find(item => item.id === id);
  if (!q) return;

  document.getElementById('q_id').value = q.id;
  document.getElementById('q_number').value = q.quotationNumber;
  document.getElementById('q_issue_date').value = formatDate(q.issueDate);
  document.getElementById('q_expiry_date').value = formatDate(q.expiryDate);
  document.getElementById('q_status').value = q.status || 'DRAFT';
  document.getElementById('q_customer_id').value = q.customerId || '';
  document.getElementById('q_customer_name').value = q.customerName || '';
  document.getElementById('q_customer_tax_id').value = q.customerTaxId || '';
  document.getElementById('q_customer_contact').value = q.customerContactPerson || '';
  document.getElementById('q_customer_phone').value = q.customerPhone || '';
  document.getElementById('q_customer_email').value = q.customerEmail || '';
  document.getElementById('q_customer_address').value = q.customerAddress || '';
  document.getElementById('q_notes').value = q.notes || '';

  // 稅額模式
  const taxMode = q.taxMode || 'EXCLUSIVE';
  const radio = document.querySelector(`input[name="q_tax_mode"][value="${taxMode}"]`);
  if (radio) radio.checked = true;

  populateQuotationCompanySelect(q.companyId);
  populateQuotationCustomerSelect(q.customerId);

  const container = document.getElementById('quotationItemsContainer');
  if (container) container.innerHTML = '';
  if (Array.isArray(q.items) && q.items.length > 0) {
    q.items.forEach(it => addQuotationItemRow(it));
  } else {
    addQuotationItemRow();
  }

  document.getElementById('quotationModalTitle').textContent = `✏️ 編輯報價單：${q.quotationNumber}`;
  const modal = new bootstrap.Modal(document.getElementById('quotationModal'));
  modal.show();
}

async function handleSaveQuotation(event) {
  event.preventDefault();
  const id = document.getElementById('q_id').value;
  const isEdit = !!id;

  const container = document.getElementById('quotationItemsContainer');
  const rows = container.querySelectorAll('.item-row');
  if (rows.length === 0) {
    showAlert('請至少新增一項報價品項明細', 'warning');
    return;
  }

  const items = [];
  rows.forEach((row, idx) => {
    const prodSelect = row.querySelector('.item-prod-select');
    const prodId = prodSelect && prodSelect.value ? parseInt(prodSelect.value, 10) : null;
    const name = row.querySelector('.item-name-input')?.value.trim() || '未命名品項';
    const desc = row.querySelector('.item-desc-input')?.value.trim() || '';
    const qty = parseFloat(row.querySelector('.item-qty-input')?.value) || 1;
    const price = parseFloat(row.querySelector('.item-price-input')?.value) || 0;
    const cost = parseFloat(row.querySelector('.item-cost-input')?.value) || 0;

    items.push({
      productId: prodId,
      itemName: name,
      description: desc,
      quantity: qty,
      unitPrice: price,
      costPrice: cost,
      sortOrder: idx
    });
  });

  const taxMode = document.querySelector('input[name="q_tax_mode"]:checked')?.value || 'EXCLUSIVE';

  const payload = {
    quotationNumber: document.getElementById('q_number').value.trim(),
    companyId: parseInt(document.getElementById('q_company_id').value, 10),
    companyName: document.getElementById('q_company_name').value,
    companyContactPerson: document.getElementById('q_company_contact_person').value,
    companyContactPhone: document.getElementById('q_company_contact_phone').value,
    companyContactEmail: document.getElementById('q_company_contact_email').value,
    customerId: parseInt(document.getElementById('q_customer_id').value, 10) || null,
    customerName: document.getElementById('q_customer_name').value.trim(),
    customerTaxId: document.getElementById('q_customer_tax_id').value.trim(),
    customerContactPerson: document.getElementById('q_customer_contact').value.trim(),
    customerPhone: document.getElementById('q_customer_phone').value.trim(),
    customerEmail: document.getElementById('q_customer_email').value.trim(),
    customerAddress: document.getElementById('q_customer_address').value.trim(),
    issueDate: document.getElementById('q_issue_date').value,
    expiryDate: document.getElementById('q_expiry_date').value || null,
    status: document.getElementById('q_status').value,
    taxMode,
    notes: document.getElementById('q_notes').value.trim(),
    items,
    createdBy: appState.currentUser.name,
    updatedBy: appState.currentUser.name
  };

  const endpoint = isEdit ? `/api/quotations/${id}` : '/api/quotations';
  const method = isEdit ? 'PUT' : 'POST';

  const res = await fetchApi(endpoint, { method, body: JSON.stringify(payload) });
  if (res.success) {
    showAlert(isEdit ? '報價單更新成功！' : '報價單建立成功！', 'success');
    const modalEl = document.getElementById('quotationModal');
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();
    await loadQuotations();
  } else {
    showAlert(res.message || '儲存失敗', 'danger');
  }
}

// 核心功能：一鍵將報價單轉為交易單 (Convert to Transaction)
async function convertToTransaction(quotationId) {
  const q = appState.quotations.find(item => item.id === quotationId);
  const qNum = q ? q.quotationNumber : `ID #${quotationId}`;

  const res = await fetchApi(`/api/transactions/from-quotation/${quotationId}`, {
    method: 'POST',
    body: JSON.stringify({ operator: appState.currentUser.name })
  });

  if (res.success) {
    showAlert(res.message || `已成功將報價單 ${qNum} 轉為立案交易！`, 'success');
    // 重新載入報價單與交易清單並導向交易管理頁面
    await loadQuotations();
    await loadTransactions();
    switchView('transactions');
  } else {
    showAlert(res.message || '轉交易失敗', 'danger');
  }
}

function handleConvertQuotationFromView() {
  const modalEl = document.getElementById('viewQuotationModal');
  const quotationId = modalEl.getAttribute('data-active-quotation-id');
  if (quotationId) {
    const bsModal = bootstrap.Modal.getInstance(modalEl);
    if (bsModal) bsModal.hide();
    convertToTransaction(parseInt(quotationId, 10));
  }
}

// 檢視正式報價單 (View Formal Printable Quotation)
function openViewQuotationModal(id) {
  const q = appState.quotations.find(item => item.id === id);
  if (!q) return;

  const modalEl = document.getElementById('viewQuotationModal');
  modalEl.setAttribute('data-active-quotation-id', q.id);

  // 尋找所屬公司資料 (含 LOGO)
  const comp = appState.allCompanies.find(c => c.id === q.companyId) || appState.allCompanies[0] || {};
  const content = document.getElementById('printableQuotationContent');

  let itemsHtml = '';
  (q.items || []).forEach((it, idx) => {
    const qty = it.quantity || 1;
    const price = it.unitPrice || 0;
    const lineTotal = it.lineTotal !== undefined ? it.lineTotal : (qty * price);
    itemsHtml += `
      <tr>
        <td class="text-center">${idx + 1}</td>
        <td>
          <div class="fw-bold text-dark">${it.itemName}</div>
          <div class="small text-muted">${it.description || ''}</div>
        </td>
        <td class="text-center">${qty}</td>
        <td class="text-end">${formatCurrency(price)}</td>
        <td class="text-end fw-bold">${formatCurrency(lineTotal)}</td>
      </tr>
    `;
  });

  const logoHtml = comp.logoUrl ? `<img src="${comp.logoUrl}" alt="${comp.companyName}" style="max-height: 55px; max-width: 220px; object-fit: contain;" />` : '';

  content.innerHTML = `
    <div class="p-3">
      <!-- 報價單表頭：LOGO 與公司資訊 -->
      <div class="row align-items-center pb-3 mb-4 border-bottom border-2 border-dark">
        <div class="col-8">
          ${logoHtml ? `<div class="mb-2">${logoHtml}</div>` : ''}
          <h3 class="fw-bold text-dark mb-1">${comp.companyName || q.companyName || '極簡資訊科技股份有限公司'}</h3>
          <div class="small text-muted">統一編號：${comp.taxId || '28491023'} ｜ 地址：${comp.address || '台北市'}</div>
          <div class="small text-muted">電話：${comp.phone || '-'} ｜ 官方網站：${comp.website || '-'}</div>
          <div class="small text-primary fw-semibold mt-1">
            報價窗口：${q.companyContactPerson || comp.contactPerson || '業務部'} (📞 ${q.companyContactPhone || comp.contactPhone || comp.phone || '-'} ✉️ ${q.companyContactEmail || comp.contactEmail || comp.email || '-'})
          </div>
        </div>
        <div class="col-4 text-end">
          <div class="display-6 fw-bold text-primary tracking-tight">報價單</div>
          <div class="font-monospace fw-bold fs-6 text-dark mt-1">${q.quotationNumber}</div>
          <div class="small text-muted">開立日期：${formatDate(q.issueDate)}</div>
          <div class="small text-muted">有效期限：${formatDate(q.expiryDate) || '30 天'}</div>
        </div>
      </div>

      <!-- 客戶資料區塊 -->
      <div class="p-3 mb-4 rounded bg-light border">
        <div class="row g-2">
          <div class="col-6">
            <div class="fw-bold text-dark fs-6">客戶抬頭：${q.customerName}</div>
            <div class="small text-muted">統一編號：${q.customerTaxId || '無'}</div>
            <div class="small text-muted">客戶地址：${q.customerAddress || '無'}</div>
          </div>
          <div class="col-6 text-end">
            <div class="small text-dark">聯絡人：${q.customerContactPerson || '-'}</div>
            <div class="small text-muted">電話：${q.customerPhone || '-'}</div>
            <div class="small text-muted">Email：${q.customerEmail || '-'}</div>
          </div>
        </div>
      </div>

      <!-- 品項表格 -->
      <div class="table-responsive mb-4">
        <table class="table table-bordered align-middle">
          <thead class="bg-light text-center">
            <tr>
              <th style="width: 50px;">項次</th>
              <th>產品項目與規格描述</th>
              <th style="width: 80px;">數量</th>
              <th style="width: 140px;" class="text-end">單價</th>
              <th style="width: 140px;" class="text-end">金額 (NT$)</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>
      </div>

      <!-- 總額計算區塊 -->
      <div class="row justify-content-end mb-4">
        <div class="col-6 col-md-5">
          <div class="p-3 bg-light rounded border">
            <div class="d-flex justify-content-between mb-1">
              <span class="text-muted">未稅小計：</span>
              <span class="fw-semibold">${formatCurrency(q.subtotal)}</span>
            </div>
            <div class="d-flex justify-content-between mb-2">
              <span class="text-muted">營業稅額 (5%)：</span>
              <span class="fw-semibold">${formatCurrency(q.taxAmount)}</span>
            </div>
            <div class="d-flex justify-content-between pt-2 border-top">
              <span class="fw-bold text-dark fs-5">報價總計 (含稅)：</span>
              <span class="fw-bold text-primary fs-5">${formatCurrency(q.totalAmount)}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 條款與匯款帳戶 -->
      <div class="row g-3 small border-top pt-3">
        <div class="col-7">
          <div class="fw-bold text-dark mb-1">📋 條款與備註事項：</div>
          <div class="text-secondary" style="white-space: pre-line;">${q.notes || comp.defaultTerms || '1. 本報價單有效期限為 30 天。\n2. 付款條件為月結 30 天。'}</div>
        </div>
        <div class="col-5">
          <div class="fw-bold text-dark mb-1">🏦 匯款帳戶：</div>
          <div class="text-secondary">銀行：${comp.bankName || '台灣銀行 信義分行'}</div>
          <div class="text-secondary">帳號：${comp.bankAccount || '012-345-678901'}</div>
          <div class="text-secondary">戶名：${comp.bankAccountName || comp.companyName || '極簡資訊科技股份有限公司'}</div>
        </div>
      </div>
    </div>
  `;

  const modal = new bootstrap.Modal(modalEl);
  modal.show();
}

function confirmDeleteQuotation(id, number) {
  openDeleteConfirmModal(`確定要刪除報價單「${number}」嗎？`, async () => {
    const res = await fetchApi(`/api/quotations/${id}?operator=${encodeURIComponent(appState.currentUser.name)}`, { method: 'DELETE' });
    if (res.success) {
      showAlert(`報價單「${number}」已成功刪除`, 'success');
      await loadQuotations();
    } else {
      showAlert(res.message || '刪除失敗', 'danger');
    }
  });
}


// ============================================================
// 7. 交易管理模組 (Transactions View)
// 包含成本、毛利、毛利率、已付、待付金額、多筆發票明細管理與修改人記錄
// ============================================================

async function loadTransactions() {
  const res = await fetchApi('/api/transactions');
  if (res.success && Array.isArray(res.data)) {
    appState.transactions = res.data;
    renderTransactionsTable(appState.transactions);
  }
}

function renderTransactionsTable(transactions) {
  const tbody = document.getElementById('transactionsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (transactions.length === 0) {
    tbody.innerHTML = '<tr><td colspan="12" class="text-center py-4 text-muted">尚無交易立案紀錄</td></tr>';
    return;
  }

  transactions.forEach(t => {
    const tr = document.createElement('tr');
    const cost = parseFloat(t.costPrice) || 0;
    const total = parseFloat(t.totalAmount) || 0;
    const paid = parseFloat(t.paidAmount) || 0;
    const remaining = t.remainingAmount !== undefined ? t.remainingAmount : Math.max(0, total - paid);
    const profit = t.grossProfit !== undefined ? t.grossProfit : (total - cost);
    const margin = t.grossMargin !== undefined ? t.grossMargin : (total > 0 ? ((profit / total) * 100).toFixed(1) : 0);

    const paymentBadges = {
      PAID: '<span class="badge bg-success-subtle text-success border border-success-subtle">全額已付</span>',
      PARTIAL: '<span class="badge bg-warning-subtle text-warning border border-warning-subtle">部分付款</span>',
      PENDING: '<span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle">待付款</span>',
      REFUNDED: '<span class="badge bg-danger-subtle text-danger border border-danger-subtle">已退款</span>'
    };

    // 發票統計徽章
    const invoiceCount = Array.isArray(t.invoices) ? t.invoices.length : 0;
    const invoiceBadge = invoiceCount > 0 ? 
      `<span class="badge bg-primary-subtle text-primary">${invoiceCount} 張發票</span>` : 
      `<span class="text-muted small">尚未開立</span>`;

    tr.innerHTML = `
      <td><span class="quotation-code">${t.transactionNumber}</span></td>
      <td><span class="small font-monospace">${t.quotationNumber || '手動建立'}</span></td>
      <td>
        <div class="fw-bold text-dark">${t.customerName}</div>
        <div class="small text-muted">${t.customerEmail || ''}</div>
      </td>
      <td><span class="small">${formatDate(t.transactionDate)}</span></td>
      <td><span class="fw-bold text-primary">${formatCurrency(total)}</span></td>
      <td><span class="text-danger fw-semibold">${formatCurrency(cost)}</span></td>
      <td>
        <span class="text-success fw-bold">${formatCurrency(profit)}</span>
        <div class="small text-muted">(${margin}%)</div>
      </td>
      <td>
        <div class="small fw-bold text-primary">已收: ${formatCurrency(paid)}</div>
        <div class="small fw-semibold ${remaining > 0 ? 'text-danger' : 'text-muted'}">待收: ${formatCurrency(remaining)}</div>
      </td>
      <td>${invoiceBadge}</td>
      <td>${paymentBadges[t.paymentStatus] || t.paymentStatus}</td>
      <td>
        <div class="small fw-semibold text-dark">${t.updatedBy || t.createdBy || '系統管理者'}</div>
        <div class="small text-muted">${formatDateTime(t.updatedAt || t.createdAt)}</div>
      </td>
      <td class="text-end">
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-primary" onclick="openEditTransactionModal(${t.id})" title="管理交易與發票">✏️ 編輯發票</button>
          <button class="btn btn-outline-danger" onclick="confirmDeleteTransaction(${t.id}, '${t.transactionNumber}')" title="刪除交易">🗑️</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function handleTransactionSearch() {
  const keyword = (document.getElementById('transactionSearchInput')?.value || '').toLowerCase().trim();
  const payment = document.getElementById('transactionPaymentFilter')?.value || '';

  const filtered = appState.transactions.filter(t => {
    if (payment && t.paymentStatus !== payment) return false;
    return (
      (t.transactionNumber || '').toLowerCase().includes(keyword) ||
      (t.customerName || '').toLowerCase().includes(keyword) ||
      (t.quotationNumber || '').toLowerCase().includes(keyword) ||
      (t.notes || '').toLowerCase().includes(keyword)
    );
  });
  renderTransactionsTable(filtered);
}

// 動態增加發票明細列
function addInvoiceRow(inv = null) {
  const tbody = document.getElementById('txInvoicesTableBody');
  if (!tbody) return;

  const rowId = 'inv_row_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
  const tr = document.createElement('tr');
  tr.id = rowId;

  const invNum = inv ? (inv.invoiceNumber || '') : '';
  const invDate = inv ? formatDate(inv.invoiceDate) : new Date().toISOString().split('T')[0];
  const amount = inv ? (inv.amount || 0) : 0;
  const status = inv ? (inv.status || 'PAID') : 'PAID';
  const notes = inv ? (inv.notes || '') : '';

  tr.innerHTML = `
    <td>
      <input type="text" class="form-control form-control-sm font-monospace inv-num-input" required placeholder="如 AA-12345678" value="${invNum}" />
    </td>
    <td>
      <input type="date" class="form-control form-control-sm inv-date-input" required value="${invDate}" />
    </td>
    <td>
      <input type="number" class="form-control form-control-sm text-end inv-amount-input fw-semibold" min="0" step="1" required value="${amount}" />
    </td>
    <td>
      <select class="form-select form-select-sm inv-status-select">
        <option value="PAID" ${status === 'PAID' ? 'selected' : ''}>已付 (PAID)</option>
        <option value="PENDING" ${status === 'PENDING' ? 'selected' : ''}>待付 (PENDING)</option>
        <option value="CANCELLED" ${status === 'CANCELLED' ? 'selected' : ''}>取消 (CANCELLED)</option>
      </select>
    </td>
    <td>
      <input type="text" class="form-control form-control-sm inv-notes-input" placeholder="備註款項期數或說明" value="${notes}" />
    </td>
    <td class="text-center">
      <button type="button" class="btn btn-outline-danger btn-sm p-1" onclick="removeInvoiceRow('${rowId}')" title="刪除發票">✕</button>
    </td>
  `;

  tbody.appendChild(tr);
}

function removeInvoiceRow(rowId) {
  const row = document.getElementById(rowId);
  if (row) row.remove();
}

// 依已付發票一鍵加總已付款金額
function syncPaidFromInvoices() {
  const tbody = document.getElementById('txInvoicesTableBody');
  if (!tbody) return;

  let totalPaidInvoices = 0;
  const rows = tbody.querySelectorAll('tr');
  rows.forEach(r => {
    const st = r.querySelector('.inv-status-select')?.value;
    const amt = parseFloat(r.querySelector('.inv-amount-input')?.value) || 0;
    if (st === 'PAID') {
      totalPaidInvoices += amt;
    }
  });

  const paidInput = document.getElementById('tx_paid_amount');
  if (paidInput) {
    paidInput.value = totalPaidInvoices;
    calculateTransactionFinancials();
    showAlert(`已依「已付」發票自動計算已付款金額：${formatCurrency(totalPaidInvoices)}`, 'info');
  }
}

// 即時計算交易財務欄位 (毛利、毛利率、剩餘待付款)
function calculateTransactionFinancials() {
  const total = parseFloat(document.getElementById('tx_total_amount')?.value) || 0;
  const cost = parseFloat(document.getElementById('tx_cost_price')?.value) || 0;
  const paid = parseFloat(document.getElementById('tx_paid_amount')?.value) || 0;

  const profit = total - cost;
  const margin = total > 0 ? ((profit / total) * 100).toFixed(1) : '0.0';
  const remaining = Math.max(0, total - paid);

  const profitDisplay = document.getElementById('tx_gross_profit_display');
  const marginDisplay = document.getElementById('tx_gross_margin_display');
  const remainingInput = document.getElementById('tx_remaining_amount');

  if (profitDisplay) profitDisplay.textContent = formatCurrency(profit);
  if (marginDisplay) marginDisplay.textContent = `${margin}%`;
  if (remainingInput) remainingInput.value = remaining;

  // 自動輔助判定付款狀態
  const paymentStatusSelect = document.getElementById('tx_payment_status');
  if (paymentStatusSelect) {
    if (paid >= total && total > 0) {
      paymentStatusSelect.value = 'PAID';
    } else if (paid > 0 && paid < total) {
      paymentStatusSelect.value = 'PARTIAL';
    }
  }
}

function openCreateTransactionModal() {
  const form = document.getElementById('transactionForm');
  if (form) form.reset();
  document.getElementById('tx_id').value = '';
  document.getElementById('tx_quotation_id').value = '';

  const today = new Date().toISOString().split('T')[0];
  const dateStr = today.replace(/-/g, '');
  const randNum = String(Math.floor(Math.random() * 90 + 10));
  document.getElementById('tx_number').value = `TX-${dateStr}-${randNum}`;
  document.getElementById('tx_date').value = today;

  const tbody = document.getElementById('txInvoicesTableBody');
  if (tbody) tbody.innerHTML = '';
  addInvoiceRow(); // 預設新增一行發票

  calculateTransactionFinancials();

  document.getElementById('transactionModalTitle').textContent = '➕ 新增交易與發票紀錄';
  const modal = new bootstrap.Modal(document.getElementById('transactionModal'));
  modal.show();
}

function openEditTransactionModal(id) {
  const t = appState.transactions.find(item => item.id === id);
  if (!t) return;

  document.getElementById('tx_id').value = t.id;
  document.getElementById('tx_quotation_id').value = t.quotationId || '';
  document.getElementById('tx_number').value = t.transactionNumber;
  document.getElementById('tx_quotation_number').value = t.quotationNumber || '';
  document.getElementById('tx_customer_name').value = t.customerName || '';
  document.getElementById('tx_date').value = formatDate(t.transactionDate);
  document.getElementById('tx_total_amount').value = t.totalAmount || 0;
  document.getElementById('tx_cost_price').value = t.costPrice || 0;
  document.getElementById('tx_paid_amount').value = t.paidAmount || 0;
  document.getElementById('tx_payment_method').value = t.paymentMethod || '電匯 (Wire Transfer)';
  document.getElementById('tx_payment_status').value = t.paymentStatus || 'PENDING';
  document.getElementById('tx_fulfillment_status').value = t.fulfillmentStatus || 'PROCESSING';
  document.getElementById('tx_notes').value = t.notes || '';

  const tbody = document.getElementById('txInvoicesTableBody');
  if (tbody) tbody.innerHTML = '';
  if (Array.isArray(t.invoices) && t.invoices.length > 0) {
    t.invoices.forEach(inv => addInvoiceRow(inv));
  } else {
    addInvoiceRow();
  }

  calculateTransactionFinancials();

  document.getElementById('transactionModalTitle').textContent = `✏️ 編輯交易與發票：${t.transactionNumber}`;
  const modal = new bootstrap.Modal(document.getElementById('transactionModal'));
  modal.show();
}

async function handleSaveTransaction(event) {
  event.preventDefault();
  const id = document.getElementById('tx_id').value;
  const isEdit = !!id;

  // 蒐集發票清單
  const tbody = document.getElementById('txInvoicesTableBody');
  const invoiceRows = tbody ? tbody.querySelectorAll('tr') : [];
  const invoices = [];

  invoiceRows.forEach((r, idx) => {
    const invNum = r.querySelector('.inv-num-input')?.value.trim();
    const invDate = r.querySelector('.inv-date-input')?.value;
    const invAmt = parseFloat(r.querySelector('.inv-amount-input')?.value) || 0;
    const invStatus = r.querySelector('.inv-status-select')?.value || 'PAID';
    const invNotes = r.querySelector('.inv-notes-input')?.value.trim() || '';

    if (invNum) {
      invoices.push({
        id: idx + 1,
        invoiceNumber: invNum,
        invoiceDate: invDate,
        amount: invAmt,
        status: invStatus,
        notes: invNotes,
        createdBy: appState.currentUser.name,
        updatedBy: appState.currentUser.name
      });
    }
  });

  const payload = {
    transactionNumber: document.getElementById('tx_number').value.trim(),
    quotationId: parseInt(document.getElementById('tx_quotation_id').value, 10) || null,
    quotationNumber: document.getElementById('tx_quotation_number').value.trim(),
    customerName: document.getElementById('tx_customer_name').value.trim(),
    transactionDate: document.getElementById('tx_date').value,
    totalAmount: parseFloat(document.getElementById('tx_total_amount').value) || 0,
    costPrice: parseFloat(document.getElementById('tx_cost_price').value) || 0,
    paidAmount: parseFloat(document.getElementById('tx_paid_amount').value) || 0,
    paymentMethod: document.getElementById('tx_payment_method').value,
    paymentStatus: document.getElementById('tx_payment_status').value,
    fulfillmentStatus: document.getElementById('tx_fulfillment_status').value,
    notes: document.getElementById('tx_notes').value.trim(),
    invoices,
    createdBy: appState.currentUser.name,
    updatedBy: appState.currentUser.name
  };

  const endpoint = isEdit ? `/api/transactions/${id}` : '/api/transactions';
  const method = isEdit ? 'PUT' : 'POST';

  const res = await fetchApi(endpoint, { method, body: JSON.stringify(payload) });
  if (res.success) {
    showAlert(isEdit ? '交易與發票明細更新成功！' : '交易單建立成功！', 'success');
    const modalEl = document.getElementById('transactionModal');
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();
    await loadTransactions();
  } else {
    showAlert(res.message || '儲存失敗', 'danger');
  }
}

function confirmDeleteTransaction(id, number) {
  openDeleteConfirmModal(`確定要刪除交易單「${number}」嗎？`, async () => {
    const res = await fetchApi(`/api/transactions/${id}?operator=${encodeURIComponent(appState.currentUser.name)}`, { method: 'DELETE' });
    if (res.success) {
      showAlert(`交易單「${number}」已成功刪除`, 'success');
      await loadTransactions();
    } else {
      showAlert(res.message || '刪除失敗', 'danger');
    }
  });
}


// ============================================================
// 8. 基本資料管理模組 (Company Settings View)
// 支援多家公司、上傳企業 LOGO、預設報價聯絡窗口與即時預覽
// ============================================================

async function loadCompanySettings() {
  const res = await fetchApi('/api/companies');
  if (res.success && Array.isArray(res.data) && res.data.length > 0) {
    appState.allCompanies = res.data;
    if (!appState.currentCompany) {
      appState.currentCompany = appState.allCompanies.find(c => c.isDefault) || appState.allCompanies[0];
    } else {
      // 保持同步
      const found = appState.allCompanies.find(c => c.id === appState.currentCompany.id);
      appState.currentCompany = found || appState.allCompanies[0];
    }
    renderCompanyTabs();
    populateCompanyForm(appState.currentCompany);
  }
}

// 渲染多公司切換標籤
function renderCompanyTabs() {
  const tabsContainer = document.getElementById('companyNavTabs');
  if (!tabsContainer) return;
  tabsContainer.innerHTML = '';

  appState.allCompanies.forEach(c => {
    const isSelected = appState.currentCompany && appState.currentCompany.id === c.id;
    const li = document.createElement('li');
    li.className = 'nav-item';
    li.innerHTML = `
      <button class="nav-link ${isSelected ? 'active fw-bold' : ''}" type="button" onclick="switchCompanyTab(${c.id})">
        🏢 ${c.companyName} ${c.isDefault ? '<span class="badge bg-light text-primary ms-1">預設</span>' : ''}
      </button>
    `;
    tabsContainer.appendChild(li);
  });
}

function switchCompanyTab(companyId) {
  const comp = appState.allCompanies.find(c => c.id === companyId);
  if (!comp) return;
  appState.currentCompany = comp;
  renderCompanyTabs();
  populateCompanyForm(comp);
}

function populateCompanyForm(c) {
  if (!c) return;

  document.getElementById('comp_id').value = c.id;
  document.getElementById('comp_name').value = c.companyName || '';
  document.getElementById('comp_tax_id').value = c.taxId || '';
  document.getElementById('comp_phone').value = c.phone || '';
  document.getElementById('comp_fax').value = c.fax || '';
  document.getElementById('comp_email').value = c.email || '';
  document.getElementById('comp_website').value = c.website || '';
  document.getElementById('comp_address').value = c.address || '';
  document.getElementById('comp_contact_person').value = c.contactPerson || '';
  document.getElementById('comp_contact_phone').value = c.contactPhone || '';
  document.getElementById('comp_contact_email').value = c.contactEmail || '';
  document.getElementById('comp_bank_name').value = c.bankName || '';
  document.getElementById('comp_bank_account').value = c.bankAccount || '';
  document.getElementById('comp_bank_account_name').value = c.bankAccountName || '';
  document.getElementById('comp_default_terms').value = c.defaultTerms || '';
  document.getElementById('comp_is_default').checked = !!c.isDefault;
  document.getElementById('comp_logo_url').value = c.logoUrl || '';

  // LOGO 預覽
  const logoBox = document.getElementById('companyLogoPreviewBox');
  if (logoBox) {
    if (c.logoUrl) {
      logoBox.innerHTML = `<img src="${c.logoUrl}" alt="${c.companyName}" style="max-height: 100%; max-width: 100%; object-fit: contain;" />`;
    } else {
      logoBox.innerHTML = '<span class="text-muted small">尚未上傳 LOGO</span>';
    }
  }

  updateCompanyLivePreview();
}

// 即時更新報價單抬頭預覽卡片
function updateCompanyLivePreview() {
  const name = document.getElementById('comp_name')?.value || '公司抬頭';
  const taxId = document.getElementById('comp_tax_id')?.value || '00000000';
  const phone = document.getElementById('comp_phone')?.value || '(02) 2345-6789';
  const email = document.getElementById('comp_email')?.value || 'contact@company.com';
  const address = document.getElementById('comp_address')?.value || '公司地址';
  const contact = document.getElementById('comp_contact_person')?.value || '窗口聯絡人';
  const contactPhone = document.getElementById('comp_contact_phone')?.value || '窗口電話';
  const contactEmail = document.getElementById('comp_contact_email')?.value || '窗口 Email';
  const logoUrl = document.getElementById('comp_logo_url')?.value;
  const isDefault = document.getElementById('comp_is_default')?.checked;

  const liveName = document.getElementById('livePreviewName');
  const liveTax = document.getElementById('livePreviewTax');
  const liveAddress = document.getElementById('livePreviewAddress');
  const livePhone = document.getElementById('livePreviewPhone');
  const liveEmail = document.getElementById('livePreviewEmail');
  const liveContact = document.getElementById('livePreviewContact');
  const liveContactEmail = document.getElementById('livePreviewContactEmail');
  const defaultBadge = document.getElementById('livePreviewDefaultBadge');
  const logoContainer = document.getElementById('livePreviewLogoContainer');
  const logoImg = document.getElementById('livePreviewLogoImg');

  if (liveName) liveName.textContent = name;
  if (liveTax) liveTax.textContent = `統編：${taxId}`;
  if (liveAddress) liveAddress.textContent = address;
  if (livePhone) livePhone.textContent = phone;
  if (liveEmail) liveEmail.textContent = email;
  if (liveContact) liveContact.textContent = `${contact} (${contactPhone})`;
  if (liveContactEmail) liveContactEmail.textContent = contactEmail;
  if (defaultBadge) defaultBadge.style.display = isDefault ? 'inline-block' : 'none';

  if (logoContainer && logoImg) {
    if (logoUrl) {
      logoImg.src = logoUrl;
      logoContainer.style.display = 'block';
    } else {
      logoContainer.style.display = 'none';
    }
  }
}

// 公司 LOGO 檔案選擇 -> 轉換 Base64
function handleLogoFileChange(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (file.size > 2 * 1024 * 1024) {
    showAlert('LOGO 圖片大小不得超過 2MB', 'warning');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const base64 = e.target.result;
    document.getElementById('comp_logo_url').value = base64;
    const box = document.getElementById('companyLogoPreviewBox');
    if (box) {
      box.innerHTML = `<img src="${base64}" alt="Preview Logo" style="max-height: 100%; max-width: 100%; object-fit: contain;" />`;
    }
    updateCompanyLivePreview();
  };
  reader.readAsDataURL(file);
}

function removeCompanyLogo() {
  document.getElementById('comp_logo_url').value = '';
  const fileInput = document.getElementById('companyLogoFileInput');
  if (fileInput) fileInput.value = '';
  const box = document.getElementById('companyLogoPreviewBox');
  if (box) box.innerHTML = '<span class="text-muted small">尚未上傳 LOGO</span>';
  updateCompanyLivePreview();
}

function openCreateCompanyModal() {
  // 新增一家主體公司
  const form = document.getElementById('companySettingsForm');
  if (form) form.reset();
  document.getElementById('comp_id').value = '';
  document.getElementById('comp_name').value = '新開立主體公司';
  document.getElementById('comp_is_default').checked = false;
  removeCompanyLogo();
  updateCompanyLivePreview();
  showAlert('請填寫新公司的抬頭、統一編號與聯絡窗口後按「儲存」', 'info');
}

async function handleSaveCompany(event) {
  event.preventDefault();
  const id = document.getElementById('comp_id').value;
  const isEdit = !!id;

  const payload = {
    companyName: document.getElementById('comp_name').value.trim(),
    taxId: document.getElementById('comp_tax_id').value.trim(),
    phone: document.getElementById('comp_phone').value.trim(),
    fax: document.getElementById('comp_fax').value.trim(),
    email: document.getElementById('comp_email').value.trim(),
    website: document.getElementById('comp_website').value.trim(),
    address: document.getElementById('comp_address').value.trim(),
    contactPerson: document.getElementById('comp_contact_person').value.trim(),
    contactPhone: document.getElementById('comp_contact_phone').value.trim(),
    contactEmail: document.getElementById('comp_contact_email').value.trim(),
    logoUrl: document.getElementById('comp_logo_url').value,
    bankName: document.getElementById('comp_bank_name').value.trim(),
    bankAccount: document.getElementById('comp_bank_account').value.trim(),
    bankAccountName: document.getElementById('comp_bank_account_name').value.trim(),
    defaultTerms: document.getElementById('comp_default_terms').value.trim(),
    isDefault: document.getElementById('comp_is_default').checked,
    updatedBy: appState.currentUser.name
  };

  const endpoint = isEdit ? `/api/companies/${id}` : '/api/companies';
  const method = isEdit ? 'PUT' : 'POST';

  const res = await fetchApi(endpoint, { method, body: JSON.stringify(payload) });
  if (res.success) {
    showAlert('公司基本資料已成功儲存！', 'success');
    await loadInitialCompanies();
    await loadCompanySettings();
  } else {
    showAlert(res.message || '儲存失敗', 'danger');
  }
}

function handleDeleteCurrentCompany() {
  if (appState.allCompanies.length <= 1) {
    showAlert('系統必須保留至少一家開立主體公司', 'warning');
    return;
  }
  const comp = appState.currentCompany;
  if (!comp) return;

  openDeleteConfirmModal(`確定要刪除主體公司「${comp.companyName}」嗎？`, async () => {
    const res = await fetchApi(`/api/companies/${comp.id}?operator=${encodeURIComponent(appState.currentUser.name)}`, { method: 'DELETE' });
    if (res.success) {
      showAlert(`公司「${comp.companyName}」已成功刪除`, 'success');
      appState.currentCompany = null;
      await loadInitialCompanies();
      await loadCompanySettings();
    } else {
      showAlert(res.message || '刪除失敗', 'danger');
    }
  });
}


// ============================================================
// 9. 使用者與權限管理模組 (Users View)
// ============================================================

async function loadUsers() {
  const res = await fetchApi('/api/users');
  if (res.success && Array.isArray(res.data)) {
    appState.allUsers = res.data;
    renderUsersTable(appState.allUsers);
  }
}

function renderUsersTable(users) {
  const tbody = document.getElementById('usersTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (users.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-muted">尚無使用者資料</td></tr>';
    return;
  }

  const menuLabels = {
    dashboard: '儀表板',
    customers: '客戶',
    vendors: '廠商',
    products: '產品',
    quotations: '報價單',
    transactions: '交易',
    company: '基本資料',
    users: '權限',
    audit_logs: '修改歷程'
  };

  users.forEach(u => {
    const tr = document.createElement('tr');
    const roleBadge = u.role === 'ADMIN' ? 
      '<span class="badge bg-danger-subtle text-danger border border-danger-subtle">系統管理者 (ADMIN)</span>' : 
      '<span class="badge bg-primary-subtle text-primary border border-primary-subtle">一般使用者 (USER)</span>';

    const allowed = Array.isArray(u.allowedMenus) ? u.allowedMenus : (typeof u.allowedMenus === 'string' ? u.allowedMenus.split(',') : []);
    const menusChips = u.role === 'ADMIN' ? 
      '<span class="badge bg-dark text-white">✨ 全部 9 項功能完全存取</span>' :
      allowed.map(m => `<span class="badge bg-light text-secondary border me-1 mb-1">${menuLabels[m] || m}</span>`).join('');

    tr.innerHTML = `
      <td>
        <div class="d-flex align-items-center gap-2">
          <div class="rounded-circle d-flex align-items-center justify-content-center bg-primary text-white fw-bold" style="width: 32px; height: 32px; font-size: 0.8rem;">
            ${(u.name || u.username).substring(0, 1)}
          </div>
          <div>
            <div class="fw-bold text-dark">${u.name}</div>
            <div class="small text-muted">${u.phone || ''}</div>
          </div>
        </div>
      </td>
      <td><span class="font-monospace fw-semibold">${u.username}</span></td>
      <td><span class="text-secondary">${u.department || '-'}</span></td>
      <td>${roleBadge}</td>
      <td><div class="d-flex flex-wrap" style="max-width: 280px;">${menusChips}</div></td>
      <td>
        ${u.status === 'ACTIVE' ? '<span class="badge bg-success-subtle text-success">正常</span>' : '<span class="badge bg-secondary-subtle text-secondary">停用</span>'}
      </td>
      <td>
        <div class="small fw-semibold text-dark">${u.updatedBy || u.createdBy || '系統管理者'}</div>
        <div class="small text-muted">${formatDateTime(u.updatedAt || u.createdAt)}</div>
      </td>
      <td class="text-end">
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-primary" onclick="openEditUserModal(${u.id})" title="編輯權限">✏️ 編輯</button>
          ${u.id !== 1 ? `<button class="btn btn-outline-danger" onclick="confirmDeleteUser(${u.id}, '${u.name}')" title="刪除使用者">🗑️</button>` : ''}
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function handleUserRoleChange(role) {
  const checkboxes = document.querySelectorAll('.menu-perm-cb');
  if (role === 'ADMIN') {
    checkboxes.forEach(cb => { cb.checked = true; cb.disabled = true; });
  } else {
    checkboxes.forEach(cb => { cb.disabled = false; });
  }
}

function openCreateUserModal() {
  const form = document.getElementById('userForm');
  if (form) form.reset();
  document.getElementById('u_id').value = '';
  document.getElementById('u_username').readOnly = false;
  handleUserRoleChange('USER');

  // 預設勾選常用業務選單
  ['dashboard', 'customers', 'vendors', 'products', 'quotations', 'transactions'].forEach(key => {
    const cb = document.getElementById(`chk_m_${key}`);
    if (cb) cb.checked = true;
  });

  document.getElementById('userModalTitle').textContent = '➕ 新增使用者與指派權限';
  const modal = new bootstrap.Modal(document.getElementById('userModal'));
  modal.show();
}

function openEditUserModal(id) {
  const u = appState.allUsers.find(item => item.id === id);
  if (!u) return;

  document.getElementById('u_id').value = u.id;
  document.getElementById('u_name').value = u.name || '';
  document.getElementById('u_username').value = u.username || '';
  document.getElementById('u_username').readOnly = (u.id === 1);
  document.getElementById('u_password').value = '';
  document.getElementById('u_department').value = u.department || '';
  document.getElementById('u_phone').value = u.phone || '';
  document.getElementById('u_email').value = u.email || '';
  document.getElementById('u_role').value = u.role || 'USER';
  document.getElementById('u_status').value = u.status || 'ACTIVE';

  const allowed = Array.isArray(u.allowedMenus) ? u.allowedMenus : (typeof u.allowedMenus === 'string' ? u.allowedMenus.split(',') : []);
  document.querySelectorAll('.menu-perm-cb').forEach(cb => {
    cb.checked = allowed.includes(cb.value);
  });

  handleUserRoleChange(u.role);

  document.getElementById('userModalTitle').textContent = `✏️ 編輯使用者：${u.name}`;
  const modal = new bootstrap.Modal(document.getElementById('userModal'));
  modal.show();
}

async function handleSaveUser(event) {
  event.preventDefault();
  const id = document.getElementById('u_id').value;
  const isEdit = !!id;
  const role = document.getElementById('u_role').value;

  const allowedMenus = [];
  if (role === 'ADMIN') {
    allowedMenus.push('dashboard', 'customers', 'vendors', 'products', 'quotations', 'transactions', 'company', 'users', 'audit_logs');
  } else {
    document.querySelectorAll('.menu-perm-cb:checked').forEach(cb => {
      allowedMenus.push(cb.value);
    });
  }

  const payload = {
    name: document.getElementById('u_name').value.trim(),
    username: document.getElementById('u_username').value.trim(),
    password: document.getElementById('u_password').value.trim(),
    department: document.getElementById('u_department').value.trim(),
    phone: document.getElementById('u_phone').value.trim(),
    email: document.getElementById('u_email').value.trim(),
    role,
    status: document.getElementById('u_status').value,
    allowedMenus,
    createdBy: appState.currentUser.name,
    updatedBy: appState.currentUser.name
  };

  const endpoint = isEdit ? `/api/users/${id}` : '/api/users';
  const method = isEdit ? 'PUT' : 'POST';

  const res = await fetchApi(endpoint, { method, body: JSON.stringify(payload) });
  if (res.success) {
    showAlert(isEdit ? '使用者權限已更新！' : '使用者建立成功！', 'success');
    const modalEl = document.getElementById('userModal');
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();
    await loadInitialUsers();
    await loadUsers();
    applySidebarMenuPermissions();
  } else {
    showAlert(res.message || '儲存失敗', 'danger');
  }
}

function confirmDeleteUser(id, name) {
  openDeleteConfirmModal(`確定要刪除使用者帳號「${name}」嗎？`, async () => {
    const res = await fetchApi(`/api/users/${id}?operator=${encodeURIComponent(appState.currentUser.name)}`, { method: 'DELETE' });
    if (res.success) {
      showAlert(`使用者「${name}」已成功刪除`, 'success');
      await loadInitialUsers();
      await loadUsers();
    } else {
      showAlert(res.message || '刪除失敗', 'danger');
    }
  });
}


// ============================================================
// 10. 修改歷程模組 (Audit Logs View) - NEW MODULE
// 記錄每個功能最後使用的人、時間、動作、目標單號與變更說明
// ============================================================

async function loadAuditLogs() {
  const res = await fetchApi('/api/audit-logs');
  if (res.success && Array.isArray(res.data)) {
    appState.auditLogs = res.data;
    renderAuditLogsTable(appState.auditLogs);
  }
}

function renderAuditLogsTable(logs) {
  const tbody = document.getElementById('auditLogsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (logs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">尚無修改歷程記錄</td></tr>';
    return;
  }

  const actionBadges = {
    CREATE: '<span class="badge bg-success-subtle text-success border border-success-subtle">新增</span>',
    UPDATE: '<span class="badge bg-primary-subtle text-primary border border-primary-subtle">修改</span>',
    DELETE: '<span class="badge bg-danger-subtle text-danger border border-danger-subtle">刪除</span>',
    CONVERT: '<span class="badge bg-info-subtle text-info border border-info-subtle">轉交易</span>',
    INVOICE: '<span class="badge bg-warning-subtle text-warning border border-warning-subtle">開立發票</span>'
  };

  logs.forEach(log => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="font-monospace text-muted">#${log.id}</span></td>
      <td><span class="small text-dark font-monospace">${formatDateTime(log.timestamp)}</span></td>
      <td><span class="badge bg-light text-dark border">${log.moduleName || log.module}</span></td>
      <td>${actionBadges[log.action] || `<span class="badge bg-secondary">${log.actionName || log.action}</span>`}</td>
      <td>
        <div class="fw-bold text-dark font-monospace">${log.targetKey || '-'}</div>
        <div class="small text-muted">${log.targetName || ''}</div>
      </td>
      <td>
        <div class="fw-semibold text-primary">${log.operator || '系統管理者'}</div>
      </td>
      <td><span class="text-secondary small">${log.details || '-'}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

function handleAuditSearch() {
  const keyword = (document.getElementById('auditSearchInput')?.value || '').toLowerCase().trim();
  const module = document.getElementById('auditModuleFilter')?.value || '';

  const filtered = appState.auditLogs.filter(log => {
    if (module && log.module !== module) return false;
    return (
      (log.moduleName || '').toLowerCase().includes(keyword) ||
      (log.actionName || '').toLowerCase().includes(keyword) ||
      (log.targetKey || '').toLowerCase().includes(keyword) ||
      (log.targetName || '').toLowerCase().includes(keyword) ||
      (log.operator || '').toLowerCase().includes(keyword) ||
      (log.details || '').toLowerCase().includes(keyword)
    );
  });
  renderAuditLogsTable(filtered);
}


// ============================================================
// 11. 通用刪除確認彈窗 (Delete Confirm Modal Helper)
// ============================================================

function openDeleteConfirmModal(message, executeCallback) {
  const msgEl = document.getElementById('deleteConfirmMessage');
  const detailsEl = document.getElementById('deleteConfirmDetails');
  if (msgEl) msgEl.textContent = message;
  if (detailsEl) detailsEl.textContent = '此動作執行後將寫入修改歷程 (Audit Log) 並無法復原。';

  appState.deleteCallback = executeCallback;
  const execBtn = document.getElementById('deleteConfirmExecuteBtn');
  if (execBtn) {
    execBtn.onclick = async () => {
      const modalEl = document.getElementById('deleteConfirmModal');
      const modal = bootstrap.Modal.getInstance(modalEl);
      if (modal) modal.hide();
      if (typeof appState.deleteCallback === 'function') {
        await appState.deleteCallback();
      }
    };
  }

  const modal = new bootstrap.Modal(document.getElementById('deleteConfirmModal'));
  modal.show();
}
