// かんたんレジ PWA v1.0（端末内保存）
// 保存先：localStorage

const LS = {
  products: "cashier_products_v1",
  sales: "cashier_sales_v1",
  settings: "cashier_settings_v1",
};

const fmtYen = (n) => (Math.round(n)).toLocaleString("ja-JP");
const nowISO = () => new Date().toISOString();
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}
function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

let settings = loadJSON(LS.settings, { taxRate: 0.10 });
let products = loadJSON(LS.products, []);
let sales = loadJSON(LS.sales, []);
let cart = []; // {productId, qty}

function getTaxRate() {
  const n = Number(settings.taxRate ?? 0.10);
  return Number.isFinite(n) ? n : 0.10;
}

function computeTotals() {
  const taxRate = getTaxRate();
  const lines = cart.map(c => {
    const p = products.find(x => x.id === c.productId);
    if (!p) return null;
    return { ...p, qty: c.qty, line: p.price * c.qty };
  }).filter(Boolean);

  const subtotal = lines.reduce((a, b) => a + b.line, 0);
  const tax = Math.floor(subtotal * taxRate);
  const total = subtotal + tax;
  return { lines, subtotal, tax, total };
}

// ---------------- Tabs ----------------
const tabs = document.querySelectorAll(".tab");
const panels = document.querySelectorAll(".panel");

tabs.forEach(btn => {
  btn.addEventListener("click", () => {
    tabs.forEach(b => b.classList.remove("is-active"));
    panels.forEach(p => p.classList.remove("is-active"));
    btn.classList.add("is-active");
    document.querySelector(`#tab-${btn.dataset.tab}`).classList.add("is-active");

    // refresh per tab
    if (btn.dataset.tab === "pos") renderPOS();
    if (btn.dataset.tab === "products") renderProducts();
    if (btn.dataset.tab === "history") renderHistory();
    if (btn.dataset.tab === "settings") renderSettings();
  });
});

// ---------------- PWA SW ----------------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try { await navigator.serviceWorker.register("./sw.js"); } catch {}
  });
}

// ---------------- POS UI ----------------
const posProductList = document.getElementById("posProductList");
const cartList = document.getElementById("cartList");
const posSearch = document.getElementById("posSearch");
const clearSearch = document.getElementById("clearSearch");
const subtotalEl = document.getElementById("subtotal");
const taxEl = document.getElementById("tax");
const totalEl = document.getElementById("total");
const taxRateLabel = document.getElementById("taxRateLabel");
const cashReceivedEl = document.getElementById("cashReceived");
const changeEl = document.getElementById("change");
const fillExact = document.getElementById("fillExact");
const clearCart = document.getElementById("clearCart");
const completeSale = document.getElementById("completeSale");
const posMsg = document.getElementById("posMsg");

clearSearch.addEventListener("click", () => {
  posSearch.value = "";
  renderPOS();
});
posSearch.addEventListener("input", () => renderPOS());

fillExact.addEventListener("click", () => {
  const { total } = computeTotals();
  cashReceivedEl.value = String(total);
  renderPOS();
});

cashReceivedEl.addEventListener("input", () => renderPOS());

clearCart.addEventListener("click", () => {
  cart = [];
  cashReceivedEl.value = "";
  posMsg.textContent = "カゴを空にしました。";
  renderPOS();
});

completeSale.addEventListener("click", () => {
  const { lines, subtotal, tax, total } = computeTotals();
  if (lines.length === 0) {
    posMsg.textContent = "商品が入っていません。";
    return;
  }
  const cash = Number(String(cashReceivedEl.value).replace(/[^\d]/g, ""));
  if (!Number.isFinite(cash)) {
    posMsg.textContent = "お預かり金額を入力してください。";
    return;
  }
  if (cash < total) {
    posMsg.textContent = `不足しています（あと ${fmtYen(total - cash)} 円）。`;
    return;
  }

  const sale = {
    id: uid(),
    at: nowISO(),
    items: lines.map(x => ({ productId: x.id, name: x.name, price: x.price, qty: x.qty, category: x.category || "" })),
    subtotal,
    tax,
    total,
    cash,
    change: cash - total,
  };
  sales.unshift(sale);
  saveJSON(LS.sales, sales);

  cart = [];
  cashReceivedEl.value = "";
  posMsg.textContent = `会計完了：合計 ${fmtYen(total)} 円 / お釣り ${fmtYen(sale.change)} 円`;
  renderPOS();
});

