const API_URL = "https://script.google.com/macros/s/AKfycbxWqevi5VEAa7pUACr2r9IcRwyeRGzha5m9xLZkMMXLH5TXLHPtxMi1kAXQTFgqGaas/exec";

let people = [];
let records = [];

const personNameInput = document.getElementById("personNameInput");
const addPersonBtn = document.getElementById("addPersonBtn");
const peopleList = document.getElementById("peopleList");

const recordForm = document.getElementById("recordForm");
const dateInput = document.getElementById("dateInput");
const typeInput = document.getElementById("typeInput");
const amountInput = document.getElementById("amountInput");
const categoryInput = document.getElementById("categoryInput");
const payerInput = document.getElementById("payerInput");
const noteInput = document.getElementById("noteInput");
const splitPeopleList = document.getElementById("splitPeopleList");

const totalExpense = document.getElementById("totalExpense");
const totalIncome = document.getElementById("totalIncome");
const netTotal = document.getElementById("netTotal");
const debtList = document.getElementById("debtList");
const recordList = document.getElementById("recordList");

function getAdminKey() {
  let key = localStorage.getItem("account_book_admin_key");

  if (!key) {
    key = prompt("請輸入管理密碼");

    if (key) {
      localStorage.setItem("account_book_admin_key", key);
    }
  }

  return key;
}

async function apiGet(action, params = {}) {
  const url = new URL(API_URL);

  url.searchParams.set("action", action);

  Object.keys(params).forEach((key) => {
    url.searchParams.set(key, params[key]);
  });

  const response = await fetch(url.toString());
  const data = await response.json();

  if (!data.ok) {
    throw new Error(data.error || "讀取失敗");
  }

  return data;
}

async function apiPost(action, params = {}) {
  const body = new URLSearchParams();

  body.set("action", action);

  Object.keys(params).forEach((key) => {
    body.set(key, params[key]);
  });

  const response = await fetch(API_URL, {
    method: "POST",
    body
  });

  const data = await response.json();

  if (!data.ok) {
    throw new Error(data.error || "寫入失敗");
  }

  return data;
}

function createId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function formatMoney(amount) {
  return `NT$${Number(amount).toLocaleString("zh-TW", {
    maximumFractionDigits: 2
  })}`;
}

function formatDate(dateString) {
  if (!dateString) return "";
  return String(dateString).slice(0, 10).replaceAll("-", ".");
}

function saveData() {
  // 資料已改由 Google Sheet 儲存
}

async function loadData() {
  const data = await apiGet("getAll", {
    adminKey: getAdminKey()
  });

  people = data.people.map((person) => ({
    id: person.personId,
    name: person.name,
    token: person.token
  }));

  records = data.records
    .map((record) => ({
      id: record.recordId,
      date: record.date,
      type: record.type,
      amount: Number(record.amount),
      category: record.category,
      payerId: record.payerId,
      note: record.note || "",
      createdAt: record.createdAt || "",
      splits: record.splits.map((split) => ({
        personId: split.personId,
        amount: Number(split.amount)
      }))
    }))
    .sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();

      if (dateA !== dateB) {
        return dateB - dateA; // 日期新到舊
      }

      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
}

function getPersonName(personId) {
  const person = people.find((item) => item.id === personId);
  return person ? person.name : "未知";
}

function setTodayAsDefault() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  dateInput.value = `${yyyy}-${mm}-${dd}`;
}

async function addPerson() {
  const name = personNameInput.value.trim();

  if (!name) {
    alert("請輸入分帳人名字");
    return;
  }

  try {
    await apiPost("addPerson", {
      adminKey: getAdminKey(),
      name
    });

    personNameInput.value = "";

    await loadData();
    render();

  } catch (error) {
    alert(error.message);
  }
}

