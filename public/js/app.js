/**
 * ============================================================
 * 報價管理系統 (Quotation Management System) - 核心前端邏輯
 * 採用原生 JavaScript (Vanilla JS ES6+) 與 Bootstrap 5
 * 完整實作 9 大模組：儀表板、客戶、廠商、產品、報價單、交易、多公司/LOGO、使用者權限、修改歷程
 * ============================================================
 */

// 全域預設主體公司（防止離線、載入中或非管理者帳號無權限時選單空白）
const DEFAULT_COMPANY_FALLBACK = {
  id: 1,
  companyName: '宏碁資訊科技有限公司',
  taxId: '28491023',
  phone: '(02) 2789-0123',
  fax: '(02) 2789-0124',
  address: '台北市南港區園區街 3-1 號 8 樓',
  email: 'contact@acer-info.com.tw',
  website: 'https://www.acer-info.com.tw',
  bankName: '台灣銀行 南港分行',
  bankAccount: '012-345-678901',
  bankAccountName: '宏碁資訊科技有限公司',
  contactPerson: '王總監',
  contactPhone: '(02) 2789-0123 #101',
  contactEmail: 'director.wang@acer-info.com.tw',
  isDefault: true,
  defaultTerms: '1. 本報價單有效期限為 30 天。\n2. 付款條件：月結 30 天電匯。\n3. 保固服務：提供一年 8x5 到府維護與技術支援。'
};

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
  allCompanies: [DEFAULT_COMPANY_FALLBACK],
  currentCompany: DEFAULT_COMPANY_FALLBACK,
  customers: [],
  vendors: [],
  products: [],
  quotations: [],
  transactions: [],
  auditLogs: [],
  currentView: 'dashboard',
  deleteCallback: null
};

let isHandlingExpiredSession = false;

