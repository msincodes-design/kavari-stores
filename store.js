/* ============================================================
   Kavari Stores — API client (shared by shop + portal)
   There is no local database any more: every read and write goes
   to the server, so the shop on a phone and the portal on a
   laptop see exactly the same products, stock and orders.
   ============================================================ */
(function (global) {
  'use strict';

  /* ---------------- config ---------------- */
  const CONFIG = {
    brand: 'Kavari Stores',
    currency: '₦',
    lowStockThreshold: 5,
    shippingFee: 2500,
    freeShippingFrom: 50000,
    storeWhatsApp: '2347062262036',
    storeWhatsAppDisplay: '0706 226 2036',
    adminEmail: 'dayoife28@gmail.com',
    apiBase: '/api',
    pollMs: 20000,
    tokenKey: 'kavari.token'
  };

  const UNITS = ['piece', 'pair', 'set', 'pack', 'bag', 'bottle', 'tin', 'box', 'carton', 'kg', 'litre'];
  const GLYPHS = { Electronics: '🎧', Apparel: '👕', Groceries: '🛒', Home: '🏠', Beauty: '🧴', Stationery: '✏️', Sports: '🏀', Toys: '🧸' };

  /* ---------------- in-memory mirror of the server data ---------------- */
  const state = {
    products: [],
    orders: [],
    movements: [],
    stats: null,
    cart: new Map(),     // productId -> qty, kept in the page only
    loaded: false,
    lastSync: null
  };

  /* ---------------- token (session storage only) ---------------- */
  function getToken() { try { return sessionStorage.getItem(CONFIG.tokenKey) || ''; } catch (_) { return memoryToken; } }
  function setToken(t) {
    memoryToken = t || '';
    try { t ? sessionStorage.setItem(CONFIG.tokenKey, t) : sessionStorage.removeItem(CONFIG.tokenKey); } catch (_) { /* ignore */ }
  }
  let memoryToken = '';

  /* ---------------- low-level request ---------------- */
  async function request(path, { method = 'GET', body, auth = false, timeout = 15000 } = {}) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth) {
      const t = getToken();
      if (!t) throw new ApiError('Sign in to continue.', 401, { needsAuth: true });
      headers['Authorization'] = `Bearer ${t}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    let res;
    try {
      res = await fetch(CONFIG.apiBase + path, {
        method, headers, signal: controller.signal,
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') throw new ApiError('The store took too long to respond. Check your connection and try again.', 0);
      throw new ApiError('Cannot reach the store. Check your internet connection.', 0);
    }
    clearTimeout(timer);

    let payload = null;
    const text = await res.text();
    if (text) { try { payload = JSON.parse(text); } catch (_) { payload = { error: text.slice(0, 200) }; } }

    if (!res.ok) {
      if (res.status === 401 && auth) setToken('');
      throw new ApiError((payload && payload.error) || `Request failed (${res.status})`, res.status, payload || {});
    }
    return payload;
  }

  class ApiError extends Error {
    constructor(message, status, payload) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.payload = payload || {};
      this.errors = this.payload.errors || null;
      this.phase = this.payload.phase || null;
    }
  }

  /* ---------------- public reads ---------------- */
  async function loadProducts() {
    const data = await request('/products');
    state.products = data.products || [];
    state.loaded = true;
    state.lastSync = data.at || new Date().toISOString();
    reconcileCart();
    return state.products;
  }

  async function loadAdmin() {
    const data = await request('/admin/snapshot', { auth: true });
    state.products = data.products || [];
    state.orders = data.orders || [];
    state.movements = data.movements || [];
    state.stats = data.stats || null;
    state.loaded = true;
    state.lastSync = data.at || new Date().toISOString();
    reconcileCart();
    return data;
  }

  /** Drop or clamp cart lines whose stock no longer supports them. */
  function reconcileCart() {
    [...state.cart.entries()].forEach(([id, qty]) => {
      const p = getProduct(id);
      if (!p || p.stock <= 0) state.cart.delete(id);
      else if (qty > p.stock) state.cart.set(id, p.stock);
    });
  }

  /* ---------------- auth ---------------- */
  async function login(email, password) {
    const data = await request('/auth/login', { method: 'POST', body: { email, password } });
    setToken(data.token);
    return data;
  }
  async function verify() {
    if (!getToken()) return null;
    try { const d = await request('/auth/verify', { auth: true }); return d.email; }
    catch (_) { return null; }
  }
  async function logout() {
    try { await request('/auth/logout', { method: 'POST', auth: true }); } catch (_) { /* ignore */ }
    setToken('');
  }
  const isSignedIn = () => !!getToken();

  /* ---------------- admin writes ---------------- */
  async function createProduct(input) {
    const d = await request('/products', { method: 'POST', body: input, auth: true });
    await loadAdmin();
    return d.product;
  }
  async function updateProduct(id, input) {
    const d = await request(`/products/${id}`, { method: 'PUT', body: input, auth: true });
    await loadAdmin();
    return d.product;
  }
  async function deleteProduct(id) {
    const d = await request(`/products/${id}`, { method: 'DELETE', auth: true });
    await loadAdmin();
    return d.deleted;
  }
  async function adjustStock(id, delta, note) {
    const d = await request(`/products/${id}/stock`, { method: 'POST', body: { delta, note }, auth: true });
    await loadAdmin();
    return d.product;
  }
  async function setOrderStatus(id, status) {
    const d = await request(`/orders/${id}/status`, { method: 'POST', body: { status }, auth: true });
    await loadAdmin();
    return d.order;
  }
  async function clearOrders() {
    const d = await request('/orders', { method: 'DELETE', auth: true });
    await loadAdmin();
    return d.cleared;
  }
  async function resetCatalogue() {
    await request('/reset', { method: 'POST', auth: true });
    await loadAdmin();
  }
  async function backup() {
    return request('/backup', { auth: true });
  }

  /* ---------------- orders (public) ---------------- */
  async function placeOrder(customer) {
    const items = cartLines().map((l) => ({ id: l.product.id, qty: l.qty }));
    const d = await request('/orders', { method: 'POST', body: { customer, items } });
    state.cart.clear();
    await loadProducts();
    return d.order;
  }
  async function trackOrder(id) {
    const d = await request(`/order?id=${encodeURIComponent(id)}`);
    return d.order;
  }

  /* ---------------- cart (page-local) ---------------- */
  const getProduct = (id) => state.products.find((p) => p.id === id) || null;
  const cartQty = (id) => state.cart.get(id) || 0;
  const stockAvailable = (p) => (p ? p.stock - cartQty(p.id) : 0);
  const reorderLevel = (p) => (Number.isFinite(p.reorder) && p.reorder > 0 ? p.reorder : CONFIG.lowStockThreshold);
  const isOut = (p) => p.stock <= 0;
  const isLow = (p) => p.stock > 0 && p.stock < reorderLevel(p);
  const stockState = (p) => (isOut(p) ? 'out' : isLow(p) ? 'low' : 'in');
  const categories = () => [...new Set(state.products.map((p) => p.category))].sort();
  const glyphFor = (p) => GLYPHS[p.category] || '📦';
  const lowStockProducts = () => state.products.filter((p) => p.stock < reorderLevel(p));
  const unitLabel = (p, n) => (p && p.unit ? (n === 1 ? p.unit : `${p.unit}s`) : n === 1 ? 'unit' : 'units');

  function addToCart(id, qty = 1) {
    const p = getProduct(id);
    if (!p) return { ok: false, msg: 'Product not found.' };
    if (isOut(p)) return { ok: false, msg: `${p.name} is out of stock.` };
    const current = cartQty(id);
    if (current + qty > p.stock) {
      return { ok: false, msg: `Only ${p.stock} ${unitLabel(p, p.stock)} of ${p.name} available.` };
    }
    state.cart.set(id, current + qty);
    return { ok: true };
  }
  function setCartQty(id, qty) {
    const p = getProduct(id);
    if (!p) { state.cart.delete(id); return { ok: false, msg: 'Product no longer exists.' }; }
    if (qty <= 0) { state.cart.delete(id); return { ok: true }; }
    if (qty > p.stock) {
      state.cart.set(id, p.stock);
      return { ok: false, msg: `Clamped to ${p.stock} — that is all the store holds.` };
    }
    state.cart.set(id, qty);
    return { ok: true };
  }
  const removeFromCart = (id) => state.cart.delete(id);
  function cartLines() {
    const lines = [];
    state.cart.forEach((qty, id) => {
      const p = getProduct(id);
      if (!p || qty <= 0) return;
      lines.push({ product: p, qty, lineTotal: p.price * qty });
    });
    return lines;
  }
  function cartTotals() {
    const subtotal = cartLines().reduce((s, l) => s + l.lineTotal, 0);
    const shipping = subtotal === 0 || subtotal >= CONFIG.freeShippingFrom ? 0 : CONFIG.shippingFee;
    return { subtotal, shipping, total: subtotal + shipping };
  }
  const cartCount = () => [...state.cart.values()].reduce((s, q) => s + q, 0);

  /* ---------------- live polling ---------------- */
  let pollTimer = null;
  function startPolling(onChange, { admin = false, everyMs } = {}) {
    stopPolling();
    const interval = everyMs || CONFIG.pollMs;
    pollTimer = setInterval(async () => {
      if (document.visibilityState === 'hidden') return;
      try {
        const before = fingerprint();
        admin ? await loadAdmin() : await loadProducts();
        if (fingerprint() !== before) onChange && onChange();
      } catch (_) { /* offline — keep the last good data on screen */ }
    }, interval);
  }
  function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }

  function fingerprint() {
    return state.products.map((p) => `${p.id}:${p.stock}:${p.price}:${p.name}:${(p.image || '').length}`).join('|')
      + '#' + state.orders.map((o) => `${o.id}:${o.status}`).join('|');
  }

  /* ---------------- order message formatting ---------------- */
  function orderText(o) {
    const c = o.customer;
    return [
      `*NEW ORDER — ${CONFIG.brand}*`,
      `Order ID: ${o.id}`,
      `Placed: ${fullTime(o.at)}`,
      '',
      '*CUSTOMER*',
      `Name: ${c.name}`,
      `Phone: ${c.phone}`,
      c.email ? `Email: ${c.email}` : null,
      '',
      '*DELIVERY*',
      `Address: ${c.address}`,
      `City/State: ${c.city}`,
      `Method: ${c.delivery}`,
      c.notes ? `Notes: ${c.notes}` : null,
      '',
      '*ITEMS*',
      ...o.items.map((i, n) => `${n + 1}. ${i.name} (${i.sku}) — ${i.qty} × ${money(i.price)} = ${money(i.lineTotal)}`),
      '',
      `Subtotal: ${money(o.subtotal)}`,
      `Delivery: ${o.shipping ? money(o.shipping) : 'Free'}`,
      `*TOTAL: ${money(o.total)}*`,
      `${o.units} unit(s) total`,
      '',
      'Payment: to be agreed with the customer (transfer or on delivery).',
      'Please confirm stock and delivery time.'
    ].filter((l) => l !== null).join('\n');
  }
  const whatsappUrl = (o) => `https://wa.me/${CONFIG.storeWhatsApp}?text=${encodeURIComponent(orderText(o))}`;
  const mailtoUrl = (o) => `mailto:${CONFIG.adminEmail}?subject=${encodeURIComponent(`New order ${o.id} — ${o.customer.name} — ${money(o.total)}`)}&body=${encodeURIComponent(orderText(o))}`;

  /* ---------------- utilities ---------------- */
  const money = (n) => CONFIG.currency + Number(n || 0).toLocaleString('en-NG', { maximumFractionDigits: 2 });
  function moneyShort(n) {
    n = Number(n || 0);
    if (n >= 1e9) return CONFIG.currency + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return CONFIG.currency + (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return CONFIG.currency + (n / 1e3).toFixed(1) + 'k';
    return money(n);
  }
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function timeAgo(iso) {
    const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m} min ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} hr${h === 1 ? '' : 's'} ago`;
    const d = Math.floor(h / 24);
    return `${d} day${d === 1 ? '' : 's'} ago`;
  }
  function fullTime(iso) {
    return new Date(iso).toLocaleString('en-NG', {
      weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true
    });
  }

  function toast(title, text, kind = 'info') {
    const host = document.getElementById('toasts');
    if (!host) return;
    const icons = { success: '✅', warn: '⚠️', error: '⛔', info: 'ℹ️' };
    const el = document.createElement('div');
    el.className = `toast toast--${kind}`;
    el.innerHTML = `<span class="toast__icon">${icons[kind] || icons.info}</span>
      <span class="toast__text"><strong>${esc(title)}</strong>${text ? `<span>${esc(text)}</span>` : ''}</span>`;
    host.appendChild(el);
    setTimeout(() => { el.classList.add('is-out'); setTimeout(() => el.remove(), 240); }, 4200);
  }

  /** Read an image file, downscale it and return a data URL. */
  function fileToImage(file, maxDim = 900, quality = 0.82) {
    return new Promise((resolve, reject) => {
      if (!file) return reject(new Error('No file selected.'));
      if (!/^image\//.test(file.type)) return reject(new Error('That file is not an image.'));
      if (file.size > 8 * 1024 * 1024) return reject(new Error('Image is larger than 8 MB.'));
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Could not read that file.'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('That image could not be decoded.'));
        img.onload = () => {
          const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          try { resolve(canvas.toDataURL('image/jpeg', quality)); }
          catch (_) { reject(new Error('Could not process that image.')); }
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  /* ---------------- export ---------------- */
  global.Kavari = {
    CONFIG, UNITS, state, ApiError,
    loadProducts, loadAdmin, reconcileCart,
    login, logout, verify, isSignedIn,
    createProduct, updateProduct, deleteProduct, adjustStock,
    setOrderStatus, clearOrders, resetCatalogue, backup,
    placeOrder, trackOrder,
    getProduct, cartQty, stockAvailable, reorderLevel, isOut, isLow, stockState,
    categories, glyphFor, lowStockProducts, unitLabel,
    addToCart, setCartQty, removeFromCart, cartLines, cartTotals, cartCount,
    startPolling, stopPolling,
    orderText, whatsappUrl, mailtoUrl,
    money, moneyShort, esc, timeAgo, fullTime, toast, fileToImage
  };
})(window);
