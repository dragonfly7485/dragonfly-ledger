const $ = (selector) => document.querySelector(selector);

const STORAGE_KEY = "dragonfly-ledger-v1";
const BUDGET_STORAGE_KEY = "dragonfly-ledger-budgets-v1";
const THEME_STORAGE_KEY = "dragonfly-ledger-theme-v1";

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
let currentType = "expense";
let editingId = null;

/* =========================
   資料儲存
   ========================= */

function loadRecords() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : [];
    return Array.isArray(parsed) ? parsed : [];
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

    // 新增記帳按鈕只在首頁顯示。
    if (addButton) {
      addButton.hidden = pageName !== "home";
    }

    closeMenu();

    if (pageName === "home") {
      render();
    } else if (pageName === "budget") {
      renderBudget();
    } else if (pageName === "records") {
      renderQueryRecords();
    }
  }

  menuButton.addEventListener("click", () => {
    if (sideMenu.classList.contains("open")) {
      closeMenu(true);
    } else {
      openMenu();
    }
  });

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
  $("#amount").focus();
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
  feedback.textContent = `💰 ${messages.join("　·　")}`;
  feedback.classList.add("show");
  clearTimeout(budgetFeedbackTimer);
  budgetFeedbackTimer = setTimeout(() => feedback.classList.remove("show"), 5000);
}

/* =========================
   備份函式保留，不新增畫面按鈕
   ========================= */

function exportBackup() {
  const backup = {
    app: "DragonflyLedger",
    version: 1,
    exportedAt: new Date().toISOString(),
    records
  };

  const blob = new Blob(
    [JSON.stringify(backup, null, 2)],
    { type: "application/json" }
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `蜻蜓牌記帳本備份-${localDate()}.json`;
  link.click();

  URL.revokeObjectURL(url);
}

function importBackup(file) {
  const reader = new FileReader();

  reader.onload = () => {
    try {
      const backup = JSON.parse(reader.result);
      const imported = Array.isArray(backup)
        ? backup
        : backup.records;

      if (!Array.isArray(imported)) {
        throw new Error("備份格式不正確");
      }

      const valid = imported.every((record) =>
        record &&
        typeof record.id === "string" &&
        ["income", "expense"].includes(record.type) &&
        Number.isFinite(Number(record.amount)) &&
        Number(record.amount) > 0 &&
        typeof record.date === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(record.date) &&
        categories[record.type].includes(record.category)
      );

      if (!valid) {
        throw new Error("備份內有不正確的紀錄");
      }

      if (!confirm(
        "匯入備份會取代這台裝置目前的所有紀錄，確定繼續嗎？"
      )) {
        return;
      }

      const previousRecords = [...records];

      records = imported.map((record) => ({
        id: record.id,
        type: record.type,
        amount: Math.round(Number(record.amount) * 100) / 100,
        date: record.date,
        category: record.category,
        payment: paymentMethods.includes(record.payment)
          ? record.payment
          : "其他",
        note: typeof record.note === "string" ? record.note : "",
        createdAt: Number(record.createdAt) || 0
      }));

      if (!saveRecords()) {
        records = previousRecords;
        return;
      }

      render();
      alert("備份匯入成功！");
    } catch (error) {
      alert(`匯入失敗：${error.message || "檔案無法讀取"}`);
    } finally {
      const importInput = $("#importFile");
      if (importInput) {
        importInput.value = "";
      }
    }
  };

  reader.readAsText(file);
}

/* =========================
   初始化
   ========================= */

function initialize() {
  // 先恢復外觀設定，再初始化其他介面。
  initializeTheme();

  const today = localDate();

  $("#monthPicker").value = today.slice(0, 7);
  $("#datePicker").value = today;
  $("#transactionDate").value = today;

  $("#payment").innerHTML = paymentMethods.map((method) =>
    `<option value="${escapeHTML(method)}">${escapeHTML(method)}</option>`
  ).join("");

  $("#queryPayment").innerHTML = `<option value="">全部付款方式</option>` + paymentMethods.map((method) =>
    `<option value="${escapeHTML(method)}">${escapeHTML(method)}</option>`
  ).join("");

  updateCategoryOptions();

  // 新增與編輯視窗。
  $("#addBtn").addEventListener("click", () => openForm());
  $("#closeDialog").addEventListener("click", closeForm);
  $("#cancelDialog").addEventListener("click", closeForm);
  $("#transactionForm").addEventListener("submit", saveForm);
  $("#cancelDeleteDialog").addEventListener("click", closeDeleteDialog);
  $("#confirmDeleteRecord").addEventListener("click", confirmDeleteRecord);

  // 收入／支出切換。
  document.querySelectorAll(".type-button").forEach((button) => {
    button.addEventListener("click", () => {
      currentType = button.dataset.type;
      updateTypeButtons();
    });
  });

  // 日期與月份篩選。
  $("#monthPicker").addEventListener("change", render);
  $("#datePicker").addEventListener("change", renderDay);

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

  // 備份功能保留原有事件綁定，不新增介面按鈕。
  $("#exportBtn")?.addEventListener("click", exportBackup);

  $("#importBtn")?.addEventListener("click", () => {
    $("#importFile")?.click();
  });

  $("#importFile")?.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (file) {
      importBackup(file);
    }
  });

  // 初次渲染與側邊選單。
  render();
  initializeMenu();
}

initialize();