function addToCart(productId) {
  const found = cart.find(x => x.productId === productId);
  if (found) found.qty += 1;
  else cart.push({ productId, qty: 1 });
  posMsg.textContent = "";
  renderPOS();
}

function changeQty(productId, delta) {
  const c = cart.find(x => x.productId === productId);
  if (!c) return;
  c.qty += delta;
  if (c.qty <= 0) cart = cart.filter(x => x.productId !== productId);
  renderPOS();
}

function removeFromCart(productId) {
  cart = cart.filter(x => x.productId !== productId);
  renderPOS();
}

function renderPOS() {
  const taxRate = getTaxRate();
  taxRateLabel.textContent = `${Math.round(taxRate * 100)}%`;

  // products list
  const q = posSearch.value.trim().toLowerCase();
  const list = products
    .slice()
    .sort((a,b) => (a.name || "").localeCompare(b.name || "", "ja"))
    .filter(p => !q || (p.name + " " + (p.category || "")).toLowerCase().includes(q));

  posProductList.innerHTML = "";
  if (list.length === 0) {
    posProductList.innerHTML = `<div class="item"><div class="meta"><div class="name">商品がありません</div><div class="desc">「商品」タブで登録してね。</div></div></div>`;
  } else {
    list.forEach(p => {
      const el = document.createElement("div");
      el.className = "item";
      el.innerHTML = `
        <div class="meta">
          <div class="name">${escapeHtml(p.name)}</div>
          <div class="desc">${escapeHtml(p.category || "カテゴリなし")}</div>
        </div>
        <div class="right">
          <div class="badge">${fmtYen(p.price)} 円</div>
          <button class="btn primary" data-add="${p.id}">追加</button>
        </div>
      `;
      posProductList.appendChild(el);
    });
  }

  posProductList.querySelectorAll("[data-add]").forEach(btn => {
    btn.addEventListener("click", () => addToCart(btn.dataset.add));
  });

  // cart list + totals
  const { lines, subtotal, tax, total } = computeTotals();
  cartList.innerHTML = "";

  if (lines.length === 0) {
    cartList.innerHTML = `<div class="item"><div class="meta"><div class="name">カゴは空です</div><div class="desc">左の「追加」ボタンで入れてね。</div></div></div>`;
  } else {
    lines.forEach(x => {
      const el = document.createElement("div");
      el.className = "item";
      el.innerHTML = `
        <div class="meta">
          <div class="name">${escapeHtml(x.name)}</div>
          <div class="desc">${escapeHtml(x.category || "カテゴリなし")} / ${fmtYen(x.price)} 円</div>
        </div>
        <div class="right">
          <div class="qty">
            <button data-minus="${x.id}">-</button>
            <div class="n">${x.qty}</div>
            <button data-plus="${x.id}">+</button>
          </div>
          <div class="badge">${fmtYen(x.line)} 円</div>
          <button class="btn ghost" data-remove="${x.id}">削除</button>
        </div>
      `;
      cartList.appendChild(el);
    });

    cartList.querySelectorAll("[data-minus]").forEach(b => b.addEventListener("click", () => changeQty(b.dataset.minus, -1)));
    cartList.querySelectorAll("[data-plus]").forEach(b => b.addEventListener("click", () => changeQty(b.dataset.plus, +1)));
    cartList.querySelectorAll("[data-remove]").forEach(b => b.addEventListener("click", () => removeFromCart(b.dataset.remove)));
  }

  subtotalEl.textContent = fmtYen(subtotal);
  taxEl.textContent = fmtYen(tax);
  totalEl.textContent = fmtYen(total);

  const cash = Number(String(cashReceivedEl.value).replace(/[^\d]/g, "")) || 0;
  const change = Math.max(0, cash - total);
  changeEl.textContent = fmtYen(change);
}

// ---------------- Products UI ----------------
const productForm = document.getElementById("productForm");
const productIdEl = document.getElementById("productId");
const productNameEl = document.getElementById("productName");
const productPriceEl = document.getElementById("productPrice");
const productCategoryEl = document.getElementById("productCategory");
const resetForm = document.getElementById("resetForm");
const productList = document.getElementById("productList");
const productSearch = document.getElementById("productSearch");
const productMsg = document.getElementById("productMsg");
const seedDemo = document.getElementById("seedDemo");