// 格式化數字為千分位貨幣字串（使用不換行空格，防範金額換行）
function formatCurrency(amount) {
  const num = parseFloat(amount) || 0;
  return 'NT$\u00A0' + Math.round(num).toLocaleString('zh-TW');
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
  const { timeoutMs = 15000, signal: suppliedSignal, ...fetchOptions } = options;
  const abortController = new AbortController();
  let didTimeout = false;
  const timeoutId = setTimeout(() => {
    didTimeout = true;
    abortController.abort();
  }, timeoutMs);

  if (suppliedSignal) {
    suppliedSignal.addEventListener('abort', () => abortController.abort(), { once: true });
  }

  try {
    const defaultHeaders = { 'Content-Type': 'application/json' };
    const accessToken = localStorage.getItem('qms_access_token') || sessionStorage.getItem('qms_access_token');
    if (accessToken) defaultHeaders.Authorization = `Bearer ${accessToken}`;
    const config = {
      ...fetchOptions,
      signal: abortController.signal,
      headers: { ...defaultHeaders, ...(fetchOptions.headers || {}) }
    };
    const res = await fetch(endpoint, config);
    let result = {};
    try {
      result = await res.json();
    } catch (e) {
      result = { success: false, message: `伺服器回應格式錯誤 (HTTP ${res.status})` };
    }

    if (!res.ok) {
      if (res.status === 401 && endpoint !== '/api/auth/login') {
        handleExpiredSession();
      }
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
    const message = didTimeout
      ? `伺服器回應逾時（${Math.round(timeoutMs / 1000)} 秒），請稍後重試`
      : '網路連線或 API 請求發生錯誤: ' + err.message;
    return { success: false, data: null, message, error: err.message };
  } finally {
    clearTimeout(timeoutId);
  }
}

function handleExpiredSession() {
  // Token 有效期限到期或部署後 AUTH_SECRET 變更時，不能繼續保留半載入的後台畫面。
  if (isHandlingExpiredSession) return;
  isHandlingExpiredSession = true;

  localStorage.removeItem('qms_user');
  localStorage.removeItem('qms_access_token');
  sessionStorage.removeItem('qms_user');
  sessionStorage.removeItem('qms_access_token');
  showLoginScreen();

  const errorAlert = document.getElementById('loginErrorAlert');
  if (errorAlert) {
    errorAlert.textContent = '登入已失效，請重新登入後繼續操作。';
    errorAlert.classList.remove('d-none');
  }
}

function acquireFormSubmitLock(form) {
  if (!form || form.dataset.isSubmitting === 'true') return null;
  const submitButton = form.querySelector('button[type="submit"]');
  form.dataset.isSubmitting = 'true';
  if (submitButton) submitButton.disabled = true;
  return () => {
    form.dataset.isSubmitting = 'false';
    if (submitButton) submitButton.disabled = false;
  };
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
  if (isHandlingExpiredSession) return;
  await loadInitialCompanies();
  if (isHandlingExpiredSession) return;
  await loadInitialVendors();
  if (isHandlingExpiredSession) return;
  await loadInitialCustomers();
  if (isHandlingExpiredSession) return;
  await loadInitialProducts();
  if (isHandlingExpiredSession) return;

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
    isHandlingExpiredSession = false;
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

// 確保公司清單已正確載入（若尚未載入則即時請求，失敗時平穩退回預設主體公司）
async function ensureCompaniesLoaded() {
  if (!appState.allCompanies || appState.allCompanies.length === 0 || (appState.allCompanies.length === 1 && appState.allCompanies[0].id === 1 && !appState.allCompanies[0].updatedAt)) {
    await loadInitialCompanies();
  }
  if (!appState.allCompanies || appState.allCompanies.length === 0) {
    appState.allCompanies = [DEFAULT_COMPANY_FALLBACK];
    appState.currentCompany = DEFAULT_COMPANY_FALLBACK;
  }
}

// 載入公司清單
async function loadInitialCompanies() {
  try {
    const res = await fetchApi('/api/companies');
    if (res && res.success && Array.isArray(res.data) && res.data.length > 0) {
      appState.allCompanies = res.data;
      const defaultComp = appState.allCompanies.find(c => c.isDefault) || appState.allCompanies[0];
      appState.currentCompany = defaultComp;
    } else {
      if (!appState.allCompanies || appState.allCompanies.length === 0) {
        appState.allCompanies = [DEFAULT_COMPANY_FALLBACK];
        appState.currentCompany = DEFAULT_COMPANY_FALLBACK;
      }
    }
  } catch (err) {
    console.warn('載入主體公司資料失敗，維持使用系統預設公司:', err);
    if (!appState.allCompanies || appState.allCompanies.length === 0) {
      appState.allCompanies = [DEFAULT_COMPANY_FALLBACK];
      appState.currentCompany = DEFAULT_COMPANY_FALLBACK;
    }
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
  const deptDisplay = (u.department || '未分配部門') + (u.title ? ` · ${u.title}` : '');
  if (headerDept) headerDept.textContent = deptDisplay;

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

// 獲取當前登入之使用者資訊（含本機儲存與防護機制）
function getCurrentUser() {
  if (appState.currentUser && appState.currentUser.username) {
    return appState.currentUser;
  }
  const saved = localStorage.getItem('qms_user') || sessionStorage.getItem('qms_user');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      appState.currentUser = parsed;
      return parsed;
    } catch {}
  }
  return {
    id: 1,
    name: '系統管理者 (王總監)',
    username: 'admin',
    department: '資訊管理部',
    role: 'ADMIN',
    allowedMenus: ['dashboard', 'customers', 'vendors', 'products', 'quotations', 'transactions', 'company', 'users', 'audit_logs']
  };
}

// 開啟使用者修改自己密碼 Modal
function openChangePasswordModal() {
  const modalEl = document.getElementById('changePasswordModal');
  if (!modalEl) return;

  const user = getCurrentUser();
  const userDisplayEl = document.getElementById('cp_current_user_name');
  if (userDisplayEl) {
    const roleStr = user.role === 'ADMIN' ? '系統管理者' : '一般使用者';
    const deptStr = user.department ? ` · ${user.department}` : '';
    const titleStr = user.title ? ` (${user.title})` : '';
    userDisplayEl.textContent = `${user.name} (${user.username})${deptStr}${titleStr} · ${roleStr}`;
  }
  const oldPwd = document.getElementById('cp_old_password');
  if (oldPwd) oldPwd.value = '';
  const newPwd = document.getElementById('cp_new_password');
  if (newPwd) newPwd.value = '';
  const confirmPwd = document.getElementById('cp_confirm_password');
  if (confirmPwd) confirmPwd.value = '';

  const alertEl = document.getElementById('changePasswordAlert');
  if (alertEl) {
    alertEl.classList.add('d-none');
    alertEl.className = 'alert alert-danger py-2 px-3 small d-none mb-3';
    alertEl.textContent = '';
  }

  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  modal.show();
}

// 處理使用者修改密碼送出
async function handleChangePassword(event) {
  if (event) {
    event.preventDefault();
  }
  const form = document.getElementById('changePasswordForm') || event?.currentTarget || event?.target;

  const alertEl = document.getElementById('changePasswordAlert');
  const showAlertMsg = (msg, isSuccess = false) => {
    if (!alertEl) return;
    alertEl.className = `alert alert-${isSuccess ? 'success' : 'danger'} py-2 px-3 small mb-3`;
    alertEl.textContent = msg;
    alertEl.classList.remove('d-none');
  };

  if (alertEl) alertEl.classList.add('d-none');

  const oldPassword = document.getElementById('cp_old_password')?.value || '';
  const newPassword = document.getElementById('cp_new_password')?.value || '';
  const confirmPassword = document.getElementById('cp_confirm_password')?.value || '';

  const user = getCurrentUser();
  if (!user || !user.username) {
    showAlertMsg('無法取得目前登入之使用者資訊，請重新登入。');
    return;
  }

  if (!newPassword || newPassword.length < 4) {
    showAlertMsg('新密碼長度至少需為 4 個字元');
    return;
  }

  if (newPassword !== confirmPassword) {
    showAlertMsg('兩次輸入的新密碼不相符，請重新確認');
    return;
  }

  const submitBtn = document.getElementById('changePasswordSubmitBtn');
  const originalBtnText = submitBtn ? submitBtn.innerHTML : '確認更新密碼';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span> 更新中...';
  }

  try {
    const res = await fetchApi('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({
        username: user.username,
        oldPassword,
        newPassword
      })
    });

    if (res && res.success) {
      showAlertMsg(res.message || '密碼已成功更新！', true);
      showAlert('密碼已成功變更，請妥善保管您的新密碼！', 'success');
      setTimeout(() => {
        const modalEl = document.getElementById('changePasswordModal');
        if (modalEl) {
          const modal = bootstrap.Modal.getInstance(modalEl) || bootstrap.Modal.getOrCreateInstance(modalEl);
          if (modal) modal.hide();
        }
      }, 1200);
    } else {
      showAlertMsg(res && res.message ? res.message : '密碼變更失敗，請確認原密碼是否正確。');
    }
  } catch (err) {
    showAlertMsg('連線異常，更新密碼失敗，請稍後再試。');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnText;
    }
    if (form) {
      form.dataset.isSubmitting = 'false';
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
  // 三個獨立請求平行讀取；其中一個失敗不可阻塞其他區塊。
  const [metricsRes, quotationsRes, transactionsRes] = await Promise.all([
    fetchApi('/api/metrics'),
    fetchApi('/api/quotations?limit=5'),
    fetchApi('/api/transactions?limit=5')
  ]);

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
    appState.quotations = quotationsRes.data;
    renderDashboardRecentQuotations(quotationsRes.data);
  } else {
    renderDashboardRequestFailure('dashboardRecentQuotationsTbody', 6, quotationsRes.message);
  }

  // 渲染最近交易單
  if (transactionsRes.success && Array.isArray(transactionsRes.data)) {
    appState.transactions = transactionsRes.data;
    renderDashboardRecentTransactions(transactionsRes.data.slice(0, 5));
  } else {
    renderDashboardRequestFailure('dashboardRecentTransactionsTbody', 4, transactionsRes.message);
  }

  if (!metricsRes.success || !quotationsRes.success || !transactionsRes.success) {
    const failedSections = [
      !metricsRes.success && '統計指標',
      !quotationsRes.success && '最近報價單',
      !transactionsRes.success && '最近交易單'
    ].filter(Boolean).join('、');
    showAlert(`${failedSections}暫時無法讀取，請按「重新整理」重試。`, 'warning', 7000);
  }
}

function renderDashboardRequestFailure(tableBodyId, colspan, message) {
  const tbody = document.getElementById(tableBodyId);
  if (!tbody) return;
  tbody.innerHTML = '';

  const row = document.createElement('tr');
  const cell = document.createElement('td');
  cell.colSpan = colspan;
  cell.className = 'text-center py-4 text-muted';
  cell.append('讀取失敗：' + (message || '暫時無法連線'));

  const retryButton = document.createElement('button');
  retryButton.type = 'button';
  retryButton.className = 'btn btn-sm btn-outline-primary ms-3';
  retryButton.textContent = '重新載入';
  retryButton.addEventListener('click', loadDashboard);
  cell.appendChild(retryButton);
  row.appendChild(cell);
  tbody.appendChild(row);
}

