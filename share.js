const API_URL = "https://script.google.com/macros/s/AKfycbxWqevi5VEAa7pUACr2r9IcRwyeRGzha5m9xLZkMMXLH5TXLHPtxMi1kAXQTFgqGaas/exec";

const pairTitle = document.getElementById("pairTitle");
const pairDebtResult = document.getElementById("pairDebtResult");
const pairRecordList = document.getElementById("pairRecordList");

function formatMoney(amount) {
  return `NT$${Number(amount).toLocaleString("zh-TW", {
    maximumFractionDigits: 2
  })}`;
}

function formatDate(dateString) {
  if (!dateString) return "";
  return String(dateString).slice(0, 10).replaceAll("-", ".");
}

function escapeHTML(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function fetchWithTimeout(url, timeout = 15000) {
  const controller = new AbortController();

  const timer = setTimeout(() => {
    controller.abort();
  }, timeout);

  try {
    const response = await fetch(url, {
      signal: controller.signal
    });

    clearTimeout(timer);
    return response;

  } catch (error) {
    clearTimeout(timer);
    throw error;
  }
}

async function loadPairData() {
  const params = new URLSearchParams(location.search);
  const token = params.get("token");

  if (!token) {
    pairTitle.textContent = "分享連結錯誤";
    pairDebtResult.textContent = "缺少 token";
    return;
  }

  const url = new URL(API_URL);
  url.searchParams.set("action", "getPair");
  url.searchParams.set("token", token);

  try {
    const response = await fetchWithTimeout(url.toString());
    const text = await response.text();

    let data;

    try {
      data = JSON.parse(text);
    } catch (error) {
      console.error("API 回傳不是 JSON：", text);
      throw new Error("後端回傳格式不是 JSON，可能是 Apps Script 部署或權限有問題");
    }

    if (!data.ok) {
      throw new Error(data.error || "讀取失敗");
    }

    renderPairData(data);

  } catch (error) {
    console.error(error);

    pairTitle.textContent = "讀取失敗";

    if (error.name === "AbortError") {
      pairDebtResult.textContent = "讀取逾時，Apps Script 可能沒有回應";
    } else {
      pairDebtResult.textContent = error.message;
    }

    pairRecordList.innerHTML = `<div class="empty">目前無法載入明細</div>`;
  }
}

function renderPairData(data) {
  const personName = data.person.name;
  const balance = Number(data.balance);

  pairTitle.textContent = `我跟 ${escapeHTML(personName)} 的明細`;

  pairDebtResult.className = "pair-debt-result";

  if (balance > 0) {
    pairDebtResult.classList.add("receive");
    pairDebtResult.textContent = `${personName} 須給 我 ${formatMoney(balance)}`;
  } else if (balance < 0) {
    pairDebtResult.classList.add("pay");
    pairDebtResult.textContent = `我 須給 ${personName} ${formatMoney(Math.abs(balance))}`;
  } else {
    pairDebtResult.classList.add("clear");
    pairDebtResult.textContent = "目前互不相欠";
  }

  pairRecordList.innerHTML = "";

  if (!data.records || data.records.length === 0) {
    pairRecordList.innerHTML = `<div class="empty">目前沒有分帳明細</div>`;
    return;
  }

  data.records
    .sort((a, b) => {
      if (a.date !== b.date) {
        return String(b.date).localeCompare(String(a.date));
      }

      return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    })
    .forEach((record) => {
      const item = document.createElement("div");
      item.className = "pair-record-item";

      const debtsHTML = record.pairDebts
        .map((debt) => {
          const fromName = debt.from === "me" ? "我" : personName;
          const toName = debt.to === "me" ? "我" : personName;
          const actionText = debt.type === "repayment" ? "還給" : "欠";

          return `
            <div>
              ${escapeHTML(fromName)} ${actionText} ${escapeHTML(toName)} ${formatMoney(debt.amount)}
            </div>
          `;
        })
        .join("");

      const noteHTML = record.note
        ? `<div class="pair-record-note">備註：${escapeHTML(record.note)}</div>`
        : "";

      const payerHTML =
        record.payerId !== "me"
          ? `<div class="pair-record-meta">付款人：${escapeHTML(record.payerName)}</div>`
          : "";

      item.innerHTML = `
        <div class="pair-record-title">
          ${formatDate(record.date)}
          ｜${escapeHTML(record.category)}
          ｜${formatMoney(record.amount)}
        </div>

        ${payerHTML}

        ${noteHTML}

        <div class="pair-record-debt">
          ${debtsHTML}
        </div>
      `;

      pairRecordList.appendChild(item);
    });
}

loadPairData();