productSearch.addEventListener("input", () => renderProducts());
resetForm.addEventListener("click", () => {
  productIdEl.value = "";
  productNameEl.value = "";
  productPriceEl.value = "";
  productCategoryEl.value = "";
  productMsg.textContent = "入力をリセットしました。";
});

seedDemo.addEventListener("click", () => {
  const demo = [
    { name:"コーヒー", price:450, category:"ドリンク" },
    { name:"紅茶", price:420, category:"ドリンク" },
    { name:"クッキー", price:300, category:"フード" },
    { name:"ケーキ", price:520, category:"フード" },
  ];
  demo.forEach(d => products.push({ id: uid(), ...d }));
  saveJSON(LS.products, products);
  productMsg.textContent = "サンプル商品を追加しました。";
  renderProducts();
  renderPOS();
});

productForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const id = productIdEl.value || uid();
  const name = productNameEl.value.trim();
  const price = Number(String(productPriceEl.value).replace(/[^\d]/g,""));
  const category = productCategoryEl.value.trim();

  if (!name) { productMsg.textContent = "商品名を入力してください。"; return; }
  if (!Number.isFinite(price) || price < 0) { productMsg.textContent = "価格（円）を正しく入力してください。"; return; }

  const exists = products.find(p => p.id === id);
  if (exists) {
    exists.name = name;
    exists.price = price;
    exists.category = category;
    productMsg.textContent = "商品を更新しました。";
  } else {
    products.push({ id, name, price, category });
    productMsg.textContent = "商品を追加しました。";
  }
  saveJSON(LS.products, products);

  productIdEl.value = "";
  productNameEl.value = "";
  productPriceEl.value = "";
  productCategoryEl.value = "";

  renderProducts();
  renderPOS();
});

function editProduct(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  productIdEl.value = p.id;
  productNameEl.value = p.name;
  productPriceEl.value = String(p.price);
  productCategoryEl.value = p.category || "";
  productMsg.textContent = "編集モード：内容を直して保存してね。";
}

function deleteProduct(id) {
  // cartに入っている場合は消えるので自動削除
  products = products.filter(x => x.id !== id);
  cart = cart.filter(x => x.productId !== id);
  saveJSON(LS.products, products);
  productMsg.textContent = "商品を削除しました。";
  renderProducts();
  renderPOS();
}

function renderProducts() {
  const q = productSearch.value.trim().toLowerCase();
  const list = products
    .slice()
    .sort((a,b) => (a.name || "").localeCompare(b.name || "", "ja"))
    .filter(p => !q || (p.name + " " + (p.category || "")).toLowerCase().includes(q));

  productList.innerHTML = "";
  if (list.length === 0) {
    productList.innerHTML = `<div class="item"><div class="meta"><div class="name">商品がありません</div><div class="desc">左で登録してね。</div></div></div>`;
    return;
  }

  list.forEach(p => {
    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `
      <div class="meta">
        <div class="name">${escapeHtml(p.name)}</div>
        <div class="desc">${escapeHtml(p.category || "カテゴリなし")}</div>
      </div>
      <div class="right">
        <div class="badge">${fmtYen(p.price)} 円</div>
        <button class="btn ghost" data-edit="${p.id}">編集</button>
        <button class="btn danger" data-del="${p.id}">削除</button>
      </div>
    `;
    productList.appendChild(el);
  });

  productList.querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", () => editProduct(b.dataset.edit)));
  productList.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", () => deleteProduct(b.dataset.del)));
}

// ---------------- History UI ----------------
const historyList = document.getElementById("historyList");
const exportCsv = document.getElementById("exportCsv");
const clearHistory = document.getElementById("clearHistory");
const saleCount = document.getElementById("saleCount");
const saleSum = document.getElementById("saleSum");
const historyMsg = document.getElementById("historyMsg");

exportCsv.addEventListener("click", () => {
  if (sales.length === 0) { historyMsg.textContent = "履歴がありません。"; return; }
  const csv = buildCSV(sales);
  downloadText(`sales_${new Date().toISOString().slice(0,10)}.csv`, csv, "text/csv");
  historyMsg.textContent = "CSVを出力しました。";
});

clearHistory.addEventListener("click", () => {
  sales = [];
  saveJSON(LS.sales, sales);
  historyMsg.textContent = "履歴を全削除しました。";
  renderHistory();
});

function toggleSale(id) {
  const detail = document.getElementById(`sale-${id}`);
  if (!detail) return;
  detail.style.display = detail.style.display === "none" ? "block" : "none";
}