// 渲染狀態分佈 (0 筆不顯示)
function renderDashboardStatusDistribution(statusCounts) {
  const container = document.getElementById('statusDistributionContainer');
  if (!container) return;
  container.innerHTML = '';

  const statusMeta = {
    DRAFT: { name: '草稿', class: 'badge-draft' },
    SENT: { name: '已送出', class: 'badge-sent' },
    ACCEPTED: { name: '已核准', class: 'badge-accepted' },
    REJECTED: { name: '已拒絕', class: 'badge-rejected' },
    EXPIRED: { name: '已過期', class: 'badge-expired' }
  };

  let hasAnyNonZero = false;

  Object.entries(statusMeta).forEach(([key, meta]) => {
    const count = statusCounts[key] || 0;
    // 嚴格過濾：0 筆就不顯示
    if (count > 0) {
      hasAnyNonZero = true;
      const badge = document.createElement('div');
      badge.className = `p-2 px-3 rounded border d-flex align-items-center gap-2 bg-white shadow-sm text-nowrap`;
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

// 儀表板最近報價單清單 (全寬上下堆疊結構)
function renderDashboardRecentQuotations(quotations) {
  const tbody = document.getElementById('dashboardRecentQuotationsTbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (quotations.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">尚無報價單紀錄</td></tr>';
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
    const canManage = canManageQuotation(q);

    tr.innerHTML = `
      <td class="text-nowrap"><span class="quotation-code">${q.quotationNumber}</span></td>
      <td class="text-nowrap"><div class="fw-semibold text-dark">${q.customerName}</div></td>
      <td class="text-nowrap"><span class="small text-muted">${formatDate(q.issueDate)}</span></td>
      <td class="text-nowrap"><span class="fw-bold text-dark">${formatCurrency(q.totalAmount)}</span></td>
      <td class="text-nowrap"><span class="text-success fw-bold">${formatCurrency(profit)}</span> <small class="text-muted">(${margin}%)</small></td>
      <td class="text-nowrap">${statusBadges[q.status] || q.status}</td>
      <td class="text-end text-nowrap">
        <div class="btn-group btn-group-sm action-icon-group">
          <button class="btn action-icon-btn" onclick="openViewQuotationModal(${q.id})" title="檢視報價單" aria-label="檢視報價單">👁️</button>
          ${canManage && q.status === 'ACCEPTED' && !q.hasTransaction ? `<button class="btn action-icon-btn" onclick="convertToTransaction(${q.id})" title="轉為交易單" aria-label="轉為交易單">💳</button>` : ''}
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// 儀表板最近交易單清單 (全寬上下堆疊結構)
function renderDashboardRecentTransactions(transactions) {
  const tbody = document.getElementById('dashboardRecentTransactionsTbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (transactions.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">尚無交易立案紀錄</td></tr>';
    return;
  }

  transactions.forEach(t => {
    const tr = document.createElement('tr');
    const paymentBadges = {
      PAID: '<span class="badge bg-success-subtle text-success border border-success-subtle">已結案</span>',
      PARTIAL: '<span class="badge bg-warning-subtle text-warning border border-warning-subtle">部分付款</span>',
      PENDING: '<span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle">待付款</span>',
      REFUNDED: '<span class="badge bg-danger-subtle text-danger border border-danger-subtle">已退款</span>'
    };

    tr.innerHTML = `
      <td class="text-nowrap"><span class="quotation-code font-monospace">${t.transactionNumber}</span></td>
      <td class="text-nowrap"><div class="fw-semibold text-dark">${t.customerName}</div></td>
      <td class="text-nowrap"><span class="small text-muted">${formatDate(t.transactionDate)}</span></td>
      <td class="text-nowrap"><span class="fw-bold text-primary">${formatCurrency(t.paidAmount || 0)}</span></td>
      <td class="text-nowrap"><span class="fw-bold text-dark">${formatCurrency(t.totalAmount)}</span></td>
      <td class="text-nowrap">${paymentBadges[t.paymentStatus] || t.paymentStatus}</td>
      <td class="text-end text-nowrap">
        <div class="btn-group btn-group-sm action-icon-group">
          <button class="btn action-icon-btn" onclick="openEditTransactionModal(${t.id})" title="管理交易與發票" aria-label="管理交易與發票">✏️</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}


// ============================================================
// 3. 客戶管理模組 (Customers View)
// ============================================================

async function loadCustomers() {
  const tbody = document.getElementById('customersTableBody');
  // 若快取已存在資料，立即先行呈現，避免白畫面與持續轉圈
  if (appState.customers && Array.isArray(appState.customers) && appState.customers.length > 0) {
    renderCustomersTable(appState.customers);
  }
  try {
    const res = await fetchApi('/api/customers');
    if (res && res.success && Array.isArray(res.data)) {
      appState.customers = res.data;
      renderCustomersTable(appState.customers);
    } else {
      console.warn('loadCustomers 回應非成功狀態:', res);
      if (!appState.customers || appState.customers.length === 0) {
        if (tbody) {
          tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted">${(res && res.message) ? res.message : '查無客戶資料'}</td></tr>`;
        }
      }
    }
  } catch (err) {
    console.error('loadCustomers 連線錯誤:', err);
    if (!appState.customers || appState.customers.length === 0) {
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-danger">客戶資料載入異常，請重新整理頁面</td></tr>`;
      }
    }
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
    const contactDeptTitle = [c.department, c.title].filter(Boolean).join(' · ');
    tr.innerHTML = `
      <td class="text-nowrap"><span class="quotation-code">${c.customerCode || '-'}</span></td>
      <td class="text-nowrap">
        <div class="fw-bold text-dark text-nowrap">${c.customerName}</div>
        ${c.notes ? `<div class="small text-muted text-nowrap">${c.notes}</div>` : ''}
      </td>
      <td class="text-nowrap"><span class="font-monospace">${c.taxId || '-'}</span></td>
      <td class="text-nowrap">
        <div class="fw-semibold text-nowrap">${c.contactPerson || '-'}</div>
        ${contactDeptTitle ? `<div class="small text-muted text-nowrap">${contactDeptTitle}</div>` : ''}
      </td>
      <td class="text-nowrap">
        <div class="text-nowrap">📞 ${c.phone || '-'}</div>
        ${c.fax ? `<div class="small text-muted text-nowrap">📠 傳真: ${c.fax}</div>` : ''}
        <div class="small text-muted text-nowrap">✉️ ${c.email || '-'}</div>
      </td>
      <td class="text-nowrap"><small class="text-secondary text-nowrap">${c.address || '-'}</small></td>
      <td class="text-nowrap">
        <div class="small fw-semibold text-dark text-nowrap">${c.updatedBy || c.createdBy || '系統管理者'}</div>
        <div class="small text-muted text-nowrap">${formatDateTime(c.updatedAt || c.createdAt)}</div>
      </td>
      <td class="text-end text-nowrap">
        <div class="btn-group btn-group-sm action-icon-group">
          <button class="btn action-icon-btn" onclick="openEditCustomerModal(${c.id})" title="編輯客戶" aria-label="編輯客戶">✏️</button>
          <button class="btn action-icon-btn" onclick="confirmDeleteCustomer(${c.id}, '${c.customerName}')" title="刪除客戶" aria-label="刪除客戶">🗑️</button>
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
      (c.department || '').toLowerCase().includes(keyword) ||
      (c.title || '').toLowerCase().includes(keyword) ||
      (c.fax || '').includes(keyword) ||
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
  if (document.getElementById('c_department')) document.getElementById('c_department').value = '';
  if (document.getElementById('c_title')) document.getElementById('c_title').value = '';
  if (document.getElementById('c_fax')) document.getElementById('c_fax').value = '';
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
  if (document.getElementById('c_department')) document.getElementById('c_department').value = c.department || '';
  if (document.getElementById('c_title')) document.getElementById('c_title').value = c.title || '';
  if (document.getElementById('c_fax')) document.getElementById('c_fax').value = c.fax || '';
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
    department: document.getElementById('c_department')?.value.trim() || '',
    title: document.getElementById('c_title')?.value.trim() || '',
    fax: document.getElementById('c_fax')?.value.trim() || '',
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
      <td class="text-nowrap"><span class="quotation-code">${v.vendorCode || '-'}</span></td>
      <td class="text-nowrap">
        <div class="fw-bold text-dark text-nowrap">${v.vendorName}</div>
        ${v.notes ? `<div class="small text-muted text-nowrap">${v.notes}</div>` : ''}
      </td>
      <td class="text-nowrap"><span class="font-monospace">${v.taxId || '-'}</span></td>
      <td class="text-nowrap"><span class="fw-semibold">${v.contactPerson || '-'}</span></td>
      <td class="text-nowrap">
        <div class="text-nowrap">📞 ${v.phone || '-'}</div>
        <div class="small text-muted text-nowrap">✉️ ${v.email || '-'}</div>
      </td>
      <td class="text-nowrap"><small class="text-dark fw-semibold text-nowrap">${v.productsAndServices || '-'}</small></td>
      <td class="text-nowrap">
        <span class="badge bg-primary-subtle text-primary border border-primary-subtle text-nowrap">${v.totalProducts || 0} 種產品</span>
        <div class="small text-muted mt-1 text-nowrap">合作 ${v.cooperationCount || 0} 次</div>
      </td>
      <td class="text-nowrap">
        <div class="small fw-semibold text-dark text-nowrap">${v.updatedBy || v.createdBy || '系統管理者'}</div>
        <div class="small text-muted text-nowrap">${formatDateTime(v.updatedAt || v.createdAt)}</div>
      </td>
      <td class="text-end text-nowrap">
        <div class="btn-group btn-group-sm action-icon-group">
          <button class="btn action-icon-btn" onclick="openEditVendorModal(${v.id})" title="編輯廠商" aria-label="編輯廠商">✏️</button>
          <button class="btn action-icon-btn" onclick="confirmDeleteVendor(${v.id}, '${v.vendorName}')" title="刪除廠商" aria-label="刪除廠商">🗑️</button>
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
      `<button type="button" class="btn p-0 border-0 bg-transparent product-image-preview-trigger" onclick="openProductImagePreview(${p.id})" title="查看產品圖片" aria-label="查看 ${p.productName} 的產品圖片"><img src="${p.imageUrl}" alt="${p.productName}" class="rounded border" style="width: 48px; height: 48px; object-fit: cover;" /></button>` :
      `<div class="bg-light rounded border text-muted d-flex align-items-center justify-content-center small" style="width: 48px; height: 48px;">📦</div>`;

    tr.innerHTML = `
      <td class="text-nowrap">${thumbHtml}</td>
      <td class="text-nowrap"><span class="quotation-code">${p.productCode || '-'}</span></td>
      <td class="text-nowrap">
        <div class="fw-bold text-dark text-nowrap">${p.productName}</div>
        ${p.description ? `<div class="small text-muted text-nowrap">${p.description}</div>` : ''}
      </td>
      <td class="text-nowrap">
        <div class="fw-semibold text-dark text-nowrap">${p.brand ? p.brand : '<span class="text-muted small">-</span>'}</div>
        <div class="small text-muted font-monospace text-nowrap">${p.model ? p.model : '<span class="text-muted small">-</span>'}</div>
      </td>
      <td class="text-nowrap"><span class="badge bg-secondary-subtle text-secondary text-nowrap">${p.category || '一般'}</span></td>
      <td class="text-nowrap"><span class="text-muted text-nowrap">${p.unit || '件'}</span></td>
      <td class="text-nowrap"><span class="text-danger fw-semibold text-nowrap">${formatCurrency(cost)}</span></td>
      <td class="text-nowrap"><span class="text-primary fw-bold text-nowrap">${formatCurrency(price)}</span></td>
      <td class="text-nowrap">
        <span class="fw-bold text-success text-nowrap">${formatCurrency(profit)}</span>
        <div class="small text-muted text-nowrap">(${margin}%)</div>
      </td>
      <td class="text-nowrap">
        ${p.status === 'ACTIVE' ? '<span class="badge bg-success-subtle text-success text-nowrap">銷售中</span>' : '<span class="badge bg-secondary-subtle text-secondary text-nowrap">已停售</span>'}
      </td>
      <td class="text-nowrap">
        <div class="small fw-semibold text-dark text-nowrap">${p.updatedBy || p.createdBy || '系統管理者'}</div>
        <div class="small text-muted text-nowrap">${formatDateTime(p.updatedAt || p.createdAt)}</div>
      </td>
      <td class="text-end text-nowrap">
        <div class="btn-group btn-group-sm action-icon-group">
          <button class="btn action-icon-btn" onclick="openEditProductModal(${p.id})" title="編輯產品" aria-label="編輯產品">✏️</button>
          <button class="btn action-icon-btn" onclick="confirmDeleteProduct(${p.id}, '${p.productName}')" title="刪除產品" aria-label="刪除產品">🗑️</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function openProductImagePreview(productId) {
  const product = appState.products.find(item => item.id === productId);
  if (!product?.imageUrl) return;

  const modalEl = document.getElementById('productImagePreviewModal');
  const imageEl = document.getElementById('productImagePreview');
  const titleEl = document.getElementById('productImagePreviewTitle');
  if (!modalEl || !imageEl || !titleEl) return;

  titleEl.textContent = `產品圖片：${product.productName}`;
  imageEl.src = product.imageUrl;
  imageEl.alt = product.productName;
  bootstrap.Modal.getOrCreateInstance(modalEl).show();
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

function canManageQuotation(quotation) {
  if (appState.currentUser?.role === 'ADMIN') return true;
  const quotationOwner = quotation?.salesRep || quotation?.createdBy;
  return Boolean(
    quotationOwner &&
    appState.currentUser?.name &&
    quotationOwner.trim() === appState.currentUser.name.trim()
  );
}

function renderQuotationsTable(quotations) {
  const tbody = document.getElementById('quotationsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (quotations.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-muted">尚無報價單紀錄</td></tr>';
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
    const canManage = canManageQuotation(q);

    tr.innerHTML = `
      <td class="text-nowrap">
        <div class="quotation-code fw-bold mb-1">${q.quotationNumber}</div>
        <span class="badge bg-light text-dark border text-nowrap">${q.companyName || '極簡資訊科技'}</span>
      </td>
      <td class="text-nowrap">
        <div class="fw-bold text-dark text-nowrap">${q.customerName}</div>
        ${q.customerContactPerson ? `<div class="small text-muted text-nowrap">窗口: ${q.customerContactPerson}</div>` : ''}
      </td>
      <td class="text-nowrap"><span class="small text-nowrap">${formatDate(q.issueDate)}</span></td>
      <td class="text-nowrap">${statusBadges[q.status] || q.status}</td>
      <td class="text-nowrap"><span class="fw-bold text-primary text-nowrap">${formatCurrency(q.totalAmount)}</span></td>
      <td class="text-nowrap">
        <div class="text-danger small mb-1 text-nowrap">成本: ${formatCurrency(q.totalCost || 0)}</div>
        <div class="text-success fw-bold text-nowrap">毛利: ${formatCurrency(profit)} <small class="text-muted">(${margin}%)</small></div>
      </td>
      <td class="text-nowrap">
        <div class="small fw-semibold text-dark text-nowrap">${q.updatedBy || q.createdBy || '系統管理者'}</div>
        <div class="small text-muted text-nowrap">${formatDateTime(q.updatedAt || q.createdAt)}</div>
      </td>
      <td class="text-end text-nowrap">
        <div class="btn-group btn-group-sm action-icon-group">
          <button class="btn action-icon-btn" onclick="openViewQuotationModal(${q.id})" title="檢視正式報價單" aria-label="檢視正式報價單">👁️</button>
          ${canManage && q.status === 'ACCEPTED' && !q.hasTransaction ? `<button class="btn action-icon-btn" onclick="convertToTransaction(${q.id})" title="轉為交易單" aria-label="轉為交易單">💳</button>` : ''}
          ${canManage ? `<button class="btn action-icon-btn" onclick="openEditQuotationModal(${q.id})" title="編輯報價單" aria-label="編輯報價單">✏️</button>` : ''}
          ${canManage && !q.hasTransaction ? `<button class="btn action-icon-btn" onclick="reviseQuotation(${q.id})" title="拒絕原報價單並複製為新草稿" aria-label="更改報價單">🔁</button>` : ''}
          ${canManage ? `<button class="btn action-icon-btn" onclick="confirmDeleteQuotation(${q.id}, '${q.quotationNumber}')" title="刪除報價單" aria-label="刪除報價單">🗑️</button>` : ''}
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

async function reviseQuotation(quotationId) {
  const quotation = appState.quotations.find(item => item.id === quotationId);
  if (!quotation) {
    showAlert('找不到要更改的報價單', 'danger');
    return;
  }
  if (!canManageQuotation(quotation)) {
    showAlert('只有原報價聯絡窗口或系統管理者可以更改報價單', 'warning');
    return;
  }

  const confirmed = window.confirm(
    `確定要更改報價單「${quotation.quotationNumber}」嗎？\n\n系統會將原報價單標示為「已拒絕」，並複製一張新的草稿供你修改。`
  );
  if (!confirmed) return;

  const response = await fetchApi(`/api/quotations/${quotationId}/revise`, {
    method: 'POST',
    body: JSON.stringify({ operator: appState.currentUser.name })
  });
  if (!response.success || !response.data?.id) {
    showAlert(response.message || '建立更改版報價單失敗', 'danger');
    return;
  }

  showAlert(response.message || '已建立新的報價單草稿', 'success');
  await loadQuotations();
  await openEditQuotationModal(response.data.id);
}

// 報價單開立主體公司切換：公司資料控制抬頭與條款，聯絡窗口固定採目前登入者。
function handleQuotationCompanyChange() {
  const companySelect = document.getElementById('q_company_id');
  if (!companySelect) return;
  const compId = parseInt(companySelect.value, 10);
  const list = (appState.allCompanies && appState.allCompanies.length > 0) ? appState.allCompanies : [DEFAULT_COMPANY_FALLBACK];
  const comp = list.find(c => c.id === compId) || list.find(c => c.isDefault) || list[0] || DEFAULT_COMPANY_FALLBACK;
  if (!comp) return;

  const compNameInput = document.getElementById('q_company_name');
  if (compNameInput) compNameInput.value = comp.companyName || '';

  const currentUser = appState.currentUser || {};
  const contactName = currentUser.name || comp.contactPerson || '業務代表';
  const contactPhone = currentUser.phone || comp.contactPhone || comp.phone || '';
  const contactEmail = currentUser.email || comp.contactEmail || comp.email || '';

  const cpInput = document.getElementById('q_company_contact_person');
  if (cpInput) cpInput.value = contactName;
  const cphInput = document.getElementById('q_company_contact_phone');
  if (cphInput) cphInput.value = contactPhone;
  const ceInput = document.getElementById('q_company_contact_email');
  if (ceInput) ceInput.value = contactEmail;

  const cpText = document.getElementById('q_company_contact_person_text');
  if (cpText) cpText.textContent = contactName;
  const cphText = document.getElementById('q_company_contact_phone_text');
  if (cphText) cphText.textContent = contactPhone || '無電話';
  const ceText = document.getElementById('q_company_contact_email_text');
  if (ceText) ceText.textContent = contactEmail || '無 Email';

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

  const list = (appState.allCompanies && appState.allCompanies.length > 0) ? appState.allCompanies : [DEFAULT_COMPANY_FALLBACK];

  list.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = `🏢 ${c.companyName} ${c.isDefault ? '(系統預設)' : ''}`;
    if (selectedCompanyId ? (c.id === selectedCompanyId) : c.isDefault) {
      opt.selected = true;
    }
    sel.appendChild(opt);
  });

  if (!sel.value && sel.options.length > 0) {
    sel.selectedIndex = 0;
  }

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
  applyQuotationCustomerData(c);
}

function applyQuotationCustomerData(customer) {
  document.getElementById('q_customer_id').value = customer.id;
  document.getElementById('q_customer_name').value = customer.customerName;
  document.getElementById('q_customer_tax_id').value = customer.taxId || '';
  document.getElementById('q_customer_contact').value = customer.contactPerson || '';
  document.getElementById('q_customer_phone').value = customer.phone || '';
  document.getElementById('q_customer_email').value = customer.email || '';
  document.getElementById('q_customer_address').value = customer.address || '';
}

// 統編輸入滿 8 碼時，直接向 API 查詢，避免初始客戶清單未同步導致無法帶入。
async function handleQuotationCustomerTaxIdInput(inputEl) {
  const normalizedTaxId = inputEl.value.replace(/\D/g, '').slice(0, 8);
  if (inputEl.value !== normalizedTaxId) inputEl.value = normalizedTaxId;
  if (normalizedTaxId.length !== 8) return;

  let matchedCustomer = appState.customers.find(customer =>
    String(customer.taxId || '').replace(/\D/g, '') === normalizedTaxId
  );
  if (!matchedCustomer) {
    const response = await fetchApi(`/api/customers?search=${encodeURIComponent(normalizedTaxId)}&limit=100`);
    if (inputEl.value !== normalizedTaxId) return;
    if (response.success && Array.isArray(response.data)) {
      matchedCustomer = response.data.find(customer =>
        String(customer.taxId || '').replace(/\D/g, '') === normalizedTaxId
      );
    }
  }
  if (!matchedCustomer) return;

  const customerSelect = document.getElementById('q_customer_select');
  if (customerSelect) customerSelect.value = String(matchedCustomer.id);
  applyQuotationCustomerData(matchedCustomer);
}

// 動態增加報價單明細列
function addQuotationItemRow(item = null) {
  const container = document.getElementById('quotationItemsContainer');
  if (!container) return;

  const rowId = 'q_item_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
  const rowDiv = document.createElement('div');
  rowDiv.className = 'item-row p-3 mb-2';
  rowDiv.id = rowId;

  // 報價只能新選銷售中的產品；停售品項仍保留於既有明細，避免編輯舊報價時遺失關聯。
  const originalProduct = item?.productId ? appState.products.find(p => p.id === item.productId) : null;
  const isOriginalProductDiscontinued = originalProduct && originalProduct.status !== 'ACTIVE';
  const originalProductId = isOriginalProductDiscontinued ? originalProduct.id : '';
  let productOptions = '<option value="">-- 關聯現有產品 (選填) --</option>';
  appState.products.filter(p => p.status === 'ACTIVE').forEach(p => {
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
        <select class="form-select form-select-sm mb-1 item-prod-select" data-original-product-id="${originalProductId}" onchange="handleQuotationItemProductChange('${rowId}', this)">
          ${productOptions}
        </select>
        ${isOriginalProductDiscontinued ? '<div class="form-text text-warning">原關聯產品已停售，保留既有明細；可改選銷售中產品。</div>' : ''}
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
  if (!selectedOpt || !selectedOpt.value) {
    // 使用者主動清除選擇時，不再保留舊有停售產品關聯。
    selectEl.dataset.originalProductId = '';
    return;
  }

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

async function openCreateQuotationModal() {
  await ensureCompaniesLoaded();

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

async function fetchQuotationDetails(id) {
  const detailResponse = await fetchApi(`/api/quotations/${id}`);
  if (!detailResponse.success || !detailResponse.data) {
    showAlert(detailResponse.message || '讀取報價單明細失敗', 'danger');
    return null;
  }
  return detailResponse.data;
}

async function openEditQuotationModal(id) {
  await ensureCompaniesLoaded();

  const q = await fetchQuotationDetails(id);
  if (!q) return;
  if (!canManageQuotation(q)) {
    showAlert('只有原報價聯絡窗口或系統管理者可以編輯報價單', 'warning');
    return;
  }

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
  // 系統管理者協助修改時，仍保留原本帶入的報價聯絡窗口，不移轉該筆報價的維護權。
  document.getElementById('q_company_contact_person').value = q.salesRep || '';
  document.getElementById('q_company_contact_phone').value = q.salesPhone || '';
  document.getElementById('q_company_contact_email').value = q.salesEmail || '';

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
  const releaseSubmitLock = acquireFormSubmitLock(event.currentTarget);
  if (!releaseSubmitLock) return;

  let subtotalSum = 0;
  let totalCost = 0;
  const items = [];
  rows.forEach((row, idx) => {
    const prodSelect = row.querySelector('.item-prod-select');
    // 已停售產品不會列在下拉選單，但編輯舊報價且未改動明細時仍須保留原有關聯。
    const productIdValue = prodSelect?.value || prodSelect?.dataset.originalProductId || '';
    const prodId = productIdValue ? parseInt(productIdValue, 10) : null;
    const name = row.querySelector('.item-name-input')?.value.trim() || '未命名品項';
    const desc = row.querySelector('.item-desc-input')?.value.trim() || '';
    const qty = parseFloat(row.querySelector('.item-qty-input')?.value) || 1;
    const price = parseFloat(row.querySelector('.item-price-input')?.value) || 0;
    const cost = parseFloat(row.querySelector('.item-cost-input')?.value) || 0;
    const lineTotal = qty * price;

    subtotalSum += lineTotal;
    totalCost += (qty * cost);

    items.push({
      productId: prodId,
      itemName: name,
      description: desc,
      quantity: qty,
      unitPrice: price,
      costPrice: cost,
      lineTotal,
      sortOrder: idx
    });
  });

  const taxMode = document.querySelector('input[name="q_tax_mode"]:checked')?.value || 'EXCLUSIVE';
  const taxRate = 5;
  let taxAmount = 0;
  let totalAmount = 0;
  let subtotalCalculated = subtotalSum;

  if (taxMode === 'INCLUSIVE') {
    totalAmount = subtotalSum;
    const untaxed = Math.round(totalAmount / (1 + (taxRate / 100)));
    taxAmount = totalAmount - untaxed;
    subtotalCalculated = untaxed;
  } else if (taxMode === 'ZERO') {
    taxAmount = 0;
    totalAmount = subtotalSum;
    subtotalCalculated = subtotalSum;
  } else {
    // EXCLUSIVE 外加稅
    taxAmount = Math.round(subtotalSum * (taxRate / 100));
    totalAmount = subtotalSum + taxAmount;
    subtotalCalculated = subtotalSum;
  }

  const grossProfit = totalAmount - totalCost;
  const grossMargin = totalAmount > 0 ? parseFloat(((grossProfit / totalAmount) * 100).toFixed(1)) : 0;

  const compIdRaw = document.getElementById('q_company_id')?.value;
  const parsedCompId = compIdRaw ? parseInt(compIdRaw, 10) : (appState.currentCompany?.id || 1);
  const selectedCompObj = (appState.allCompanies || []).find(c => c.id === parsedCompId) || appState.currentCompany || DEFAULT_COMPANY_FALLBACK;
  const companyNameVal = document.getElementById('q_company_name')?.value || selectedCompObj.companyName || '宏碁資訊科技有限公司';

  const payload = {
    quotationNumber: document.getElementById('q_number').value.trim(),
    companyId: isNaN(parsedCompId) ? 1 : parsedCompId,
    companyName: companyNameVal,
    salesRep: document.getElementById('q_company_contact_person').value || appState.currentUser.name || selectedCompObj.contactPerson || '',
    salesPhone: document.getElementById('q_company_contact_phone').value || appState.currentUser.phone || selectedCompObj.contactPhone || '',
    salesEmail: document.getElementById('q_company_contact_email').value || appState.currentUser.email || selectedCompObj.contactEmail || '',
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
    taxRate,
    subtotal: subtotalCalculated,
    taxAmount,
    totalAmount,
    totalCost,
    grossProfit,
    grossMargin,
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
  releaseSubmitLock();
}

// 核心功能：一鍵將報價單轉為交易單 (Convert to Transaction)
async function convertToTransaction(quotationId) {
  const q = appState.quotations.find(item => item.id === quotationId);
  const qNum = q ? q.quotationNumber : `ID #${quotationId}`;

  if (q && q.status !== 'ACCEPTED') {
    showAlert('只有已核准的報價單可以轉為交易單', 'warning');
    return;
  }
  if (q && !canManageQuotation(q)) {
    showAlert('只有原報價聯絡窗口或系統管理者可以轉為交易單', 'warning');
    return;
  }

  const isConfirmed = window.confirm(
    `確定要將已核准報價單「${qNum}」轉為正式交易嗎？\n\n轉換後會建立正式交易單。`
  );
  if (!isConfirmed) return;

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
async function openViewQuotationModal(id) {
  // 清單 API 不含明細品項；預覽時改取完整報價單，避免項目表格空白。
  const q = await fetchQuotationDetails(id);
  if (!q) return;

  const modalEl = document.getElementById('viewQuotationModal');
  modalEl.setAttribute('data-active-quotation-id', q.id);
  const convertButton = document.getElementById('viewQConvertTxBtn');
  if (convertButton) convertButton.classList.toggle('d-none', q.status !== 'ACCEPTED' || q.hasTransaction || !canManageQuotation(q));

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
            報價窗口：${q.salesRep || comp.contactPerson || '業務部'} (📞 ${q.salesPhone || comp.contactPhone || comp.phone || '-'} ✉️ ${q.salesEmail || comp.contactEmail || comp.email || '-'})
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
  const quotation = appState.quotations.find(item => item.id === id);
  if (!quotation || !canManageQuotation(quotation)) {
    showAlert('只有原報價聯絡窗口或系統管理者可以刪除報價單', 'warning');
    return;
  }
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
    tbody.innerHTML = '<tr><td colspan="11" class="text-center py-4 text-muted">尚無交易立案紀錄</td></tr>';
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
      <td class="text-nowrap">
        <div class="quotation-code fw-bold mb-1">${t.transactionNumber}</div>
        <div class="small text-muted text-nowrap"><span class="text-secondary">報價:</span> <span class="font-monospace">${t.quotationNumber || '手動建立'}</span></div>
      </td>
      <td class="text-nowrap">
        <div class="fw-bold text-dark text-nowrap">${t.customerName}</div>
        ${t.customerEmail ? `<div class="small text-muted text-nowrap">✉️ ${t.customerEmail}</div>` : ''}
      </td>
      <td class="text-nowrap"><span class="small text-nowrap">${formatDate(t.transactionDate)}</span></td>
      <td class="text-nowrap"><span class="fw-bold text-primary text-nowrap">${formatCurrency(total)}</span></td>
      <td class="text-nowrap">
        <div class="text-danger small mb-1 text-nowrap">成本: ${formatCurrency(cost)}</div>
        <div class="text-success fw-bold text-nowrap">毛利: ${formatCurrency(profit)} <small class="text-muted">(${margin}%)</small></div>
      </td>
      <td class="text-nowrap" style="white-space: nowrap !important;">
        <div class="text-nowrap" style="font-size: 0.85rem; white-space: nowrap !important;"><span class="text-secondary">已收：</span><span class="fw-bold text-primary">${formatCurrency(paid)}</span></div>
        <div class="text-nowrap" style="font-size: 0.85rem; white-space: nowrap !important;"><span class="text-secondary">待收：</span><span class="fw-bold ${remaining > 0 ? 'text-danger' : 'text-muted'}">${formatCurrency(remaining)}</span></div>
      </td>
      <td class="text-nowrap">${invoiceBadge}</td>
      <td class="text-nowrap">${paymentBadges[t.paymentStatus] || t.paymentStatus}</td>
      <td class="text-nowrap">
        <div class="small fw-semibold text-dark text-nowrap">${t.updatedBy || t.createdBy || '系統管理者'}</div>
        <div class="small text-muted text-nowrap">${formatDateTime(t.updatedAt || t.createdAt)}</div>
      </td>
      <td class="text-end text-nowrap">
        <div class="btn-group btn-group-sm action-icon-group">
          <button class="btn action-icon-btn" onclick="openEditTransactionModal(${t.id})" title="管理交易與發票" aria-label="管理交易與發票">✏️</button>
          <button class="btn action-icon-btn" onclick="confirmDeleteTransaction(${t.id}, '${t.transactionNumber}')" title="刪除交易" aria-label="刪除交易">🗑️</button>
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
        <option value="PAID" ${status === 'PAID' ? 'selected' : ''}>已付</option>
        <option value="PENDING" ${status === 'PENDING' ? 'selected' : ''}>待付</option>
        <option value="CANCELLED" ${status === 'CANCELLED' ? 'selected' : ''}>取消</option>
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

async function openEditTransactionModal(id) {
  // 首頁只載入交易摘要；編輯前重新讀取單筆資料，確保發票明細與收款狀態完整且最新。
  const detailResponse = await fetchApi(`/api/transactions/${id}`);
  if (!detailResponse.success || !detailResponse.data) {
    showAlert(detailResponse.message || '讀取交易與發票明細失敗', 'danger');
    return;
  }
  const t = detailResponse.data;

  const stateIndex = appState.transactions.findIndex(item => item.id === id);
  if (stateIndex >= 0) {
    appState.transactions[stateIndex] = t;
  } else {
    appState.transactions.push(t);
  }

  document.getElementById('tx_id').value = t.id;
  document.getElementById('tx_quotation_id').value = t.quotationId || '';
  document.getElementById('tx_number').value = t.transactionNumber;
  document.getElementById('tx_quotation_number').value = t.quotationNumber || '';
  document.getElementById('tx_customer_name').value = t.customerName || '';
  document.getElementById('tx_date').value = formatDate(t.transactionDate);
  document.getElementById('tx_total_amount').value = t.totalAmount || 0;
  document.getElementById('tx_cost_price').value = t.costPrice || 0;
  document.getElementById('tx_paid_amount').value = t.paidAmount || 0;
  let payMethod = t.paymentMethod || '電匯';
  if (payMethod.includes('電匯')) payMethod = '電匯';
  else if (payMethod.includes('信用卡')) payMethod = '信用卡';
  else if (payMethod.includes('支票')) payMethod = '支票';
  else if (payMethod.includes('現金')) payMethod = '現金';
  document.getElementById('tx_payment_method').value = payMethod;
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
  const releaseSubmitLock = acquireFormSubmitLock(event.currentTarget);
  if (!releaseSubmitLock) return;
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
  releaseSubmitLock();
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
  const releaseSubmitLock = acquireFormSubmitLock(event.currentTarget);
  if (!releaseSubmitLock) return;
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
  releaseSubmitLock();
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
  const tbody = document.getElementById('usersTableBody');
  // 若快取已存在使用者清單，立即呈現
  if (appState.allUsers && Array.isArray(appState.allUsers) && appState.allUsers.length > 0) {
    renderUsersTable(appState.allUsers);
  }
  try {
    const res = await fetchApi('/api/users');
    if (res && res.success && Array.isArray(res.data)) {
      appState.allUsers = res.data;
      renderUsersTable(appState.allUsers);
    } else {
      console.warn('loadUsers 回應非成功狀態:', res);
      if (!appState.allUsers || appState.allUsers.length === 0) {
        if (tbody) {
          tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted">${(res && res.message) ? res.message : '尚無使用者資料'}</td></tr>`;
        }
      }
    }
  } catch (err) {
    console.error('loadUsers 連線錯誤:', err);
    if (!appState.allUsers || appState.allUsers.length === 0) {
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-danger">使用者資料載入異常，請重新整理頁面</td></tr>`;
      }
    }
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
      '<span class="badge bg-danger-subtle text-danger border border-danger-subtle">系統管理者</span>' : 
      '<span class="badge bg-primary-subtle text-primary border border-primary-subtle">一般使用者</span>';

    const allowed = Array.isArray(u.allowedMenus) ? u.allowedMenus : (typeof u.allowedMenus === 'string' ? u.allowedMenus.split(',') : []);
    const menusChips = u.role === 'ADMIN' ? 
      '<span class="badge bg-dark text-white text-nowrap">✨ 全部 9 項功能完全存取</span>' :
      allowed.map(m => `<span class="badge bg-light text-secondary border me-1 mb-1 text-nowrap">${menuLabels[m] || m}</span>`).join('');

    tr.innerHTML = `
      <td class="text-nowrap">
        <div class="fw-bold text-dark text-nowrap">${u.name} ${u.title ? `<span class="badge bg-secondary-subtle text-secondary ms-1 fw-normal text-nowrap">${u.title}</span>` : ''}</div>
        ${u.phone ? `<div class="small text-muted text-nowrap">${u.phone}</div>` : ''}
      </td>
      <td class="text-nowrap"><span class="font-monospace fw-semibold">${u.username}</span></td>
      <td class="text-nowrap"><span class="text-secondary">${u.department || '-'}${u.title ? ` · ${u.title}` : ''}</span></td>
      <td class="text-nowrap">${roleBadge}</td>
      <td><div class="d-flex flex-wrap" style="max-width: 280px;">${menusChips}</div></td>
      <td class="text-nowrap">
        ${u.status === 'ACTIVE' ? '<span class="badge bg-success-subtle text-success text-nowrap">正常</span>' : '<span class="badge bg-secondary-subtle text-secondary text-nowrap">停用</span>'}
      </td>
      <td class="text-nowrap">
        <div class="small fw-semibold text-dark text-nowrap">${u.updatedBy || u.createdBy || '系統管理者'}</div>
        <div class="small text-muted text-nowrap">${formatDateTime(u.updatedAt || u.createdAt)}</div>
      </td>
      <td class="text-end text-nowrap">
        <div class="btn-group btn-group-sm action-icon-group">
          <button class="btn action-icon-btn" onclick="openEditUserModal(${u.id})" title="編輯權限" aria-label="編輯權限">✏️</button>
          ${u.id !== 1 ? `<button class="btn action-icon-btn" onclick="confirmDeleteUser(${u.id}, '${u.name}')" title="刪除使用者" aria-label="刪除使用者">🗑️</button>` : ''}
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
  if (document.getElementById('u_title')) document.getElementById('u_title').value = '';
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
  if (document.getElementById('u_title')) document.getElementById('u_title').value = u.title || '';
  document.getElementById('u_username').value = u.username || '';
  // 需求：登入帳號一旦建立後即不可修改
  document.getElementById('u_username').readOnly = true;
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
  const releaseSubmitLock = acquireFormSubmitLock(event.currentTarget);
  if (!releaseSubmitLock) return;
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
    title: document.getElementById('u_title')?.value.trim() || '',
    username: document.getElementById('u_username').value.trim(),
    password: document.getElementById('u_password').value.trim(),
    department: document.getElementById('u_department').value.trim(),
    phone: document.getElementById('u_phone').value.trim(),
    email: document.getElementById('u_email').value.trim(),
    role,
    status: document.getElementById('u_status').value,
    // API 與資料庫以逗號分隔字串儲存，避免送出陣列造成 Pydantic 驗證失敗。
    allowedMenus: allowedMenus.join(','),
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
  releaseSubmitLock();
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
      <td class="text-nowrap"><span class="font-monospace text-muted">#${log.id}</span></td>
      <td class="text-nowrap"><span class="small text-dark font-monospace text-nowrap">${formatDateTime(log.createdAt)}</span></td>
      <td class="text-nowrap"><span class="badge bg-light text-dark border text-nowrap">${log.moduleTitle || log.module}</span></td>
      <td class="text-nowrap">${actionBadges[log.actionType] || `<span class="badge bg-secondary text-nowrap">${log.actionTitle || log.actionType}</span>`}</td>
      <td class="text-nowrap">
        <div class="fw-bold text-dark font-monospace text-nowrap">${log.targetId || '-'}</div>
        ${log.targetName ? `<div class="small text-muted text-nowrap">${log.targetName}</div>` : ''}
      </td>
      <td class="text-nowrap">
        <div class="fw-semibold text-primary text-nowrap">${log.operator || '系統管理者'}</div>
      </td>
      <td class="text-nowrap"><span class="text-secondary small text-nowrap">${log.details || '-'}</span></td>
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
