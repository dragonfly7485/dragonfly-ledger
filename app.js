
const $ = (selector) => document.querySelector(selector);

const STORAGE_KEY = "dragonfly-ledger-v1";

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
  "現金",
  "金融卡",
  "信用卡",
  "銀行轉帳",
  "LINE Pay",
  "街口支付",
  "Apple Pay",
  "Google Pay",
  "悠遊卡",
  "一卡通",
  "其他"
];

let records = loadRecords();
let currentType = "expense";
let editingId = null;

function loadRecords() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveRecords() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    return true;
  } catch (error) {
    console.error("儲存失敗：", error);
    alert("儲存失敗，可能是瀏覽器儲存空間不足。請先匯出備份或清理空間。");
    return false;
  }
}

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

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function getMonthRecords() {
  return records.filter((record) => record.date.startsWith(currentMonth()));
}

function getDayRecords() {
  return records.filter((record) => record.date === selectedDate());
}

function sum(recordsToSum, type) {
  return recordsToSum
    .filter((record) => record.type === type)
    .reduce((total, record) => total + Number(record.amount), 0);
}

function updateCategoryOptions(selectedCategory = "") {
  const categorySelect = $("#category");
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
    : "#e8ece9";

  $("#monthNet").style.color =
    balance > 0 ? "var(--green)" :
    balance < 0 ? "var(--red)" : "var(--text)";
}

function renderDay() {
  const dayRecords = getDayRecords();

  $("#dayIncome").textContent = money(sum(dayRecords, "income"));
  $("#dayExpense").textContent = money(sum(dayRecords, "expense"));

  const balance = sum(dayRecords, "income") - sum(dayRecords, "expense");
  $("#dayBalance").textContent = money(balance);
  $("#recordCount").textContent = `${dayRecords.length} 筆紀錄`;

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

function render() {
  renderMonth();
  renderDay();
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
      crypto.randomUUID
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
    records = records.map((item) => item.id === editingId ? record : item);
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
}

function deleteRecord(id) {
  const record = records.find((item) => item.id === id);
  if (!record) return;

  if (!confirm(`確定刪除這筆${record.type === "income" ? "收入" : "支出"}紀錄嗎？`)) {
    return;
  }

  const previousRecords = [...records];
  records = records.filter((item) => item.id !== id);

  if (!saveRecords()) {
    records = previousRecords;
    return;
  }

  render();
}

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
      const imported = Array.isArray(backup) ? backup : backup.records;

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

      if (!confirm("匯入備份會取代這台裝置目前的所有紀錄，確定繼續嗎？")) {
        return;
      }

      const previousRecords = [...records];
      records = imported.map((record) => ({
        id: record.id,
        type: record.type,
        amount: Math.round(Number(record.amount) * 100) / 100,
        date: record.date,
        category: record.category,
        payment: paymentMethods.includes(record.payment) ? record.payment : "其他",
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
      $("#importFile").value = "";
    }
  };

  reader.readAsText(file);
}

function initialize() {
  const today = localDate();

  $("#monthPicker").value = today.slice(0, 7);
  $("#datePicker").value = today;
  $("#transactionDate").value = today;

  $("#payment").innerHTML = paymentMethods.map((method) =>
    `<option value="${escapeHTML(method)}">${escapeHTML(method)}</option>`
  ).join("");

  updateCategoryOptions();

  $("#addBtn").addEventListener("click", () => openForm());
  $("#closeDialog").addEventListener("click", closeForm);
  $("#cancelDialog").addEventListener("click", closeForm);
  $("#transactionForm").addEventListener("submit", saveForm);

  document.querySelectorAll(".type-button").forEach((button) => {
    button.addEventListener("click", () => {
      currentType = button.dataset.type;
      updateTypeButtons();
    });
  });

  $("#monthPicker").addEventListener("change", renderMonth);
  $("#datePicker").addEventListener("change", renderDay);

  $("#transactionList").addEventListener("click", (event) => {
    const editButton = event.target.closest("[data-edit]");
    const deleteButton = event.target.closest("[data-delete]");

    if (editButton) {
      const record = records.find((item) => item.id === editButton.dataset.edit);
      if (record) openForm(record);
    }

    if (deleteButton) {
      deleteRecord(deleteButton.dataset.delete);
    }
  });

  $("#exportBtn")?.addEventListener("click", exportBackup);

  $("#importBtn")?.addEventListener("click", () => {
    $("#importFile").click();
  });

  $("#importFile")?.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (file) importBackup(file);
  });

  render();
}

initialize();