function calculateSplits(totalAmount) {
  const checkedRows = [...document.querySelectorAll(".split-check:checked")];

  if (checkedRows.length === 0) {
    return [];
  }

  const splitData = checkedRows.map((checkbox) => {
    const personId = checkbox.dataset.personId;
    const amountInputElement = document.querySelector(
      `.split-amount[data-person-id="${personId}"]`
    );

    const rawAmount = amountInputElement.value.trim();

    return {
      personId,
      rawAmount,
      amount: rawAmount === "" ? null : Number(rawAmount)
    };
  });

  const fixedSplits = splitData.filter((item) => item.amount !== null);
  const emptySplits = splitData.filter((item) => item.amount === null);

  const fixedTotal = fixedSplits.reduce((sum, item) => sum + item.amount, 0);

  if (fixedSplits.some((item) => item.amount <= 0)) {
    alert("分帳金額要大於 0");
    return null;
  }

  if (fixedTotal > totalAmount) {
    alert("分帳金額加總不能超過總金額");
    return null;
  }

  if (emptySplits.length === 0) {
    return splitData.map((item) => ({
      personId: item.personId,
      amount: roundMoney(item.amount)
    }));
  }

  const remainingAmount = totalAmount - fixedTotal;
  const averageAmount = remainingAmount / emptySplits.length;

  return splitData.map((item) => ({
    personId: item.personId,
    amount: roundMoney(item.amount === null ? averageAmount : item.amount)
  }));
}

function roundMoney(amount) {
  return Math.round(Number(amount) * 100) / 100;
}

async function addRecord(event) {
  event.preventDefault();

  const date = dateInput.value;
  const type = typeInput.value;
  const amount = Number(amountInput.value);
  const category = categoryInput.value.trim();
  const payerId = payerInput.value;
  const note = noteInput.value.trim();

  if (!date || !type || !amount || !category || !payerId) {
    alert("請把必填欄位填完");
    return;
  }

  if (amount <= 0) {
    alert("金額要大於 0");
    return;
  }

  let splits = [];

  if (type === "expense") {
    const result = calculateSplits(amount);

    if (result === null) {
      return;
    }

    splits = result;
  }

  try {
    await apiPost("addRecord", {
      adminKey: getAdminKey(),
      date,
      type,
      amount,
      category,
      payerId,
      note,
      splits: JSON.stringify(splits)
    });

    recordForm.reset();
    setTodayAsDefault();

    await loadData();
    render();

  } catch (error) {
    alert(error.message);
  }
}

function deleteRecord(recordId) {
  const yes = confirm("確定要刪除這筆紀錄嗎？");

  if (!yes) return;

  records = records.filter((record) => record.id !== recordId);
  saveData();
  render();
}

function calculateDebts() {
  const debtMap = new Map();

  records.forEach((record) => {
    if (record.type !== "expense") return;

    record.splits.forEach((split) => {
      const debtorId = split.personId;
      const creditorId = record.payerId;
      const amount = Number(split.amount);

      if (debtorId === creditorId) return;
      if (amount <= 0) return;

      const pair = [debtorId, creditorId].sort();
      const key = `${pair[0]}__${pair[1]}`;

      let current = debtMap.get(key) || 0;

      if (debtorId === pair[0] && creditorId === pair[1]) {
        current += amount;
      } else {
        current -= amount;
      }

      debtMap.set(key, roundMoney(current));
    });
  });

  const debts = [];

  debtMap.forEach((amount, key) => {
    if (amount === 0) return;

    const [personA, personB] = key.split("__");

    if (amount > 0) {
      debts.push({
        from: personA,
        to: personB,
        amount
      });
    } else {
      debts.push({
        from: personB,
        to: personA,
        amount: Math.abs(amount)
      });
    }
  });

  return debts;
}

function renderPeople() {
  peopleList.innerHTML = "";

  people.forEach((person) => {
    const tag = document.createElement("div");
    tag.className = "person-tag";

    if (person.id === "me") {
      tag.textContent = person.name;
    } else {
      const basePath = location.pathname.replace("index.html", "");
      const shareUrl = `${location.origin}${basePath}share.html?token=${person.token}`;

      tag.innerHTML = `
        ${escapeHTML(person.name)}
        <button
          type="button"
          onclick="copyText('${shareUrl}')"
          style="margin-left: 8px; padding: 4px 8px; font-size: 12px;"
        >
          複製分享連結
        </button>
      `;
    }

    peopleList.appendChild(tag);
  });
}

