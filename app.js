const $ = (selector) => document.querySelector(selector);

const STORAGE_KEY = "dragonfly-ledger-v1";
const BUDGET_STORAGE_KEY = "dragonfly-ledger-budgets-v1";
const THEME_STORAGE_KEY = "dragonfly-ledger-theme-v1";
const CARRIER_STORAGE_KEY = "dragonfly-ledger-carrier-v1";
const PLANNER_EVENTS_STORAGE_KEY = "dragonfly-ledger-calendar-v1";
const CARRIER_PATTERN = /^\/[A-Z0-9.+-]{7}$/;

const categories = {
  expense: ["飲食", "交通", "購物", "娛樂", "生活", "學習", "醫療", "其他"],
  income: ["薪資", "零用錢", "獎金", "投資", "退款", "其他"]
};

const categoryIcons = {
  飲食: "🍜",
  交通: "🛵",
  購物: "🛍️",
  娛樂: "🎮",
  生活: "🏠",
  學習: "📚",
  醫療: "💊",
  薪資: "💼",
  零用錢: "💵",
  獎金: "🎁",
  投資: "📈",
  退款: "↩️",
  其他: "🧾"
};

const paymentMethods = [
  "現金", "金融卡", "信用卡", "銀行轉帳", "LINE Pay",
  "街口支付", "Apple Pay", "Google Pay", "悠遊卡",
  "一卡通", "其他"
];

const chartColors = [
  "#39785A", "#D6AF66", "#94A7C0", "#C97965",
  "#8D80B5", "#71A9A2", "#B7A28A", "#A5ADA7"
];

let records = loadRecords();
let budgets = loadBudgets();
let carrierSettings = loadCarrierSettings();
let currentType = "expense";
let editingId = null;

/* =========================
   資料儲存
   ========================= */

function loadRecords() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : [];

    // 相容事故期間曾使用的 { records: [...] } 格式。
    // 寫入時仍維持原本的陣列格式，避免再改動資料結構。
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.records)) {
      return parsed.records;
    }
    return [];
  } catch (error) {
    console.error("讀取帳目失敗：", error);
    return [];
  }
}

function saveRecords() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    return true;
  } catch (error) {
    console.error("儲存帳目失敗：", error);
    alert("儲存失敗，可能是瀏覽器儲存空間不足。");
    return false;
  }
}