function renderHistory() {
  saleCount.textContent = String(sales.length);
  const sum = sales.reduce((a,b) => a + (b.total || 0), 0);
  saleSum.textContent = fmtYen(sum) + " 円";

  historyList.innerHTML = "";
  if (sales.length === 0) {
    historyList.innerHTML = `<div class="item"><div class="meta"><div class="name">まだ売上がありません</div><div class="desc">「会計完了」で履歴に残るよ。</div></div></div>`;
    return;
  }

  sales.forEach(s => {
    const dt = new Date(s.at);
    const stamp = `${dt.getFullYear()}/${dt.getMonth()+1}/${dt.getDate()} ${String(dt.getHours()).padStart(2,"0")}:${String(dt.getMinutes()).padStart(2,"0")}`;
    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `
      <div class="meta" style="width:100%;">
        <div class="name">合計 ${fmtYen(s.total)} 円 <span class="badge" style="margin-left:8px;">${stamp}</span></div>
        <div class="desc">小計 ${fmtYen(s.subtotal)} / 税 ${fmtYen(s.tax)} / お預かり ${fmtYen(s.cash)} / お釣り ${fmtYen(s.change)}</div>
        <div id="sale-${s.id}" style="display:none; margin-top:10px;">
          ${s.items.map(it => `
            <div class="desc">・${escapeHtml(it.name)} × ${it.qty}（${fmtYen(it.price)}円）= ${fmtYen(it.price*it.qty)}円</div>
          `).join("")}
        </div>
      </div>
      <div class="right">
        <button class="btn ghost" data-toggle="${s.id}">明細</button>
      </div>
    `;
    historyList.appendChild(el);
  });

  historyList.querySelectorAll("[data-toggle]").forEach(b => b.addEventListener("click", () => toggleSale(b.dataset.toggle)));
}

// ---------------- Settings UI ----------------
const taxRateSel = document.getElementById("taxRate");
const exportJson = document.getElementById("exportJson");
const importJson = document.getElementById("importJson");
const settingsMsg = document.getElementById("settingsMsg");

taxRateSel.addEventListener("change", () => {
  settings.taxRate = Number(taxRateSel.value);
  saveJSON(LS.settings, settings);
  settingsMsg.textContent = "税率を保存しました。";
  renderPOS();
});

exportJson.addEventListener("click", () => {
  const pack = { version: 1, settings, products, sales };
  downloadText(`cashier_backup_${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(pack, null, 2), "application/json");
  settingsMsg.textContent = "JSONを書き出しました。";
});

importJson.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const pack = JSON.parse(text);
    if (!pack || typeof pack !== "object") throw new Error("bad");
    settings = pack.settings ?? settings;
    products = pack.products ?? products;
    sales = pack.sales ?? sales;

    saveJSON(LS.settings, settings);
    saveJSON(LS.products, products);
    saveJSON(LS.sales, sales);

    settingsMsg.textContent = "JSONを読み込みました（上書き）。";
    renderSettings();
    renderProducts();
    renderPOS();
    renderHistory();
  } catch {
    settingsMsg.textContent = "読み込みに失敗しました（JSON形式を確認してね）。";
  } finally {
    importJson.value = "";
  }
});

function renderSettings() {
  taxRateSel.value = String(getTaxRate());
}

// ---------------- Helpers ----------------
function buildCSV(salesArr) {
  // 1行=1商品明細（会計IDで束ねられる）
  const header = ["sale_id","datetime","product_name","category","price","qty","line_total","subtotal","tax","total","cash","change"];
  const rows = [header.join(",")];

  for (const s of salesArr) {
    const dt = new Date(s.at);
    const stamp = dt.toISOString();
    for (const it of s.items) {
      const line = (it.price || 0) * (it.qty || 0);
      const row = [
        escCSV(s.id),
        escCSV(stamp),
        escCSV(it.name),
        escCSV(it.category || ""),
        it.price ?? 0,
        it.qty ?? 0,
        line,
        s.subtotal ?? 0,
        s.tax ?? 0,
        s.total ?? 0,
        s.cash ?? 0,
        s.change ?? 0,
      ];
      rows.push(row.join(","));
    }
  }
  return rows.join("\n");
}

function downloadText(filename, text, mime) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function escCSV(v) {
  const s = String(v ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g,'""')}"`;
  return s;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// ---------------- Init ----------------
renderSettings();
renderProducts();
renderPOS();
renderHistory();