function copyText(text) {
  navigator.clipboard.writeText(text);
  alert("已複製分享連結");
}

function renderPayerOptions() {
  payerInput.innerHTML = "";

  people.forEach((person) => {
    const option = document.createElement("option");
    option.value = person.id;
    option.textContent = person.name;
    payerInput.appendChild(option);
  });
}

function renderSplitPeople() {
  splitPeopleList.innerHTML = "";

  people.forEach((person) => {
    const row = document.createElement("div");
    row.className = "split-row";

    row.innerHTML = `
      <input
        class="split-check"
        type="checkbox"
        data-person-id="${person.id}"
      />

      <span>${person.name}</span>

      <input
        class="split-amount"
        type="number"
        min="1"
        step="1"
        placeholder="可選填金額"
        data-person-id="${person.id}"
      />
    `;

    splitPeopleList.appendChild(row);
  });
}

function renderSummary() {
  const expense = records
    .filter((record) => record.type === "expense")
    .reduce((sum, record) => sum + Number(record.amount), 0);

  const income = records
    .filter((record) => record.type === "income")
    .reduce((sum, record) => sum + Number(record.amount), 0);

  totalExpense.textContent = formatMoney(expense);
  totalIncome.textContent = formatMoney(income);
  netTotal.textContent = formatMoney(income - expense);
}

function renderDebts() {
  const debts = calculateDebts();

  debtList.innerHTML = "";

  if (debts.length === 0) {
    debtList.innerHTML = `<div class="empty">目前沒有欠款</div>`;
    return;
  }

  debts.forEach((debt) => {
    const item = document.createElement("div");
    item.className = "debt-item";
    item.textContent = `${getPersonName(debt.from)} 欠 ${getPersonName(debt.to)} ${formatMoney(debt.amount)}`;
    debtList.appendChild(item);
  });
}

function renderRecords() {
  recordList.innerHTML = "";

  if (records.length === 0) {
    recordList.innerHTML = `<div class="empty">目前沒有明細</div>`;
    return;
  }

  records.forEach((record) => {
    const item = document.createElement("div");
    item.className = "record-item";

    const typeText = record.type === "expense" ? "支出" : "收入";
    const typeClass = record.type === "expense" ? "type-expense" : "type-income";

    const splitHTML =
      record.type === "expense" && record.splits.length > 0
        ? record.splits
            .map((split) => {
              return `<div>${getPersonName(split.personId)}：${formatMoney(split.amount)}</div>`;
            })
            .join("")
        : `<div>這筆沒有分帳</div>`;

    const noteHTML = record.note
      ? `<div class="record-note">備註：${escapeHTML(record.note)}</div>`
      : "";

    item.innerHTML = `
      <div class="record-head">
        <div>
          <div class="record-title">
            ${formatDate(record.date)}
            ｜<span class="${typeClass}">${typeText}</span>
            ｜${escapeHTML(record.category)}
            ｜${formatMoney(record.amount)}
          </div>

          <div class="record-meta">
            ${record.type === "expense" ? "付款人" : "收款人"}：${getPersonName(record.payerId)}
          </div>
        </div>

        <button class="delete-btn" type="button" onclick="deleteRecord('${record.id}')">
          刪除
        </button>
      </div>

      ${noteHTML}

      <div class="split-detail">
        <strong>分帳明細</strong>
        ${splitHTML}
      </div>
    `;

    recordList.appendChild(item);
  });
}

function escapeHTML(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function render() {
  renderPeople();
  renderPayerOptions();
  renderSplitPeople();
  renderSummary();
  renderDebts();
  renderRecords();
}

addPersonBtn.addEventListener("click", addPerson);
recordForm.addEventListener("submit", addRecord);

personNameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    addPerson();
  }
});

async function init() {
  try {
    await loadData();
    setTodayAsDefault();
    render();
  } catch (error) {
    alert(error.message);
  }
}

init();