function loadBudgets() {
  try {
    const saved = localStorage.getItem(BUDGET_STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : {};

    return parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
      ? parsed
      : {};
  } catch (error) {
    console.error("讀取預算失敗：", error);
    return {};
  }
}

function saveBudgets() {
  try {
    localStorage.setItem(BUDGET_STORAGE_KEY, JSON.stringify(budgets));
    return true;
  } catch (error) {
    console.error("儲存預算失敗：", error);
    alert("預算儲存失敗，請確認裝置的可用儲存空間。");
    return false;
  }
}

/* =========================
   電子發票手機條碼（僅儲存在本機）
   ========================= */


function normalizeCarrierBarcode(value) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function isValidCarrierBarcode(value) {
  return CARRIER_PATTERN.test(normalizeCarrierBarcode(value));
}

function readCarrierCookie() {
  try {
    const prefix = encodeURIComponent(CARRIER_STORAGE_KEY) + "=";
    const item = document.cookie.split("; ").find((part) => part.startsWith(prefix));
    if (!item) return null;
    return JSON.parse(decodeURIComponent(item.slice(prefix.length)));
  } catch (error) {
    console.error("讀取載具備援設定失敗：", error);
    return null;
  }
}

function loadCarrierSettings() {
  const defaults = { barcode: "", enabled: true };
  let parsed = null;

  try {
    const saved = localStorage.getItem(CARRIER_STORAGE_KEY);
    if (saved) parsed = JSON.parse(saved);
  } catch (error) {
    console.error("讀取載具本機設定失敗：", error);
  }

  // iOS 部分瀏覽情境可能無法穩定保留 localStorage，使用同源 Cookie 作為備援。
  const cookieSettings = readCarrierCookie();
  const localBarcode = normalizeCarrierBarcode(parsed?.barcode);
  const cookieBarcode = normalizeCarrierBarcode(cookieSettings?.barcode);
  const selected = isValidCarrierBarcode(localBarcode) ? parsed : 
    (isValidCarrierBarcode(cookieBarcode) ? cookieSettings : (parsed || cookieSettings));

  if (!selected || typeof selected !== "object") return defaults;
  const barcode = normalizeCarrierBarcode(selected.barcode);
  return {
    barcode: isValidCarrierBarcode(barcode) ? barcode : "",
    enabled: selected.enabled !== false
  };
}

function persistCarrierSettings() {
  let localSaved = false;
  let cookieSaved = false;
  const serialized = JSON.stringify(carrierSettings);

  try {
    localStorage.setItem(CARRIER_STORAGE_KEY, serialized);
    localSaved = localStorage.getItem(CARRIER_STORAGE_KEY) === serialized;
  } catch (error) {
    console.error("儲存載具本機設定失敗：", error);
  }

  try {
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie =
      encodeURIComponent(CARRIER_STORAGE_KEY) + "=" +
      encodeURIComponent(serialized) +
      "; Max-Age=31536000; Path=/; SameSite=Lax" + secure;
    cookieSaved = readCarrierCookie()?.barcode === carrierSettings.barcode &&
      readCarrierCookie()?.enabled === carrierSettings.enabled;
  } catch (error) {
    console.error("儲存載具備援設定失敗：", error);
  }

  updateCarrierButtonVisibility();
  return localSaved || cookieSaved;
}

function updateCarrierButtonVisibility() {
  const button = $("#carrierBtn");
  if (!button) return;
  button.hidden = !carrierSettings.barcode ||
    !carrierSettings.enabled ||
    document.body.dataset.page !== "home";
}

function renderCarrierSettings() {
  const input = $("#carrierBarcodeInput");
  const toggle = $("#carrierEnabledToggle");
  if (input && document.activeElement !== input) {
    input.value = carrierSettings.barcode;
  }
  if (toggle) toggle.checked = carrierSettings.enabled;
  updateCarrierButtonVisibility();
}

function saveCarrierBarcode() {
  const input = $("#carrierBarcodeInput");
  const feedback = $("#carrierSettingsFeedback");
  const barcode = normalizeCarrierBarcode(input?.value || "");

  if (barcode && !isValidCarrierBarcode(barcode)) {
    if (feedback) {
      feedback.textContent = "格式不正確。請輸入「/」開頭、共 8 個字元的手機條碼，例如 /AB12CD3。";
      feedback.classList.add("carrier-feedback-error");
    }
    input?.focus();
    return;
  }

  const previousBarcode = carrierSettings.barcode;
  carrierSettings.barcode = barcode;
  if (!persistCarrierSettings()) {
    carrierSettings.barcode = previousBarcode;
    if (feedback) {
      feedback.textContent = "載具設定儲存失敗，請確認瀏覽器儲存空間後再試。";
      feedback.classList.add("carrier-feedback-error");
    }
    return;
  }

  if (input) input.value = barcode;
  if (feedback) {
    feedback.textContent = barcode ? "載具條碼已儲存在這台裝置。" : "已清除載具條碼，首頁的顯示載具按鈕已隱藏。";
    feedback.classList.remove("carrier-feedback-error");
  }
}

function renderCode39Barcode(value) {
  const container = $("#carrierBarcodeSvg");
  const text = $("#carrierBarcodeText");
  if (!container || !text || !isValidCarrierBarcode(value)) return;

  const patterns = {
    "0": "nnnwwnwnn", "1": "wnnwnnnnw", "2": "nnwwnnnnw",
    "3": "wnwwnnnnn", "4": "nnnwwnnnw", "5": "wnnwwnnnn",
    "6": "nnwwwnnnn", "7": "nnnwnnwnw", "8": "wnnwnnwnn",
    "9": "nnwwnnwnn", "A": "wnnnnwnnw", "B": "nnwnnwnnw",
    "C": "wnwnnwnnn", "D": "nnnnwwnnw", "E": "wnnnwwnnn",
    "F": "nnwnwwnnn", "G": "nnnnnwwnw", "H": "wnnnnwwnn",
    "I": "nnwnnwwnn", "J": "nnnnwwwnn", "K": "wnnnnnnww",
    "L": "nnwnnnnww", "M": "wnwnnnnwn", "N": "nnnnwnnww",
    "O": "wnnnwnnwn", "P": "nnwnwnnwn", "Q": "nnnnnnwww",
    "R": "wnnnnnwwn", "S": "nnwnnnwwn", "T": "nnnnwnwwn",
    "U": "wwnnnnnnw", "V": "nwwnnnnnw", "W": "wwwnnnnnn",
    "X": "nwnnwnnnw", "Y": "wwnnwnnnn", "Z": "nwwnwnnnn",
    "-": "nwnnnnwnw", ".": "wwnnnnwnn", "$": "nwnwnwnnn",
    "/": "nwnwnnnwn", "+": "nwnnnwnwn", "%": "nnnwnwnwn",
    "*": "nwnnwnwnn"
  };
  const encoded = `*${normalizeCarrierBarcode(value)}*`;
  const module = 2;
  const quietZone = 10;
  const barHeight = 82;
  let x = quietZone * module;
  const rects = [];

  [...encoded].forEach((character, characterIndex) => {
    const pattern = patterns[character];
    if (!pattern) return;
    [...pattern].forEach((width, index) => {
      const barWidth = (width === "w" ? 3 : 1) * module;
      if (index % 2 === 0) {
        rects.push(`<rect x="${x}" y="0" width="${barWidth}" height="${barHeight}" />`);
      }
      x += barWidth;
    });
    if (characterIndex < encoded.length - 1) x += module;
  });

  const width = x + quietZone * module;
  container.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${barHeight}" role="img" aria-label="手機條碼" preserveAspectRatio="xMidYMid meet"><rect width="${width}" height="${barHeight}" fill="#fff"/><g fill="#111">${rects.join("")}</g></svg>`;
  text.textContent = normalizeCarrierBarcode(value);
}

function openCarrierDisplay() {
  if (!carrierSettings.barcode || !carrierSettings.enabled) return;
  renderCode39Barcode(carrierSettings.barcode);
  const dialog = $("#carrierDialog");
  if (dialog && !dialog.open) dialog.showModal();
}

function setCarrierEnabled(enabled) {
  const previous = carrierSettings.enabled;
  carrierSettings.enabled = Boolean(enabled);
  if (!persistCarrierSettings()) {
    carrierSettings.enabled = previous;
    const toggle = $("#carrierEnabledToggle");
    if (toggle) toggle.checked = previous;
    const feedback = $("#carrierSettingsFeedback");
    if (feedback) {
      feedback.textContent = "無法儲存開關設定，請確認瀏覽器儲存空間後再試。";
      feedback.classList.add("carrier-feedback-error");
    }
    return;
  }
  const feedback = $("#carrierSettingsFeedback");
  if (feedback) {
    feedback.textContent = carrierSettings.enabled
      ? "已開啟首頁載具按鈕（需先設定有效條碼）。"
      : "已關閉首頁載具按鈕。";
    feedback.classList.remove("carrier-feedback-error");
  }
}

/* =========================
   外觀主題：淺色／深色
   ========================= */

function applyTheme(theme) {
  const selectedTheme = theme === "dark" ? "dark" : "light";

  // 套用至整個網站，供 CSS 根據 data-theme 切換樣式。
  document.documentElement.dataset.theme = selectedTheme;

  const themeSelect = $("#themeSelect");
  if (themeSelect) {
    themeSelect.value = selectedTheme;
  }

  try {
    localStorage.setItem(THEME_STORAGE_KEY, selectedTheme);
  } catch (error) {
    console.error("儲存主題設定失敗：", error);
  }
}

function initializeTheme() {
  let savedTheme = "light";

  try {
    savedTheme = localStorage.getItem(THEME_STORAGE_KEY) || "light";
  } catch (error) {
    console.error("讀取主題設定失敗：", error);
  }

  savedTheme = savedTheme === "dark" ? "dark" : "light";

  const settingsSection = $("#settingsSection");
  const settingsCard = settingsSection?.querySelector(".settings-card");

  if (!settingsCard) {
    console.error("找不到原本的設定卡片，無法加入主題切換。");
    applyTheme(savedTheme);
    return;
  }

  // 如果已存在主題列就沿用，避免重複建立。
  let themeRow = $("#themeSettingsRow");

  if (!themeRow) {
    themeRow = document.createElement("div");
    themeRow.id = "themeSettingsRow";
    themeRow.className = "settings-row";

    themeRow.innerHTML = `
      <div>
        <strong>外觀</strong>
        <p>自訂應用程式的顯示風格</p>
      </div>
      <select id="themeSelect" aria-label="選擇外觀主題">
        <option value="light">☀️ 淺色模式</option>
        <option value="dark">🌙 深色模式</option>
      </select>
    `;

    // 優先放在「資料儲存」設定列之前。
    const settingsRows = [
      ...settingsCard.querySelectorAll(".settings-row")
    ];

    const dataRow = settingsRows.find((row) =>
      row.querySelector("strong")?.textContent.trim() === "資料儲存"
    );

    const note = settingsCard.querySelector(".settings-note");

    if (dataRow) {
      settingsCard.insertBefore(themeRow, dataRow);
    } else if (note) {
      settingsCard.insertBefore(themeRow, note);
    } else {
      settingsCard.appendChild(themeRow);
    }
  }

  const themeSelect = $("#themeSelect");

  if (themeSelect) {
    themeSelect.value = savedTheme;

    // 避免初始化重複綁定事件。
    if (themeSelect.dataset.themeListener !== "true") {
      themeSelect.addEventListener("change", () => {
        applyTheme(themeSelect.value);
      });

      themeSelect.dataset.themeListener = "true";
    }
  }

  // 頁面載入時恢復上次選擇的主題。
  applyTheme(savedTheme);
}

/* =========================
   日期、金額與安全文字
   ========================= */

function localDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function currentMonth() {
  return $("#monthPicker").value || localDate().slice(0, 7);
}

function selectedDate() {
  return $("#datePicker").value || localDate();
}

const calendarState = { mode: "date", targetId: "", year: 0, month: 0 };

function formatDateLabel(value) {
  if (!value) return "選擇日期";
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("zh-TW", {
    year: "numeric", month: "long", day: "numeric", weekday: "short"
  });
}

function formatMonthLabel(value) {
  if (!value) return "選擇月份";
  const [year, month] = value.split("-").map(Number);
  return `${year} 年 ${month} 月`;
}

function syncDateLabels() {
  $("#monthPickerButton").textContent = formatMonthLabel($("#monthPicker").value);
  $("#datePickerButton").textContent = formatDateLabel($("#datePicker").value);
  $("#transactionDateButton").textContent = formatDateLabel($("#transactionDate").value);
}

function openCalendar(mode, targetId) {
  const value = $("#" + targetId).value || (mode === "month" ? localDate().slice(0, 7) : localDate());
  const parts = value.split("-").map(Number);
  calendarState.mode = mode;
  calendarState.targetId = targetId;
  calendarState.year = parts[0] || new Date().getFullYear();
  calendarState.month = (parts[1] || 1) - 1;
  renderCalendar();
  $("#calendarDialog").showModal();
}

function renderCalendar() {
  const { mode, targetId, year, month } = calendarState;
  const grid = $("#calendarGrid");
  const weekdays = $("#calendarWeekdays");
  const monthMode = mode === "month";
  const selectedValue = $("#" + targetId).value;
  $("#calendarTitle").textContent = monthMode ? `${year} 年` : `${year} 年 ${month + 1} 月`;
  weekdays.hidden = monthMode;
  grid.classList.toggle("month-grid", monthMode);
  grid.innerHTML = "";

  if (monthMode) {
    for (let index = 0; index < 12; index += 1) {
      const value = `${year}-${String(index + 1).padStart(2, "0")}`;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "calendar-cell month-cell";
      button.textContent = `${index + 1} 月`;
      button.dataset.calendarValue = value;
      button.dataset.calendarSelect = "month";
      if (value === selectedValue) button.classList.add("selected");
      grid.append(button);
    }
    return;
  }

  const firstDay = new Date(year, month, 1).getDay();
  const dayCount = new Date(year, month + 1, 0).getDate();
  for (let i = 0; i < firstDay; i += 1) {
    const spacer = document.createElement("span");
    spacer.className = "calendar-empty";
    spacer.setAttribute("aria-hidden", "true");
    grid.append(spacer);
  }
  const today = localDate();
  for (let day = 1; day <= dayCount; day += 1) {
    const value = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "calendar-cell";
    button.textContent = String(day);
    button.dataset.calendarValue = value;
    button.dataset.calendarSelect = "date";
    button.setAttribute("aria-label", formatDateLabel(value));
    if (value === selectedValue) button.classList.add("selected");
    if (value === today) button.classList.add("today");
    grid.append(button);
  }
}

function closeCalendar() {
  $("#calendarDialog").close();
}

function chooseCalendarValue(value) {
  $("#" + calendarState.targetId).value = value;
  syncDateLabels();
  closeCalendar();
  if (calendarState.targetId === "monthPicker") render();
  if (calendarState.targetId === "datePicker") renderDay();
}

function moveCalendar(amount) {
  if (calendarState.mode === "month") {
    calendarState.year += amount;
  } else {
    const next = new Date(calendarState.year, calendarState.month + amount, 1);
    calendarState.year = next.getFullYear();
    calendarState.month = next.getMonth();
  }
  renderCalendar();
}

function money(value) {
  return "$" + Math.round(value).toLocaleString("en-US");
}

function formatTWD(value) {
  return "NT$ " + Math.round(value).toLocaleString("en-US");
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

/* =========================
   左側選單與頁面切換
   ========================= */

function initializeMenu() {
  const menuButton = $("#menuBtn");
  const sideMenu = $("#sideMenu");
  const overlay = $("#menuOverlay");
  const closeButton = $("#closeMenuBtn");

  const pages = {
    home: $("#homeSection"),
    budget: $("#budgetSection"),
    records: $("#recordsSection"),
    calendar: $("#calendarSection"),
    settings: $("#settingsSection")
  };

  const menuItems = document.querySelectorAll("[data-page-target]");
  const addButton = $("#addBtn");

  if (!menuButton || !sideMenu || !overlay) {
    console.error("找不到選單元素，請確認 index.html 已更新。");
    return;
  }

  function openMenu() {
    sideMenu.classList.add("open");
    overlay.hidden = false;
    overlay.classList.add("visible");
    document.body.classList.add("menu-open");

    menuButton.setAttribute("aria-expanded", "true");
    sideMenu.setAttribute("aria-hidden", "false");
    sideMenu.inert = false;

    if (closeButton) closeButton.focus();
  }

  function closeMenu(restoreFocus = false) {
    sideMenu.classList.remove("open");
    overlay.classList.remove("visible");
    overlay.hidden = true;
    document.body.classList.remove("menu-open");

    menuButton.setAttribute("aria-expanded", "false");
    sideMenu.setAttribute("aria-hidden", "true");
    sideMenu.inert = true;

    if (restoreFocus) menuButton.focus();
  }

  function showPage(pageName) {
    if (!Object.prototype.hasOwnProperty.call(pages, pageName)) {
      return;
    }

    Object.entries(pages).forEach(([name, section]) => {
      if (section) {
        section.hidden = name !== pageName;
      }
    });

    document.body.dataset.page = pageName;

    menuItems.forEach((item) => {
      const active = item.dataset.pageTarget === pageName;

      item.classList.toggle("active", active);

      if (active) {
        item.setAttribute("aria-current", "page");
      } else {
        item.removeAttribute("aria-current");
      }
    });

    // 新增記帳與載具快捷按鈕只在首頁顯示。
    if (addButton) {
      addButton.hidden = pageName !== "home";
    }
    updateCarrierButtonVisibility();

    closeMenu();

    if (pageName === "home") {
      render();
    } else if (pageName === "budget") {
      renderBudget();
    } else if (pageName === "records") {
      renderQueryRecords();
    } else if (pageName === "calendar") {
      renderPlannerCalendar();
    }
  }

  menuButton.addEventListener("click", () => {
    if (sideMenu.classList.contains("open")) {
      closeMenu(true);
    } else {
      openMenu();
    }
  });

  // 手勢操作：從螢幕任意位置向右滑開啟選單，向左滑關閉。
  let swipeStartX = 0;
  let swipeStartY = 0;
  let swipeTracking = false;
  const swipeThreshold = 75;

  document.addEventListener("touchstart", (event) => {
    if (event.touches.length !== 1) {
      swipeTracking = false;
      return;
    }

    // 有其他對話視窗開啟時，不攔截使用者的滑動操作。
    if (document.querySelector("dialog[open]")) {
      swipeTracking = false;
      return;
    }

    const touch = event.touches[0];

    swipeStartX = touch.clientX;
    swipeStartY = touch.clientY;
    swipeTracking = true;
  }, { passive: true });

  document.addEventListener("touchend", (event) => {
    if (!swipeTracking || event.changedTouches.length !== 1) return;
    swipeTracking = false;

    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - swipeStartX;
    const deltaY = touch.clientY - swipeStartY;
    if (Math.abs(deltaX) < swipeThreshold || Math.abs(deltaX) < Math.abs(deltaY) * 1.35) return;

    if (deltaX > 0 && !sideMenu.classList.contains("open")) {
      openMenu();
    } else if (deltaX < 0 && sideMenu.classList.contains("open")) {
      closeMenu();
    }
  }, { passive: true });

  document.addEventListener("touchcancel", () => {
    swipeTracking = false;
  }, { passive: true });

  closeButton?.addEventListener("click", () => closeMenu(true));
  overlay.addEventListener("click", () => closeMenu(true));

  menuItems.forEach((item) => {
    item.addEventListener("click", () => {
      showPage(item.dataset.pageTarget);
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && sideMenu.classList.contains("open")) {
      closeMenu(true);
    }
  });

  // 讓選單初始狀態與 HTML 一致。
  closeMenu();
  showPage(document.body.dataset.page || "home");
}

/* =========================
   帳目查詢與統計
   ========================= */

function getMonthRecords() {
  return records.filter((record) =>
    typeof record.date === "string" &&
    record.date.startsWith(currentMonth())
  );
}

function getDayRecords() {
  return records.filter((record) => record.date === selectedDate());
}

function sum(recordsToSum, type) {
  return recordsToSum
    .filter((record) => record.type === type)
    .reduce((total, record) => total + (Number(record.amount) || 0), 0);
}

function expenseByCategory(monthRecords) {
  const totals = {};

  categories.expense.forEach((category) => {
    totals[category] = 0;
  });

  monthRecords
    .filter((record) => record.type === "expense")
    .forEach((record) => {
      const category = categories.expense.includes(record.category)
        ? record.category
        : "其他";

      totals[category] += Number(record.amount) || 0;
    });

  return totals;
}

/* =========================
   分類選項
   ========================= */

function updateCategoryOptions(selectedCategory = "") {
  const categorySelect = $("#category");
  if (!categorySelect) return;

  const options = categories[currentType];

  categorySelect.innerHTML = options.map((category) =>
    `<option value="${escapeHTML(category)}">${escapeHTML(category)}</option>`
  ).join("");

  if (options.includes(selectedCategory)) {
    categorySelect.value = selectedCategory;
  }
}

function updateTypeButtons() {
  document.querySelectorAll(".type-button").forEach((button) => {
    const active = button.dataset.type === currentType;

    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  updateCategoryOptions();
}

/* =========================
   月份總覽
   ========================= */

function renderMonth() {
  const monthRecords = getMonthRecords();

  const income = sum(monthRecords, "income");
  const expense = sum(monthRecords, "expense");
  const balance = income - expense;
  const total = income + expense;

  $("#monthIncome").textContent = money(income);
  $("#monthExpense").textContent = money(expense);
  $("#monthBalance").textContent = money(balance);
  $("#monthNet").textContent = money(balance);

  const incomePercent = total ? Math.round(income / total * 100) : 0;
  const expensePercent = total ? 100 - incomePercent : 0;

  $("#incomePercent").textContent = `${incomePercent}%`;
  $("#expensePercent").textContent = `${expensePercent}%`;

  $("#monthRing").style.background = total
    ? `conic-gradient(var(--green) 0% ${incomePercent}%, var(--red) ${incomePercent}% 100%)`
    : "var(--surface-soft, #e8ece9)";

  $("#monthNet").style.color =
    balance > 0 ? "var(--green)" :
    balance < 0 ? "var(--red)" :
    "var(--text)";

  renderBudget();
}

/* =========================
   每日明細
   ========================= */

function renderDay() {
  const dayRecords = getDayRecords();

  $("#dayIncome").textContent = money(sum(dayRecords, "income"));
  $("#dayExpense").textContent = money(sum(dayRecords, "expense"));

  const balance =
    sum(dayRecords, "income") - sum(dayRecords, "expense");

  $("#dayBalance").textContent = money(balance);
  $("#recordCount").textContent = `${dayRecords.length} 筆紀錄`;

  const [, month, day] = selectedDate().split("-");
  $("#listDate").textContent =
    `${Number(month)} 月 ${Number(day)} 日的紀錄`;

  const list = $("#transactionList");

  if (dayRecords.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <span>🪴</span>
        今天還沒有紀錄<br>
        <small>按下方按鈕，開始記下第一筆收支吧！</small>
      </div>`;
    return;
  }

  const sorted = [...dayRecords].sort((a, b) =>
    (b.createdAt || 0) - (a.createdAt || 0)
  );

  list.innerHTML = sorted.map((record) => {
    const isIncome = record.type === "income";
    const sign = isIncome ? "+" : "-";
    const icon = categoryIcons[record.category] || "🧾";
    const detail = [record.payment, record.note].filter(Boolean).join(" · ");

    return `
      <article class="transaction-item">
        <div class="transaction-icon">${icon}</div>
        <div class="transaction-info">
          <strong>${escapeHTML(record.category)}</strong>
          <span>${escapeHTML(detail || "未填寫備註")}</span>
        </div>
        <div class="transaction-right">
          <strong class="transaction-amount ${record.type}">
            ${sign}${money(record.amount)}
          </strong>
          <div class="transaction-actions">
            <button type="button" data-edit="${escapeHTML(record.id)}">編輯</button>
            <button type="button" data-delete="${escapeHTML(record.id)}">刪除</button>
          </div>
        </div>
      </article>`;
  }).join("");
}

/* =========================
   查詢紀錄
   ========================= */

function renderQueryRecords() {
  const list = $("#queryRecordsList");
  const count = $("#queryRecordCount");
  const monthLabel = $("#queryMonthLabel");
  if (!list || !count || !monthLabel) return;

  monthLabel.textContent = currentMonth();
  const minText = $("#queryAmountMin")?.value ?? "";
  const maxText = $("#queryAmountMax")?.value ?? "";
  const minAmount = minText === "" ? null : Number(minText);
  const maxAmount = maxText === "" ? null : Number(maxText);
  const keyword = ($("#queryNote")?.value ?? "").trim().toLocaleLowerCase();
  const payment = $("#queryPayment")?.value ?? "";

  const results = getMonthRecords().filter((record) => {
    const amount = Number(record.amount) || 0;
    if (minAmount !== null && Number.isFinite(minAmount) && amount < minAmount) return false;
    if (maxAmount !== null && Number.isFinite(maxAmount) && amount > maxAmount) return false;
    if (keyword && !(typeof record.note === "string" && record.note.toLocaleLowerCase().includes(keyword))) return false;
    if (payment && (record.payment || "其他") !== payment) return false;
    return true;
  }).sort((a, b) =>
    (b.date || "").localeCompare(a.date || "") || (b.createdAt || 0) - (a.createdAt || 0)
  );

  count.textContent = `${results.length} 筆紀錄`;
  if (!results.length) {
    list.innerHTML = `<div class="empty-state"><span>🔎</span>找不到符合條件的紀錄<br><small>試著調整金額、備註關鍵字或付款方式。</small></div>`;
    return;
  }

  list.innerHTML = results.map((record) => {
    const sign = record.type === "income" ? "+" : "-";
    const icon = categoryIcons[record.category] || "🧾";
    const detail = [record.payment || "其他", record.note].filter(Boolean).join(" · ");
    return `
      <article class="transaction-item">
        <div class="transaction-icon">${icon}</div>
        <div class="transaction-info">
          <strong>${escapeHTML(record.category)}</strong>
          <span>${escapeHTML(record.date)} · ${escapeHTML(detail || "未填寫備註")}</span>
        </div>
        <div class="transaction-right">
          <strong class="transaction-amount ${record.type}">${sign}${money(record.amount)}</strong>
          <div class="transaction-actions">
            <button type="button" data-edit="${escapeHTML(record.id)}">編輯</button>
            <button type="button" data-delete="${escapeHTML(record.id)}">刪除</button>
          </div>
        </div>
      </article>`;
  }).join("");
}

/* =========================
   預算
   ========================= */

function getMonthBudget() {
  const month = currentMonth();

  if (
    !budgets[month] ||
    typeof budgets[month] !== "object" ||
    Array.isArray(budgets[month])
  ) {
    budgets[month] = { total: 0, categories: {} };
  }

  if (
    !budgets[month].categories ||
    typeof budgets[month].categories !== "object" ||
    Array.isArray(budgets[month].categories)
  ) {
    budgets[month].categories = {};
  }

  return budgets[month];
}

function renderBudget() {
  const monthRecords = getMonthRecords();
  const monthBudget = getMonthBudget();

  const totalSpent = sum(monthRecords, "expense");
  const totalBudget = Number(monthBudget.total) || 0;
  const remaining = totalBudget - totalSpent;
  const ratio = totalBudget > 0 ? totalSpent / totalBudget : 0;
  const progress = Math.min(ratio * 100, 100);

  const budgetTotal = $("#budgetTotal");
  const budgetSpent = $("#budgetSpent");
  const budgetRemaining = $("#budgetRemaining");
  const budgetProgress = $("#budgetProgress");
  const budgetProgressBar = $("#budgetProgressBar");
  const budgetStatus = $("#budgetStatus");

  if (
    !budgetTotal ||
    !budgetSpent ||
    !budgetRemaining ||
    !budgetProgress ||
    !budgetProgressBar ||
    !budgetStatus
  ) {
    return;
  }

  // 避免更新畫面時覆蓋使用者正在編輯的預算欄位。
  if (document.activeElement !== budgetTotal) {
    budgetTotal.value = totalBudget > 0 ? totalBudget : "";
  }

  budgetSpent.textContent = formatTWD(totalSpent);
  budgetRemaining.textContent = formatTWD(remaining);

  budgetRemaining.classList.toggle(
    "over-budget",
    totalBudget > 0 && remaining < 0
  );

  budgetProgress.setAttribute(
    "aria-valuenow",
    String(Math.round(progress))
  );

  budgetProgressBar.style.width = `${progress}%`;

  budgetProgressBar.classList.toggle(
    "over-budget",
    totalBudget > 0 && totalSpent > totalBudget
  );

  budgetStatus.className = "budget-status";

  if (totalBudget <= 0) {
    budgetStatus.textContent = "設定總預算後，就能追蹤使用狀況。";
  } else if (totalSpent > totalBudget) {
    budgetStatus.textContent =
      `已超出預算 ${formatTWD(totalSpent - totalBudget)}，留意接下來的支出。`;

    budgetStatus.classList.add("over-budget");
  } else if (ratio >= 0.8) {
    budgetStatus.textContent =
      `已使用 ${Math.round(ratio * 100)}%，快接近本月上限了。`;

    budgetStatus.classList.add("warning");
  } else {
    budgetStatus.textContent =
      `已使用 ${Math.round(ratio * 100)}%，繼續保持。`;
  }

  renderCategoryBudgets(monthBudget, monthRecords);
  renderExpensePie(monthRecords);
}

function renderCategoryBudgets(monthBudget, monthRecords) {
  const totals = expenseByCategory(monthRecords);
  const container = $("#categoryBudgetFields");

  if (!container) return;

  container.innerHTML = categories.expense.map((category) => {
    const budget = Number(monthBudget.categories[category]) || 0;
    const spent = totals[category] || 0;
    const remaining = budget - spent;

    let detail = `已支出 ${formatTWD(spent)}`;

    if (budget > 0) {
      detail += remaining < 0
        ? ` · 超支 ${formatTWD(-remaining)}`
        : ` · 剩餘 ${formatTWD(remaining)}`;
    } else {
      detail += " · 尚未設定上限";
    }

    return `
      <div class="category-budget-row">
        <div>
          <span class="category-budget-name">
            ${categoryIcons[category] || "🧾"} ${escapeHTML(category)}
          </span>
          <span class="category-budget-detail">${escapeHTML(detail)}</span>
        </div>
        <input
          type="number"
          min="0"
          step="1"
          inputmode="numeric"
          placeholder="不設上限"
          aria-label="${escapeHTML(category)}預算"
          data-category-budget="${escapeHTML(category)}"
          value="${budget > 0 ? budget : ""}"
        >
      </div>`;
  }).join("");
}

/* =========================
   分類支出圓餅圖
   ========================= */

function renderExpensePie(monthRecords) {
  const pie = $("#expensePie");
  const legend = $("#expenseLegend");

  if (!pie || !legend) return;

  const totals = expenseByCategory(monthRecords);

  const entries = categories.expense
    .map((category, index) => ({
      category,
      amount: totals[category] || 0,
      color: chartColors[index % chartColors.length]
    }))
    .filter((item) => item.amount > 0);

  const total = entries.reduce(
    (result, item) => result + item.amount,
    0
  );

  if (total <= 0) {
    pie.style.background = "var(--surface-soft, #e8ece9)";
    pie.setAttribute("aria-label", "本月尚無支出");

    legend.innerHTML = `
      <p class="expense-legend-empty">
        本月還沒有支出，記帳後就會顯示圓餅圖。
      </p>`;

    return;
  }

  let accumulated = 0;

  const stops = entries.map((item) => {
    const start = accumulated;
    accumulated += item.amount / total * 100;

    return `${item.color} ${start}% ${accumulated}%`;
  });

  pie.style.background = `conic-gradient(${stops.join(", ")})`;

  pie.setAttribute(
    "aria-label",
    `本月總支出 ${formatTWD(total)}，共 ${entries.length} 個支出分類`
  );

  legend.innerHTML = entries.map((item) => {
    const percentage = item.amount / total * 100;

    return `
      <div class="expense-legend-row">
        <div class="expense-legend-name">
          <span class="expense-legend-dot" style="background:${item.color}"></span>
          <span>
            ${categoryIcons[item.category] || "🧾"}
            ${escapeHTML(item.category)}
            <span style="color:var(--muted,#778078)">
              ${percentage.toFixed(1)}%
            </span>
          </span>
        </div>
        <strong class="expense-legend-value">${formatTWD(item.amount)}</strong>
      </div>`;
  }).join("");
}

/* =========================
   付款方式支出圓餅圖
   ========================= */

function renderPaymentPie(monthRecords = getMonthRecords()) {
  const pie = $("#paymentPie");
  const legend = $("#paymentLegend");
  if (!pie || !legend) return;

  const totals = {};
  monthRecords.filter((record) => record.type === "expense").forEach((record) => {
    const method = paymentMethods.includes(record.payment) ? record.payment : "其他";
    totals[method] = (totals[method] || 0) + (Number(record.amount) || 0);
  });

  const entries = paymentMethods.map((method, index) => ({
    method, amount: totals[method] || 0, color: chartColors[index % chartColors.length]
  })).filter((item) => item.amount > 0);
  const total = entries.reduce((result, item) => result + item.amount, 0);

  if (total <= 0) {
    pie.style.background = "var(--surface-soft, #e8ece9)";
    pie.setAttribute("aria-label", "本月尚無支出");
    legend.innerHTML = `<p class="expense-legend-empty">本月還沒有支出，新增支出紀錄後就會顯示付款方式比例。</p>`;
    return;
  }

  let accumulated = 0;
  const stops = entries.map((item) => {
    const start = accumulated;
    accumulated += item.amount / total * 100;
    return `${item.color} ${start}% ${accumulated}%`;
  });
  pie.style.background = `conic-gradient(${stops.join(", ")})`;
  pie.setAttribute("aria-label", `本月支出總額 ${formatTWD(total)}，依 ${entries.length} 種付款方式分類`);

  legend.innerHTML = entries.map((item) => {
    const percentage = item.amount / total * 100;
    return `
      <div class="expense-legend-row">
        <div class="expense-legend-name">
          <span class="expense-legend-dot" style="background:${item.color}"></span>
          <span>${escapeHTML(item.method)} <span style="color:var(--muted,#778078)">${percentage.toFixed(1)}%</span></span>
        </div>
        <strong class="expense-legend-value">${formatTWD(item.amount)}</strong>
      </div>`;
  }).join("");
}

/* =========================
   儲存預算
   ========================= */

function saveTotalBudget(value) {
  const monthBudget = getMonthBudget();
  const previous = monthBudget.total;
  const amount = value === "" ? 0 : Number(value);

  if (!Number.isFinite(amount) || amount < 0) {
    alert("請輸入有效的非負預算金額。");
    renderBudget();
    return;
  }

  monthBudget.total = amount;

  if (!saveBudgets()) {
    monthBudget.total = previous;
  }

  renderBudget();
}

function saveCategoryBudget(category, value) {
  if (!categories.expense.includes(category)) return;

  const monthBudget = getMonthBudget();
  const previous = monthBudget.categories[category];
  const amount = value === "" ? 0 : Number(value);

  if (!Number.isFinite(amount) || amount < 0) {
    alert("請輸入有效的非負預算金額。");
    renderBudget();
    return;
  }

  monthBudget.categories[category] = amount;

  if (!saveBudgets()) {
    if (previous === undefined) {
      delete monthBudget.categories[category];
    } else {
      monthBudget.categories[category] = previous;
    }
  }

  renderBudget();
}

/* =========================
   新增與編輯紀錄
   ========================= */

function render() {
  renderMonth();
  renderDay();
  renderPaymentPie(getMonthRecords());
  renderQueryRecords();
}

function openForm(record = null) {
  editingId = record ? record.id : null;
  currentType = record ? record.type : "expense";

  $("#formTitle").textContent = record ? "編輯紀錄" : "新增紀錄";
  $("#amount").value = record ? record.amount : "";
  $("#transactionDate").value = record ? record.date : selectedDate();
  syncDateLabels();
  $("#note").value = record ? record.note || "" : "";
  $("#formError").textContent = "";

  updateTypeButtons();

  if (record) {
    updateCategoryOptions(record.category);
    $("#payment").value = record.payment || paymentMethods[0];
  } else {
    $("#payment").value = paymentMethods[0];
  }

  $("#transactionDialog").showModal();
}

function closeForm() {
  $("#transactionDialog").close();
  editingId = null;
}


function saveForm(event) {
  event.preventDefault();

  const amount = Number($("#amount").value);
  const date = $("#transactionDate").value;
  const category = $("#category").value;
  const payment = $("#payment").value;
  const note = $("#note").value.trim();

  if (!Number.isFinite(amount) || amount <= 0) {
    $("#formError").textContent = "請輸入大於 0 的金額。";
    return;
  }

  if (!date) {
    $("#formError").textContent = "請選擇日期。";
    return;
  }

  if (!categories[currentType].includes(category)) {
    $("#formError").textContent = "請選擇有效的分類。";
    return;
  }

  const existing = editingId
    ? records.find((record) => record.id === editingId)
    : null;

  const record = {
    id: editingId || (
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`
    ),
    type: currentType,
    amount: Math.round(amount * 100) / 100,
    date,
    category,
    payment,
    note,
    createdAt: existing ? existing.createdAt : Date.now()
  };

  const previousRecords = [...records];

  if (editingId) {
    records = records.map((item) =>
      item.id === editingId ? record : item
    );
  } else {
    records.push(record);
  }

  if (!saveRecords()) {
    records = previousRecords;
    return;
  }

  $("#datePicker").value = date;
  $("#monthPicker").value = date.slice(0, 7);

  closeForm();
  render();
  showBudgetFeedback(record);
}

let pendingDeleteId = null;
let budgetFeedbackTimer = null;

function deleteRecord(id) {
  const record = records.find((item) => item.id === id);
  if (!record) return;

  pendingDeleteId = id;
  const typeLabel = record.type === "income" ? "收入" : "支出";
  $("#deleteDialogTitle").textContent = `刪除${typeLabel}紀錄？`;
  $("#deleteRecordSummary").textContent = `${record.category} · ${money(record.amount)} · ${record.date}${record.note ? ` · ${record.note}` : ""}`;
  $("#deleteDialog").showModal();
}

function closeDeleteDialog() {
  $("#deleteDialog").close();
  pendingDeleteId = null;
}

function confirmDeleteRecord() {
  if (!pendingDeleteId) return;
  const id = pendingDeleteId;
  const previousRecords = [...records];
  records = records.filter((item) => item.id !== id);

  if (!saveRecords()) {
    records = previousRecords;
    closeDeleteDialog();
    return;
  }

  closeDeleteDialog();
  render();
}

function showBudgetFeedback(record) {
  if (!record || record.type !== "expense") return;

  const month = record.date.slice(0, 7);
  const monthBudget = budgets[month];
  if (!monthBudget || typeof monthBudget !== "object") return;

  const monthRecords = records.filter((item) => typeof item.date === "string" && item.date.startsWith(month));
  const totalBudget = Number(monthBudget.total) || 0;
  const totalSpent = sum(monthRecords, "expense");
  const categoryBudget = Number(monthBudget.categories?.[record.category]) || 0;
  const categorySpent = expenseByCategory(monthRecords)[record.category] || 0;
  const messages = [];

  if (totalBudget > 0) {
    const remaining = totalBudget - totalSpent;
    messages.push(remaining < 0 ? `本月總預算超支 ${money(-remaining)}` : `本月總預算剩餘 ${money(remaining)}`);
  }
  if (categoryBudget > 0) {
    const remaining = categoryBudget - categorySpent;
    messages.push(remaining < 0 ? `${record.category}預算超支 ${money(-remaining)}` : `${record.category}預算剩餘 ${money(remaining)}`);
  }
  if (!messages.length) return;

  const feedback = $("#budgetFeedback");
  if (!feedback) return;
  feedback.textContent = `💰 ${messages.join("\n")}`;
  feedback.classList.add("show");
  clearTimeout(budgetFeedbackTimer);
  budgetFeedbackTimer = setTimeout(() => feedback.classList.remove("show"), 5000);
}

/* =========================
   備份與還原
   ========================= */

function exportBackup() {
  const backup = {
    app: "DragonflyLedger",
    version: 2,
    exportedAt: new Date().toISOString(),
    records,
    budgets
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "蜻蜓牌記帳本備份-" + localDate() + ".json";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function isValidBackupBudgets(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.entries(value).every(([month, monthBudget]) => {
    if (!/^\d{4}-\d{2}$/.test(month)) return false;
    if (!monthBudget || typeof monthBudget !== "object" || Array.isArray(monthBudget)) return false;
    if (monthBudget.total !== undefined &&
        (!Number.isFinite(Number(monthBudget.total)) || Number(monthBudget.total) < 0)) return false;
    const categoryBudgets = monthBudget.categories === undefined ? {} : monthBudget.categories;
    if (!categoryBudgets || typeof categoryBudgets !== "object" || Array.isArray(categoryBudgets)) return false;
    return Object.values(categoryBudgets).every((amount) =>
      Number.isFinite(Number(amount)) && Number(amount) >= 0
    );
  });
}

function importBackup(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const backup = JSON.parse(reader.result);
      if (backup && !Array.isArray(backup) &&
          backup.app !== undefined && backup.app !== "DragonflyLedger") {
        throw new Error("這不是蜻蜓牌記帳本的備份檔");
      }

      const imported = Array.isArray(backup) ? backup : backup?.records;
      if (!Array.isArray(imported)) throw new Error("備份格式不正確，找不到記帳紀錄");

      const validRecords = imported.every((record) =>
        record &&
        typeof record.id === "string" &&
        ["income", "expense"].includes(record.type) &&
        Number.isFinite(Number(record.amount)) &&
        Number(record.amount) > 0 &&
        typeof record.date === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(record.date) &&
        categories[record.type].includes(record.category) &&
        (record.payment === undefined || typeof record.payment === "string") &&
        (record.note === undefined || typeof record.note === "string")
      );
      if (!validRecords) throw new Error("備份內含有不正確的紀錄，原資料未更動");

      const includesBudgets = !Array.isArray(backup) &&
        Object.prototype.hasOwnProperty.call(backup, "budgets");
      if (includesBudgets && !isValidBackupBudgets(backup.budgets)) {
        throw new Error("備份內的預算資料格式不正確，原資料未更動");
      }

      const importedRecords = imported.map((record) => ({
        id: record.id,
        type: record.type,
        amount: Math.round(Number(record.amount) * 100) / 100,
        date: record.date,
        category: record.category,
        payment: paymentMethods.includes(record.payment) ? record.payment : "其他",
        note: typeof record.note === "string" ? record.note : "",
        createdAt: Number(record.createdAt) || 0
      }));
      const importedBudgets = includesBudgets ? backup.budgets : budgets;
      const budgetMessage = includesBudgets
        ? "記帳紀錄與預算都會被這份備份取代。"
        : "這是沒有預算資料的舊版備份，匯入後會保留目前裝置上的預算。";
      const confirmed = window.confirm(
        "即將匯入 " + importedRecords.length + " 筆記帳紀錄。\n" +
        budgetMessage + "\n\n為避免資料遺失，建議先匯出目前資料。確定繼續嗎？"
      );
      if (!confirmed) return;

      // 先保存原始儲存值；若任一項寫入失敗，就回復兩項原始值。
      const previousRecordsRaw = localStorage.getItem(STORAGE_KEY);
      const previousBudgetsRaw = localStorage.getItem(BUDGET_STORAGE_KEY);
      const previousRecords = records;
      const previousBudgets = budgets;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(importedRecords));
        localStorage.setItem(BUDGET_STORAGE_KEY, JSON.stringify(importedBudgets));
      } catch (storageError) {
        try {
          if (previousRecordsRaw === null) localStorage.removeItem(STORAGE_KEY);
          else localStorage.setItem(STORAGE_KEY, previousRecordsRaw);
          if (previousBudgetsRaw === null) localStorage.removeItem(BUDGET_STORAGE_KEY);
          else localStorage.setItem(BUDGET_STORAGE_KEY, previousBudgetsRaw);
        } catch (rollbackError) {
          console.error("還原原始儲存資料時發生錯誤：", rollbackError);
        }
        records = previousRecords;
        budgets = previousBudgets;
        throw new Error("裝置儲存失敗，已嘗試還原匯入前的資料。請確認儲存空間後再試。");
      }

      records = importedRecords;
      budgets = importedBudgets;
      render();
      alert(includesBudgets
        ? "備份匯入成功！記帳紀錄與預算已還原。"
        : "舊版備份匯入成功！記帳紀錄已還原，原有預算已保留。");
    } catch (error) {
      alert("匯入失敗：" + (error.message || "檔案無法讀取"));
    } finally {
      const importInput = $("#importFile");
      if (importInput) importInput.value = "";
    }
  };
  reader.onerror = () => {
    alert("無法讀取這個備份檔，原資料未更動。");
    const importInput = $("#importFile");
    if (importInput) importInput.value = "";
  };
  reader.readAsText(file);
}

function resetAllData() {
  const dialog = $("#resetDialog");
  const input = $("#resetConfirmInput");
  const confirmButton = $("#confirmResetBtn");

  if (!dialog || !input || !confirmButton) {
    alert("重置確認視窗未載入，資料沒有變更。請重新整理後再試。");
    return;
  }

  input.value = "";
  confirmButton.disabled = true;
  try {
    if (!dialog.open) dialog.showModal();
    // 不在開窗時自動聚焦輸入欄，避免 iOS 鍵盤推動畫面造成視窗跳動。
  } catch (error) {
    console.error("無法開啟重置確認視窗：", error);
    const typed = window.prompt("此裝置無法開啟確認視窗。若要清除本機所有記帳紀錄與預算，請輸入 RESET。");
    if (typed === "RESET") executeResetAllData(true);
  }
}

function executeResetAllData(useFallback = false) {
  const input = $("#resetConfirmInput");
  const confirmation = useFallback ? "RESET" : input?.value.trim();
  if (confirmation !== "RESET") return;

  const previousRecordsRaw = localStorage.getItem(STORAGE_KEY);
  const previousBudgetsRaw = localStorage.getItem(BUDGET_STORAGE_KEY);
  const previousRecords = records;
  const previousBudgets = budgets;

  try {
    localStorage.setItem(STORAGE_KEY, "[]");
    localStorage.setItem(BUDGET_STORAGE_KEY, "{}");
  } catch (error) {
    try {
      if (previousRecordsRaw === null) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, previousRecordsRaw);
      if (previousBudgetsRaw === null) localStorage.removeItem(BUDGET_STORAGE_KEY);
      else localStorage.setItem(BUDGET_STORAGE_KEY, previousBudgetsRaw);
    } catch (rollbackError) {
      console.error("重置失敗後還原原始資料時發生錯誤：", rollbackError);
    }
    records = previousRecords;
    budgets = previousBudgets;
    $("#resetDialog")?.close();
    alert("重置失敗，已嘗試保留原有資料。請確認裝置儲存空間。");
    return;
  }

  records = [];
  budgets = {};
  $("#resetDialog")?.close();
  render();
  renderBudget();
  alert("已重置所有記帳紀錄與預算。外觀主題等設定不受影響。");
}


/* =========================
   臨時計算機
   ========================= */
function initializeCalculator() {
  const overlay = $("#calculatorOverlay");
  const display = $("#calculatorResult");
  const expression = $("#calculatorExpression");
  const useResultButton = $("#calculatorUseResult");
  const transactionDialog = $("#transactionDialog");
  const amountInput = $("#amount");
  if (!overlay || !display || !expression) return;
  let currentValue = "0", storedValue = null, pendingOperator = null;
  let waitingForOperand = false, lastOperator = null, lastOperand = null, hasError = false;
  const operatorLabels = { "+": "+", "-": "−", "*": "×", "/": "÷" };
  const formatValue = (value) => {
    if (!Number.isFinite(value)) return "錯誤";
    const rounded = Math.round((value + Number.EPSILON) * 1e10) / 1e10;
    return String(Object.is(rounded, -0) ? 0 : rounded);
  };
  const numericValue = () => Number(currentValue);
  function renderDisplay() {
    display.textContent = currentValue;
    display.classList.toggle("calculator-result-error", hasError);
    useResultButton.hidden = !transactionDialog?.open || hasError || !Number.isFinite(numericValue());
    if (hasError) expression.textContent = "無法完成這項運算";
  }
  function resetCalculator() {
    currentValue = "0"; storedValue = null; pendingOperator = null;
    waitingForOperand = false; lastOperator = null; lastOperand = null; hasError = false;
    expression.textContent = ""; renderDisplay();
  }
  function showCalculator() {
    // 使用原生 modal dialog，確保計算機只在使用者點擊按鈕後開啟，
    // 並能正確疊在「新增記帳」視窗上方。
    if (!overlay.open) overlay.showModal();
    document.body.classList.add("calculator-open");
    renderDisplay();
    $("#calculatorDisplayFocus")?.focus({ preventScroll: true });
  }
  function hideCalculator() {
    if (overlay.open) overlay.close();
    document.body.classList.remove("calculator-open");
    if (transactionDialog?.open) amountInput?.focus({ preventScroll: true });
    else $("#menuBtn")?.focus({ preventScroll: true });
  }
  function calculate(left, operator, right) {
    if (operator === "+") return left + right;
    if (operator === "-") return left - right;
    if (operator === "*") return left * right;
    if (operator === "/") return right === 0 ? NaN : left / right;
    return right;
  }
  function enterDigit(digit) {
    if (hasError) resetCalculator();
    hasError = false;
    if (waitingForOperand) { currentValue = digit; waitingForOperand = false; }
    else if (currentValue.replace("-", "").replace(".", "").length < 14) currentValue = currentValue === "0" ? digit : currentValue + digit;
    renderDisplay();
  }
  function chooseOperator(operator) {
    if (hasError) return;
    const inputValue = numericValue();
    if (pendingOperator && !waitingForOperand) {
      const result = calculate(storedValue, pendingOperator, inputValue);
      if (!Number.isFinite(result)) {
        currentValue = "錯誤"; hasError = true; storedValue = null; pendingOperator = null; renderDisplay(); return;
      }
      currentValue = formatValue(result); storedValue = result;
    } else storedValue = inputValue;
    pendingOperator = operator; waitingForOperand = true; lastOperator = null; lastOperand = null;
    expression.textContent = formatValue(storedValue) + " " + operatorLabels[operator]; renderDisplay();
  }
  function equals() {
    if (hasError) return;
    if (pendingOperator && storedValue !== null) {
      const right = waitingForOperand ? storedValue : numericValue();
      const left = storedValue, op = pendingOperator, result = calculate(left, op, right);
      expression.textContent = formatValue(left) + " " + operatorLabels[op] + " " + formatValue(right) + " =";
      if (!Number.isFinite(result)) { currentValue = "錯誤"; hasError = true; }
      else { currentValue = formatValue(result); lastOperator = op; lastOperand = right; }
      storedValue = null; pendingOperator = null; waitingForOperand = true;
    } else if (lastOperator && lastOperand !== null) {
      const left = numericValue(), result = calculate(left, lastOperator, lastOperand);
      expression.textContent = formatValue(left) + " " + operatorLabels[lastOperator] + " " + formatValue(lastOperand) + " =";
      currentValue = formatValue(result); hasError = !Number.isFinite(result); waitingForOperand = true;
    }
    renderDisplay();
  }
  function handleAction(action) {
    if (action === "clear") return resetCalculator();
    if (hasError) return resetCalculator();
    if (action === "decimal") {
      if (waitingForOperand) { currentValue = "0."; waitingForOperand = false; }
      else if (!currentValue.includes(".")) currentValue += ".";
      renderDisplay();
    } else if (action === "sign") {
      if (numericValue() !== 0) currentValue = currentValue.startsWith("-") ? currentValue.slice(1) : "-" + currentValue;
      renderDisplay();
    } else if (action === "percent") {
      currentValue = formatValue(numericValue() / 100); waitingForOperand = true; renderDisplay();
    } else if (action === "backspace") {
      if (waitingForOperand) return;
      currentValue = currentValue.length <= 1 || (currentValue.length === 2 && currentValue.startsWith("-")) ? "0" : currentValue.slice(0, -1);
      renderDisplay();
    } else if (action === "equals") equals();
  }
  $("#calculatorInlineBtn")?.addEventListener("click", showCalculator);
  $("#calculatorHomeBtn")?.addEventListener("click", showCalculator);
  $("#calculatorClose")?.addEventListener("click", hideCalculator);
  overlay.addEventListener("click", (event) => { if (event.target === overlay) hideCalculator(); });
  $("#calculatorKeys")?.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.calcDigit !== undefined) enterDigit(button.dataset.calcDigit);
    else if (button.dataset.calcOperator) chooseOperator(button.dataset.calcOperator);
    else if (button.dataset.calcAction) handleAction(button.dataset.calcAction);
  });
  useResultButton?.addEventListener("click", () => {
    if (!transactionDialog?.open || hasError) return;
    amountInput.value = formatValue(numericValue());
    hideCalculator();
    amountInput.focus({ preventScroll: true });
    amountInput.dispatchEvent(new Event("input", { bubbles: true }));
  });
  document.addEventListener("keydown", (event) => {
    if (!overlay.open) return;
    if (event.key === "Escape") { event.preventDefault(); hideCalculator(); }
    else if (/^\d$/.test(event.key)) enterDigit(event.key);
    else if (["+", "-", "*", "/"].includes(event.key)) chooseOperator(event.key);
    else if (event.key === "Enter" || event.key === "=") { event.preventDefault(); equals(); }
    else if (event.key === ".") handleAction("decimal");
    else if (event.key === "Backspace") handleAction("backspace");
  });
  // dialog 預設 closed 即保持隱藏；不可設定 hidden，否則 showModal() 後仍可能看不見面板，卻攔截整個頁面的互動。
  renderDisplay();
}

/* =========================
   初始化
   ========================= */

/* =========================
   行事曆與每日行程
   ========================= */
function loadPlannerEvents() {
  try {
    const saved = localStorage.getItem(PLANNER_EVENTS_STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    console.error("讀取行事曆失敗：", error);
    return {};
  }
}

let plannerEvents = loadPlannerEvents();
let plannerMonth = localDate().slice(0, 7);
let plannerSelectedDate = localDate();

function savePlannerEvents() {
  try {
    localStorage.setItem(PLANNER_EVENTS_STORAGE_KEY, JSON.stringify(plannerEvents));
    return true;
  } catch (error) {
    console.error("儲存行事曆失敗：", error);
    alert("行程儲存失敗，可能是瀏覽器儲存空間不足。");
    return false;
  }
}

function formatPlannerDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const weekday = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"][date.getDay()];
  return `${year} 年 ${month} 月 ${day} 日（${weekday}）`;
}

function renderPlannerCalendar() {
  const label = $("#plannerMonthLabel");
  const grid = $("#plannerCalendarGrid");
  if (!label || !grid) return;

  const [year, month] = plannerMonth.split("-").map(Number);
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const today = localDate();
  label.textContent = `${year} 年 ${month} 月`;

  let cells = "";
  for (let i = 0; i < firstWeekday; i += 1) {
    cells += '<span class="planner-day-empty" aria-hidden="true"></span>';
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateString = `${plannerMonth}-${String(day).padStart(2, "0")}`;
    const hasEvents = typeof plannerEvents[dateString] === "string" && plannerEvents[dateString].trim().length > 0;
    const isSelected = dateString === plannerSelectedDate;
    const isToday = dateString === today;
    cells += `<button class="planner-day${isSelected ? " selected" : ""}${isToday ? " today" : ""}${hasEvents ? " has-events" : ""}" type="button" data-planner-date="${dateString}" aria-label="${formatPlannerDate(dateString)}${hasEvents ? "，有行程" : ""}" aria-pressed="${isSelected ? "true" : "false"}"><span class="planner-day-number">${day}</span>${hasEvents ? '<span class="planner-day-dot" aria-hidden="true"></span>' : '<span class="planner-day-dot planner-day-dot-empty" aria-hidden="true"></span>'}</button>`;
  }
  grid.innerHTML = cells;

  $("#plannerSelectedDate").textContent = formatPlannerDate(plannerSelectedDate);
  $("#plannerEventText").value = plannerEvents[plannerSelectedDate] || "";
  $("#plannerSaveStatus").textContent = "";
}

function initializePlannerCalendar() {
  $("#plannerPrevMonth")?.addEventListener("click", () => {
    const [year, month] = plannerMonth.split("-").map(Number);
    const date = new Date(year, month - 2, 1);
    plannerMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    plannerSelectedDate = `${plannerMonth}-01`;
    renderPlannerCalendar();
  });

  $("#plannerNextMonth")?.addEventListener("click", () => {
    const [year, month] = plannerMonth.split("-").map(Number);
    const date = new Date(year, month, 1);
    plannerMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    plannerSelectedDate = `${plannerMonth}-01`;
    renderPlannerCalendar();
  });

  $("#plannerCalendarGrid")?.addEventListener("click", (event) => {
    const dayButton = event.target.closest("[data-planner-date]");
    if (!dayButton) return;
    plannerSelectedDate = dayButton.dataset.plannerDate;
    renderPlannerCalendar();
  });

  $("#plannerSaveEvents")?.addEventListener("click", () => {
    const text = $("#plannerEventText").value.trim();
    if (text) plannerEvents[plannerSelectedDate] = text;
    else delete plannerEvents[plannerSelectedDate];

    if (!savePlannerEvents()) return;
    renderPlannerCalendar();
    $("#plannerSaveStatus").textContent = text ? "行程已儲存 ✓" : "當日行程已清除 ✓";
  });

  $("#plannerClearEvents")?.addEventListener("click", () => {
    $("#plannerEventText").value = "";
    $("#plannerSaveStatus").textContent = "內容已清空，按「儲存行程」後才會套用。";
  });
}

function initialize() {
  // 先恢復外觀設定，再初始化其他介面。
  initializeTheme();

  const today = localDate();

  $("#monthPicker").value = today.slice(0, 7);
  $("#datePicker").value = today;
  $("#transactionDate").value = today;
  syncDateLabels();

  $("#payment").innerHTML = paymentMethods.map((method) =>
    `<option value="${escapeHTML(method)}">${escapeHTML(method)}</option>`
  ).join("");

  $("#queryPayment").innerHTML = `<option value="">全部付款方式</option>` + paymentMethods.map((method) =>
    `<option value="${escapeHTML(method)}">${escapeHTML(method)}</option>`
  ).join("");

  updateCategoryOptions();

  // 載具設定與展示視窗。
  renderCarrierSettings();
  $("#saveCarrierBtn")?.addEventListener("click", saveCarrierBarcode);
  $("#carrierEnabledToggle")?.addEventListener("change", (event) => {
    setCarrierEnabled(event.target.checked);
  });
  $("#carrierBtn")?.addEventListener("click", openCarrierDisplay);
  $("#closeCarrierDialog")?.addEventListener("click", () => $("#carrierDialog")?.close());
  $("#closeCarrierDone")?.addEventListener("click", () => $("#carrierDialog")?.close());
  $("#carrierDialog")?.addEventListener("click", (event) => {
    const dialog = event.currentTarget;
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    const clickedOutside =
      event.clientX < rect.left || event.clientX > rect.right ||
      event.clientY < rect.top || event.clientY > rect.bottom;
    if (clickedOutside) dialog.close();
  });

  // 新增與編輯視窗。
  $("#addBtn").addEventListener("click", () => openForm());
  $("#closeDialog").addEventListener("click", closeForm);
  $("#cancelDialog").addEventListener("click", closeForm);
  $("#transactionForm").addEventListener("submit", saveForm);
  $("#transactionDialog")?.addEventListener("click", (event) => {
    const dialog = event.currentTarget;
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    const clickedOutside =
      event.clientX < rect.left || event.clientX > rect.right ||
      event.clientY < rect.top || event.clientY > rect.bottom;
    if (clickedOutside) closeForm();
  });

  $("#cancelDeleteDialog").addEventListener("click", closeDeleteDialog);
  $("#confirmDeleteRecord").addEventListener("click", confirmDeleteRecord);

  // 收入／支出切換。
  document.querySelectorAll(".type-button").forEach((button) => {
    button.addEventListener("click", () => {
      currentType = button.dataset.type;
      updateTypeButtons();
    });
  });

  // 自訂日期／月份選擇器，避免 iOS 原生 date/month 控制項觸發縮放。
  $("#monthPickerButton").addEventListener("click", () => openCalendar("month", "monthPicker"));
  $("#datePickerButton").addEventListener("click", () => openCalendar("date", "datePicker"));
  $("#transactionDateButton").addEventListener("click", () => openCalendar("date", "transactionDate"));
  $("#calendarPrev").addEventListener("click", () => moveCalendar(-1));
  $("#calendarNext").addEventListener("click", () => moveCalendar(1));
  $("#calendarCancel").addEventListener("click", closeCalendar);
  $("#calendarToday").addEventListener("click", () => {
    const today = localDate();
    chooseCalendarValue(calendarState.mode === "month" ? today.slice(0, 7) : today);
  });
  $("#calendarGrid").addEventListener("click", (event) => {
    const button = event.target.closest("[data-calendar-select]");
    if (button) chooseCalendarValue(button.dataset.calendarValue);
  });

  // 查詢條件即時套用，可同時使用多個條件。
  ["#queryAmountMin", "#queryAmountMax", "#queryNote", "#queryPayment"].forEach((selector) => {
    $(selector).addEventListener("input", renderQueryRecords);
    $(selector).addEventListener("change", renderQueryRecords);
  });
  $("#clearQueryBtn").addEventListener("click", () => {
    $("#queryAmountMin").value = "";
    $("#queryAmountMax").value = "";
    $("#queryNote").value = "";
    $("#queryPayment").value = "";
    renderQueryRecords();
  });

  // 首頁與查詢結果共用編輯、刪除事件。
  const handleRecordActions = (event) => {
    const editButton = event.target.closest("[data-edit]");
    const deleteButton = event.target.closest("[data-delete]");
    if (editButton) {
      const record = records.find((item) => item.id === editButton.dataset.edit);
      if (record) openForm(record);
    }
    if (deleteButton) deleteRecord(deleteButton.dataset.delete);
  };
  $("#transactionList").addEventListener("click", handleRecordActions);
  $("#queryRecordsList").addEventListener("click", handleRecordActions);

  // 每月總預算。
  $("#budgetTotal").addEventListener("change", (event) => {
    saveTotalBudget(event.target.value);
  });

  // 各分類預算。
  $("#categoryBudgetFields").addEventListener("change", (event) => {
    const input = event.target.closest("[data-category-budget]");
    if (!input) return;

    saveCategoryBudget(
      input.dataset.categoryBudget,
      input.value
    );
  });

  // 設定頁的備份／還原功能。
  $("#exportBtn")?.addEventListener("click", exportBackup);
  $("#importBtn")?.addEventListener("click", () => $("#importFile")?.click());
  $("#importFile")?.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (file) importBackup(file);
  });
  $("#cancelResetBtn")?.addEventListener("click", () => $("#resetDialog")?.close());
  $("#resetConfirmInput")?.addEventListener("input", (event) => {
    const valid = event.target.value.trim() === "RESET";
    $("#confirmResetBtn").disabled = !valid;
  });
  $("#confirmResetBtn")?.addEventListener("click", executeResetAllData);

  // 使用事件委派，避免設定頁重繪後「全部重置」失去點擊事件。
  document.addEventListener("click", (event) => {
    if (event.target.closest("#resetAllBtn")) resetAllData();
  });

  // 點擊版本號查看更新紀錄。
  const changelogDialog = $("#changelogDialog");
  $("#versionBtn")?.addEventListener("click", () => changelogDialog?.showModal());
  $("#closeChangelog")?.addEventListener("click", () => changelogDialog?.close());
  $("#closeChangelogFooter")?.addEventListener("click", () => changelogDialog?.close());

  // 行事曆獨立儲存每日行程，不影響記帳資料。
  initializePlannerCalendar();
  renderPlannerCalendar();

  // 臨時計算機獨立運作，不會自動寫入記帳欄位。
  initializeCalculator();

  // 初次渲染與側邊選單。
  render();
  initializeMenu();
}

initialize();
