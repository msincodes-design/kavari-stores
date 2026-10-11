/* ============================================================
   Kavari Stores — Inventory Portal (admin only)
   All data comes from the server. The session token is issued by
   the server on sign-in and required for every write.
   ============================================================ */
(() => {
  'use strict';

  const K = window.Kavari;
  const { state, CONFIG } = K;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const money = K.money;
  const esc = K.esc;

  let adminEmail = '';
  const filters = { q: '', category: 'All', stock: 'all', sort: 'name', orders: 'all' };
  let editingId = null;
  let pendingConfirm = null;
  let stockTargetId = null;
  let pendingImage = '';

  /* =========================================================
     AUTH
     ========================================================= */
  async function requireSession() {
    const email = await K.verify();
    if (!email) { window.location.replace('login.html'); return false; }
    adminEmail = email;
    return true;
  }

  function handleAuthFailure(err) {
    if (err && err.status === 401) {
      K.toast('Session expired', 'Please sign in again.', 'warn');
      setTimeout(() => window.location.replace('login.html'), 900);
      return true;
    }
    return false;
  }

  /* =========================================================
     RENDER: INVENTORY
     ========================================================= */
  function filteredInventory() {
    let list = state.products.slice();
    if (filters.category !== 'All') list = list.filter((p) => p.category === filters.category);
    if (filters.stock === 'low') list = list.filter((p) => p.stock < K.reorderLevel(p));
    if (filters.stock === 'out') list = list.filter((p) => p.stock <= 0);
    if (filters.stock === 'healthy') list = list.filter((p) => p.stock >= K.reorderLevel(p));
    if (filters.q) {
      const q = filters.q.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.category.toLowerCase().includes(q));
    }
    switch (filters.sort) {
      case 'stock-asc':  list.sort((a, b) => a.stock - b.stock); break;
      case 'stock-desc': list.sort((a, b) => b.stock - a.stock); break;
      case 'value-desc': list.sort((a, b) => b.price * b.stock - a.price * a.stock); break;
      default:           list.sort((a, b) => a.name.localeCompare(b.name));
    }
    return list;
  }

  function renderInventoryFilters() {
    const cats = ['All', ...K.categories()];
    $('#invCategory').innerHTML = cats.map((c) =>
      `<option value="${esc(c)}" ${c === filters.category ? 'selected' : ''}>${c === 'All' ? 'All categories' : esc(c)}</option>`).join('');
    $('#invStock').value = filters.stock;
    $('#invSort').value = filters.sort;
  }

  function renderInventory() {
    renderInventoryFilters();
    const list = filteredInventory();
    const body = $('#invBody');

    if (!list.length) {
      body.innerHTML = `<tr><td colspan="8"><div class="empty" style="border:none;background:none;padding:44px 10px">
        <div class="empty__glyph">🗃️</div>
        <h3>No products found</h3>
        <p>${state.products.length ? 'Adjust the search or filters above.' : 'Add your first product to start tracking stock.'}</p>
      </div></td></tr>`;
    } else {
      body.innerHTML = list.map((p) => {
        const s = K.stockState(p);
        const rowClass = s === 'out' ? 'is-out' : s === 'low' ? 'is-low' : '';
        const stockClass = s === 'out' ? 'stock-cell--out' : s === 'low' ? 'stock-cell--low' : '';
        const status = s === 'out' ? '<span class="badge badge--out">Out of stock</span>'
          : s === 'low' ? `<span class="badge badge--low">Low · ${K.reorderLevel(p)}</span>`
          : '<span class="badge badge--in">Healthy</span>';
        const thumb = p.image
          ? `<span class="cell-product__thumb cell-product__thumb--img" style="background-image:url('${esc(p.image)}')"></span>`
          : `<span class="cell-product__thumb">${K.glyphFor(p)}</span>`;

        return `<tr class="${rowClass}">
          <td>
            <div class="cell-product">
              ${thumb}
              <span>
                <span class="cell-product__name">${esc(p.name)}</span>
                <span class="cell-product__sub">${esc(p.category)} · per ${esc(p.unit || 'piece')}${p.featured ? ' · ★ featured' : ''}</span>
              </span>
            </div>
          </td>
          <td><span class="mono">${esc(p.sku)}</span></td>
          <td>${esc(p.category)}</td>
          <td class="num">${money(p.price)}</td>
          <td class="num"><span class="stock-cell ${stockClass}">${p.stock}</span></td>
          <td>${status}</td>
          <td class="num strong-num">${money(p.price * p.stock)}</td>
          <td class="right">
            <span class="row-actions">
              <button class="act" data-stock="${p.id}" title="Adjust stock" aria-label="Adjust stock for ${esc(p.name)}">
                <svg class="ic" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
              </button>
              <button class="act" data-edit="${p.id}" title="Edit product" aria-label="Edit ${esc(p.name)}">
                <svg class="ic" viewBox="0 0 24 24"><path d="M4 20h4l10-10-4-4L4 16v4zM14 6l4 4"/></svg>
              </button>
              <button class="act act--danger" data-del="${p.id}" title="Delete product" aria-label="Delete ${esc(p.name)}">
                <svg class="ic" viewBox="0 0 24 24"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v6M14 11v6"/></svg>
              </button>
            </span>
          </td>
        </tr>`;
      }).join('');
    }

    const shown = list.reduce((s, p) => s + p.price * p.stock, 0);
    $('#invFoot').textContent = `Showing ${list.length} of ${state.products.length} products · filtered retail value ${money(shown)}`;
  }

  /* =========================================================
     RENDER: DASHBOARD
     ========================================================= */
  function renderMetrics() {
    const value = K.state.stats ? state.stats.stockValue : state.products.reduce((s, p) => s + p.price * p.stock, 0);
    const cost = K.state.stats ? state.stats.costValue : 0;

    $('#mValue').textContent = K.moneyShort(value);
    $('#mValueHint').textContent = cost > 0 ? `${money(cost)} at cost · ${money(value - cost)} potential margin` : 'Retail value at selling price';

    $('#mItems').textContent = state.products.length;
    $('#mItemsHint').textContent = `${K.state.stats ? K.state.stats.units.toLocaleString('en-NG') : 0} units on hand`;

    const low = K.lowStockProducts();
    $('#mLow').textContent = low.length;
    $('#mLowHint').textContent = low.length
      ? `${low.filter((p) => p.stock <= 0).length} out of stock · restock soon`
      : 'Everything is above its reorder level';
    const lowTile = document.getElementById('lowStockTile');
    if (lowTile) lowTile.classList.toggle('is-alert', low.length > 0);

    $('#mOrders').textContent = state.orders.length;
    $('#mOrdersHint').textContent = `${money(state.orders.reduce((s, o) => s + o.total, 0))} in order value`;

    const navBadge = $('#navInvBadge');
    navBadge.hidden = low.length === 0;
    navBadge.textContent = low.length;

    const fresh = state.orders.filter((o) => o.status === 'New').length;
    const orderBadge = $('#navOrderBadge');
    orderBadge.hidden = fresh === 0;
    orderBadge.textContent = fresh;

    $('#dashSub').textContent = `${state.products.length} products · ${low.length} need restocking · ${fresh} new order${fresh === 1 ? '' : 's'} waiting.`;
    $('#lastSync').textContent = state.lastSync ? `Synced ${K.timeAgo(state.lastSync)}` : '';
  }

  function renderRestock() {
    const host = $('#restockList');
    const low = K.lowStockProducts().sort((a, b) => a.stock - b.stock);
    if (!low.length) { host.innerHTML = `<div class="mini-empty">✅ Every product is above its reorder level.</div>`; return; }
    host.innerHTML = low.slice(0, 8).map((p) => `
      <div class="mini">
        ${p.image
          ? `<span class="mini__glyph mini__glyph--img" style="background-image:url('${esc(p.image)}')"></span>`
          : `<span class="mini__glyph">${K.glyphFor(p)}</span>`}
        <span class="mini__main">
          <strong>${esc(p.name)}</strong>
          <small>${p.stock <= 0 ? 'Out of stock' : `${p.stock} left`} · reorder at ${K.reorderLevel(p)}</small>
        </span>
        <button class="btn btn--ghost btn--sm" data-stock="${p.id}">Restock</button>
      </div>`).join('');
  }

  function renderLatestOrders() {
    const host = $('#latestOrders');
    if (!state.orders.length) {
      host.innerHTML = `<div class="mini-empty">No orders yet. They arrive here the moment a customer checks out.</div>`;
      return;
    }
    host.innerHTML = state.orders.slice(0, 5).map((o) => `
      <div class="mini">
        <span class="mini__glyph">🧾</span>
        <span class="mini__main">
          <strong>${esc(o.customer.name)} · ${money(o.total)}</strong>
          <small>${esc(o.id)} · ${esc(K.timeAgo(o.at))} · ${o.units} unit${o.units === 1 ? '' : 's'}</small>
        </span>
        <span class="badge badge--soft">${esc(o.status)}</span>
      </div>`).join('');
  }

  /* =========================================================
     RENDER: ORDERS
     ========================================================= */
  function renderOrders() {
    const host = $('#ordersList');
    const list = filters.orders === 'all' ? state.orders : state.orders.filter((o) => o.status === filters.orders);

    if (!list.length) {
      host.innerHTML = `<div class="empty">
        <div class="empty__glyph">🧾</div>
        <h3>${state.orders.length ? 'No orders with that status' : 'No orders yet'}</h3>
        <p>${state.orders.length ? 'Switch the filter to see the rest.' : 'Customer checkouts land here with their delivery details.'}</p>
      </div>`;
      return;
    }

    host.innerHTML = list.map((o) => {
      const c = o.customer;
      const statusClass = o.status === 'New' ? 'badge--low' : o.status === 'Delivered' ? 'badge--in' : o.status === 'Cancelled' ? 'badge--out' : 'badge--soft';
      const phoneDigits = String(c.phone).replace(/[^\d]/g, '').replace(/^0/, '234');
      return `<article class="log">
        <header class="log__head">
          <span class="log__id">${esc(o.id)}</span>
          <span class="badge ${statusClass}">${esc(o.status)}</span>
          <span class="log__time">${esc(K.fullTime(o.at))} · ${esc(K.timeAgo(o.at))}</span>
          <span class="log__total">${money(o.total)}</span>
        </header>
        <div class="order-grid">
          <div class="order-grid__col">
            <h4>Customer</h4>
            <p class="order-strong">${esc(c.name)}</p>
            <p><a href="tel:${esc(c.phone)}">${esc(c.phone)}</a></p>
            ${c.email ? `<p><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></p>` : ''}
            <h4>Delivery</h4>
            <p>${esc(c.address)}</p>
            <p>${esc(c.city)}</p>
            <p class="muted">${esc(c.delivery)}</p>
            ${c.notes ? `<p class="note-box note-box--tight">“${esc(c.notes)}”</p>` : ''}
          </div>
          <div class="order-grid__col order-grid__col--wide">
            <h4>Items</h4>
            <div class="log__lines log__lines--tight">
              ${o.items.map((i) => `<div class="log__line">
                <span class="log__glyph">${i.glyph || '📦'}</span>
                <span class="log__name">${esc(i.name)} <span class="mono">${esc(i.sku)}</span></span>
                <span class="log__qty">${i.qty} × ${money(i.price)}</span>
                <span class="log__amt">${money(i.lineTotal)}</span>
              </div>`).join('')}
            </div>
            <div class="order-total">
              <span>Subtotal ${money(o.subtotal)}</span>
              <span>Delivery ${o.shipping ? money(o.shipping) : 'free'}</span>
              <strong>Total ${money(o.total)}</strong>
            </div>
          </div>
        </div>
        <div class="log__actions">
          <a class="btn btn--primary btn--sm" target="_blank" rel="noopener" href="https://wa.me/${phoneDigits}?text=${encodeURIComponent(`Hello ${c.name}, this is ${CONFIG.brand} confirming your order ${o.id} (${money(o.total)}). `)}">
            <svg viewBox="0 0 24 24"><path d="M21 11.5a8.4 8.4 0 01-12.3 7.4L3 20.5l1.7-5.6A8.4 8.4 0 1121 11.5z"/></svg>
            Message customer
          </a>
          <a class="btn btn--ghost btn--sm" href="${esc(o.mailtoUrl || K.mailtoUrl(o))}">Email the order</a>
          <a class="btn btn--ghost btn--sm" href="tel:${esc(c.phone)}">Call</a>
          <div class="select-wrap select-wrap--inline">
            <select data-status="${esc(o.id)}" aria-label="Order status">
              ${['New', 'Confirmed', 'Delivered', 'Cancelled'].map((s) => `<option value="${s}" ${o.status === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </div>
          <button class="btn btn--ghost btn--sm" data-copy="${esc(o.id)}">Copy details</button>
        </div>
      </article>`;
    }).join('');
  }

  /* =========================================================
     RENDER: MOVEMENT LOG
     ========================================================= */
  function renderTransactions() {
    const host = $('#txList');
    const list = state.movements || [];
    if (!list.length) {
      host.innerHTML = `<div class="empty">
        <div class="empty__glyph">📘</div>
        <h3>No stock movements yet</h3>
        <p>Sales, restocks, edits and deletions are journalled here automatically.</p>
      </div>`;
      return;
    }
    const tone = { sale: 'badge--low', restock: 'badge--in', edit: 'badge--soft', delete: 'badge--out', create: 'badge--in', reset: 'badge--out' };
    host.innerHTML = list.slice(0, 120).map((m) => `
      <article class="log log--compact">
        <header class="log__head">
          <span class="log__glyph">${m.glyph || '📦'}</span>
          <span class="log__name">${esc(m.name)} ${m.sku ? `<span class="mono">${esc(m.sku)}</span>` : ''}</span>
          <span class="badge ${tone[m.type] || 'badge--soft'}">${esc(m.type)}</span>
          <span class="log__qty">${m.qty > 0 ? '+' : ''}${m.qty} unit${Math.abs(m.qty) === 1 ? '' : 's'}</span>
          ${m.total ? `<span class="log__total">${money(m.total)}</span>` : ''}
        </header>
        <div class="log__meta">${esc(K.fullTime(m.at))} · ${esc(K.timeAgo(m.at))}${m.note ? ` · ${esc(m.note)}` : ''}</div>
      </article>`).join('');
  }

  function renderAll() {
    renderMetrics();
    renderInventory();
    renderOrders();
    renderTransactions();
    renderRestock();
    renderLatestOrders();
  }

  /* =========================================================
     PANELS
     ========================================================= */
  const TITLES = { dashboard: 'Dashboard', inventory: 'Inventory', orders: 'Orders', transactions: 'Transactions', settings: 'Settings' };
  function showPanel(name) {
    $$('.side__link').forEach((l) => l.classList.toggle('is-active', l.dataset.panel === name));
    $$('.panel-view').forEach((p) => p.classList.toggle('is-active', p.id === `panel-${name}`));
    $('#crumbNow').textContent = TITLES[name] || name;
    $('#side').classList.remove('is-open');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* =========================================================
     PRODUCT EDITOR
     ========================================================= */
  function renderImagePreview(src) {
    pendingImage = src || '';
    const host = $('#imagePreview');
    if (pendingImage) {
      host.classList.add('has-image');
      host.style.backgroundImage = `url('${pendingImage}')`;
      host.innerHTML = '';
    } else {
      host.classList.remove('has-image');
      host.style.backgroundImage = '';
      host.innerHTML = `<span class="image-preview__empty">
        <svg viewBox="0 0 24 24"><path d="M3 5h18v14H3zM8 11a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM21 16l-5-5-6 6-3-3-4 4"/></svg>
        No image yet</span>`;
    }
  }

  function openProductModal(id = null) {
    editingId = id;
    $('#productForm').reset();
    clearErrors();
    $('#f-image-file').value = '';
    $('#f-image-url').value = '';
    $('#marginStrip').hidden = true;
    $('#f-unit').innerHTML = K.UNITS.map((u) => `<option value="${esc(u)}">${esc(u)}</option>`).join('');
    $('#categoryOptions').innerHTML = K.categories().map((c) => `<option value="${esc(c)}"></option>`).join('');

    if (id) {
      const p = K.getProduct(id);
      if (!p) { K.toast('Product missing', 'It may have been deleted elsewhere.', 'error'); return; }
      $('#modalTitle').textContent = 'Edit product';
      $('#modalSub').textContent = `Editing ${p.sku} — changes appear on the shopfront immediately.`;
      $('#saveProductBtn').textContent = 'Save changes';
      $('#f-name').value = p.name;
      $('#f-sku').value = p.sku;
      $('#f-category').value = p.category;
      $('#f-price').value = p.price;
      $('#f-cost').value = p.cost || '';
      $('#f-stock').value = p.stock;
      $('#f-reorder').value = K.reorderLevel(p);
      $('#f-unit').value = p.unit || 'piece';
      $('#f-desc').value = p.description || '';
      $('#f-featured').checked = !!p.featured;
      renderImagePreview(p.image || '');
    } else {
      $('#modalTitle').textContent = 'Add new product';
      $('#modalSub').textContent = 'Fill in the product details. Fields marked * are required.';
      $('#saveProductBtn').textContent = 'Save product';
      $('#f-reorder').value = CONFIG.lowStockThreshold;
      $('#f-unit').value = 'piece';
      renderImagePreview('');
    }

    updateCharCount();
    updateMargin();
    $('#productModal').hidden = false;
    setTimeout(() => $('#f-name').focus(), 40);
  }
  const closeProductModal = () => { $('#productModal').hidden = true; editingId = null; pendingImage = ''; };

  function clearErrors() {
    $$('#productForm .field').forEach((f) => f.classList.remove('has-error'));
    $$('#productForm .field__error').forEach((e) => { e.textContent = ''; });
  }
  function showErrors(errors) {
    clearErrors();
    Object.entries(errors).forEach(([k, msg]) => {
      const el = $(`#productForm [data-error="${k}"]`);
      if (!el) return;
      el.textContent = msg;
      el.closest('.field').classList.add('has-error');
    });
    const first = $('#productForm .field.has-error input, #productForm .field.has-error textarea');
    if (first) first.focus();
  }

  function updateCharCount() {
    const v = $('#f-desc').value;
    $('#descCount').textContent = `${v.length} / 180`;
    $('#descCount').classList.toggle('is-near', v.length > 160);
  }

  function updateMargin() {
    const price = Number($('#f-price').value);
    const cost = Number($('#f-cost').value);
    const stock = Number($('#f-stock').value);
    const strip = $('#marginStrip');
    if (!Number.isFinite(price) || price <= 0) { strip.hidden = true; return; }
    strip.hidden = false;
    const per = Number.isFinite(cost) && cost > 0 ? price - cost : null;
    $('#marginPer').textContent = per === null ? '—' : money(per);
    $('#marginPct').textContent = per === null || cost <= 0 ? '—' : `${((per / cost) * 100).toFixed(1)}%`;
    $('#marginStock').textContent = Number.isFinite(stock) && cost > 0 ? money(stock * cost) : '—';
    $('#marginPer').classList.toggle('is-bad', per !== null && per < 0);
  }

  async function submitProduct(e) {
    e.preventDefault();
    const btn = $('#saveProductBtn');
    const label = btn.textContent;
    const input = {
      name: $('#f-name').value,
      sku: $('#f-sku').value,
      category: $('#f-category').value,
      price: $('#f-price').value === '' ? '' : Number($('#f-price').value),
      cost: $('#f-cost').value === '' ? 0 : Number($('#f-cost').value),
      stock: $('#f-stock').value === '' ? '' : Number($('#f-stock').value),
      reorder: $('#f-reorder').value === '' ? CONFIG.lowStockThreshold : Number($('#f-reorder').value),
      unit: $('#f-unit').value,
      description: $('#f-desc').value,
      image: pendingImage,
      featured: $('#f-featured').checked
    };

    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
      if (editingId) {
        const product = await K.updateProduct(editingId, input);
        K.toast('Product updated', `${product.name} is live on the shopfront.`, 'success');
      } else {
        const product = await K.createProduct(input);
        K.toast('Product added', `${product.name} is live on the shopfront.`, 'success');
      }
      closeProductModal();
      renderAll();
    } catch (err) {
      if (handleAuthFailure(err)) return;
      if (err.errors) { showErrors(err.errors); K.toast('Could not save', 'Fix the highlighted fields.', 'warn'); }
      else K.toast('Save failed', err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  }

  /* =========================================================
     STOCK ADJUST
     ========================================================= */
  function openStockModal(id) {
    const p = K.getProduct(id);
    if (!p) return;
    stockTargetId = id;
    $('#stockForm').reset();
    clearErrors();
    $('#stockNow').innerHTML = `${p.image ? `<span class="stock-now__img" style="background-image:url('${esc(p.image)}')"></span>` : `<span class="stock-now__img">${K.glyphFor(p)}</span>`}
      <span><strong>${esc(p.name)}</strong><small>${esc(p.sku)} · currently <b>${p.stock}</b> ${esc(K.unitLabel(p, p.stock))} on hand</small></span>`;
    $('#stockModal').hidden = false;
    setTimeout(() => $('#s-amount').focus(), 40);
  }
  const closeStockModal = () => { $('#stockModal').hidden = true; stockTargetId = null; };

  async function submitStock(e) {
    e.preventDefault();
    const amount = Number($('#s-amount').value);
    if (!Number.isFinite(amount) || amount === 0 || !Number.isInteger(amount)) {
      const el = $('#stockForm [data-error="amount"]');
      el.textContent = 'Enter a whole number (negative to remove).';
      el.closest('.field').classList.add('has-error');
      return;
    }
    try {
      const product = await K.adjustStock(stockTargetId, amount, $('#s-note').value.trim());
      K.toast(amount > 0 ? 'Stock received' : 'Stock removed', `${product.name} is now at ${product.stock}.`, 'success');
      closeStockModal();
      renderAll();
    } catch (err) {
      if (handleAuthFailure(err)) return;
      K.toast('Not applied', err.message, 'error');
    }
  }

  /* =========================================================
     CONFIRM
     ========================================================= */
  function openConfirm(opts) {
    pendingConfirm = opts.onOk;
    $('#confirmTitle').textContent = opts.title || 'Are you sure?';
    $('#confirmText').innerHTML = opts.body || '';
    $('#confirmOk').textContent = opts.okText || 'Confirm';
    $('#confirmOk').className = `btn ${opts.danger ? 'btn--danger' : 'btn--primary'}`;
    $('#confirmModal').hidden = false;
  }
  const closeConfirm = () => { $('#confirmModal').hidden = true; pendingConfirm = null; };

  /* =========================================================
     EXPORTS
     ========================================================= */
  function download(filename, text, type) {
    const blob = new Blob(['\uFEFF' + text], { type: type || 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }
  const csv = (rows) => rows.map((r) => r.map((c) => `"${String(c == null ? '' : c).replace(/"/g, '""')}"`).join(',')).join('\r\n');

  function exportCsv() {
    const rows = [
      ['Name', 'SKU', 'Category', 'Unit', 'Selling price', 'Cost price', 'Margin', 'Stock', 'Reorder level', 'Status', 'Stock value', 'Featured', 'Description'],
      ...state.products.map((p) => [
        p.name, p.sku, p.category, p.unit || 'piece', p.price, p.cost || 0,
        (p.price - (p.cost || 0)).toFixed(2), p.stock, K.reorderLevel(p),
        K.isOut(p) ? 'Out of stock' : K.isLow(p) ? 'Low stock' : 'Healthy',
        (p.price * p.stock).toFixed(2), p.featured ? 'yes' : 'no', p.description || ''
      ])
    ];
    download(`kavari-inventory-${new Date().toISOString().slice(0, 10)}.csv`, csv(rows));
    K.toast('Export ready', `${state.products.length} products written to CSV.`, 'success');
  }

  function exportOrders() {
    if (!state.orders.length) { K.toast('Nothing to export', 'No orders recorded yet.', 'info'); return; }
    const rows = [['Order ID', 'Placed', 'Status', 'Customer', 'Phone', 'Email', 'Address', 'City', 'Delivery', 'Notes', 'Items', 'Units', 'Subtotal', 'Delivery fee', 'Total']];
    state.orders.forEach((o) => {
      const c = o.customer;
      rows.push([o.id, K.fullTime(o.at), o.status, c.name, c.phone, c.email, c.address, c.city, c.delivery, c.notes,
        o.items.map((i) => `${i.qty}× ${i.name} (${i.sku})`).join(' | '), o.units, o.subtotal, o.shipping, o.total]);
    });
    download(`kavari-orders-${new Date().toISOString().slice(0, 10)}.csv`, csv(rows));
    K.toast('Export ready', `${state.orders.length} orders written to CSV.`, 'success');
  }

  function exportLog() {
    const list = state.movements || [];
    if (!list.length) { K.toast('Nothing to export', 'No stock movements recorded yet.', 'info'); return; }
    const rows = [['When', 'Type', 'Product', 'SKU', 'Quantity', 'Value', 'Note']];
    list.forEach((m) => rows.push([K.fullTime(m.at), m.type, m.name, m.sku, m.qty, m.total || '', m.note]));
    download(`kavari-stock-log-${new Date().toISOString().slice(0, 10)}.csv`, csv(rows));
    K.toast('Export ready', `${list.length} movements written to CSV.`, 'success');
  }

  async function backup() {
    try {
      const data = await K.backup();
      download(`kavari-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), 'application/json');
      K.toast('Backup saved', 'Products, orders and the stock log downloaded.', 'success');
    } catch (err) {
      if (handleAuthFailure(err)) return;
      K.toast('Backup failed', err.message, 'error');
    }
  }

  /* =========================================================
     WIRING
     ========================================================= */
  function wire() {
    $$('.side__link').forEach((l) => l.addEventListener('click', () => showPanel(l.dataset.panel)));
    $('#menuBtn').addEventListener('click', () => $('#side').classList.toggle('is-open'));
    $$('[data-panel-jump]').forEach((b) => b.addEventListener('click', () => showPanel(b.dataset.panelJump)));

    $('#logoutBtn').addEventListener('click', async () => {
      await K.logout();
      window.location.href = 'login.html';
    });

    $('#invSearch').addEventListener('input', (e) => { filters.q = e.target.value; renderInventory(); });
    $('#invCategory').addEventListener('change', (e) => { filters.category = e.target.value; renderInventory(); });
    $('#invStock').addEventListener('change', (e) => { filters.stock = e.target.value; renderInventory(); });
    $('#invSort').addEventListener('change', (e) => { filters.sort = e.target.value; renderInventory(); });

    const doRefresh = async () => {
      try {
        await K.loadAdmin();
        renderAll();
        K.toast('Refreshed', 'Latest products, orders and stock loaded.', 'success');
      } catch (err) {
        if (handleAuthFailure(err)) return;
        K.toast('Refresh failed', err.message, 'error');
      }
    };
    $('#refreshBtn').addEventListener('click', doRefresh);
    $('#refreshBtnDash').addEventListener('click', doRefresh);

    $('#invBody').addEventListener('click', (e) => {
      const edit = e.target.closest('[data-edit]');
      const del = e.target.closest('[data-del]');
      const stock = e.target.closest('[data-stock]');
      if (edit) return void openProductModal(edit.dataset.edit);
      if (stock) return void openStockModal(stock.dataset.stock);
      if (del) {
        const p = K.getProduct(del.dataset.del);
        if (!p) return;
        openConfirm({
          title: 'Delete product',
          body: `Delete <strong>${esc(p.name)}</strong> (${esc(p.sku)})? It disappears from the shopfront and the inventory list. Past orders and the stock log are kept.`,
          okText: 'Delete', danger: true,
          onOk: async () => {
            try {
              const name = await K.deleteProduct(del.dataset.del);
              K.toast('Product deleted', `${name} removed.`, 'success');
              renderAll();
            } catch (err) {
              if (handleAuthFailure(err)) return;
              K.toast('Delete failed', err.message, 'error');
            }
          }
        });
      }
    });

    $('#restockList').addEventListener('click', (e) => {
      const b = e.target.closest('[data-stock]');
      if (b) openStockModal(b.dataset.stock);
    });

    $('#newProductBtn').addEventListener('click', () => openProductModal(null));
    $('#newProductBtn2').addEventListener('click', () => openProductModal(null));

    $('#productForm').addEventListener('submit', submitProduct);
    $('#f-desc').addEventListener('input', updateCharCount);
    ['#f-price', '#f-cost', '#f-stock'].forEach((sel) => $(sel).addEventListener('input', updateMargin));

    $('#genSku').addEventListener('click', () => {
      const cat = ($('#f-category').value || 'GEN').trim().slice(0, 3).toUpperCase().replace(/[^A-Z0-9]/g, '') || 'GEN';
      let n = state.products.length + 1, sku;
      do { sku = `KAV-${cat}-${String(n).padStart(4, '0')}`; n++; } while (state.products.some((p) => p.sku === sku));
      $('#f-sku').value = sku;
      $('#f-sku').closest('.field').classList.remove('has-error');
      const err = $('#productForm [data-error="sku"]'); if (err) err.textContent = '';
    });

    $('#f-image-file').addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const errEl = $('#productForm [data-error="image"]');
      errEl.textContent = '';
      errEl.closest('.field').classList.remove('has-error');
      try {
        const dataUrl = await K.fileToImage(file);
        $('#f-image-url').value = '';
        renderImagePreview(dataUrl);
        K.toast('Image ready', 'Uploaded and resized for the catalogue.', 'success');
      } catch (err) {
        errEl.textContent = err.message;
        errEl.closest('.field').classList.add('has-error');
        K.toast('Image rejected', err.message, 'error');
      }
    });

    $('#f-image-url').addEventListener('input', (e) => { const v = e.target.value.trim(); if (v) renderImagePreview(v); });
    $('#clearImageBtn').addEventListener('click', () => {
      $('#f-image-file').value = '';
      $('#f-image-url').value = '';
      renderImagePreview('');
    });
    $$('#productModal [data-close]').forEach((b) => b.addEventListener('click', closeProductModal));

    $('#stockForm').addEventListener('submit', submitStock);
    $$('#stockModal [data-close]').forEach((b) => b.addEventListener('click', closeStockModal));

    $$('#confirmModal [data-close]').forEach((b) => b.addEventListener('click', closeConfirm));
    $('#confirmOk').addEventListener('click', () => { const fn = pendingConfirm; closeConfirm(); if (fn) fn(); });

    $('#orderFilter').addEventListener('change', (e) => { filters.orders = e.target.value; renderOrders(); });
    $('#ordersList').addEventListener('change', async (e) => {
      const sel = e.target.closest('[data-status]');
      if (!sel) return;
      try {
        const o = await K.setOrderStatus(sel.dataset.status, sel.value);
        K.toast('Order updated', `${o.id} marked ${o.status}.`, 'success');
        renderAll();
      } catch (err) {
        if (handleAuthFailure(err)) return;
        K.toast('Update failed', err.message, 'error');
      }
    });
    $('#ordersList').addEventListener('click', async (e) => {
      const copy = e.target.closest('[data-copy]');
      if (!copy) return;
      const o = state.orders.find((x) => x.id === copy.dataset.copy);
      if (!o) return;
      try { await navigator.clipboard.writeText(K.orderText(o)); K.toast('Copied', 'Order details copied.', 'success'); }
      catch (_) { K.toast('Copy failed', 'Clipboard access was blocked by the browser.', 'warn'); }
    });

    $('#clearOrdersBtn').addEventListener('click', () => {
      if (!state.orders.length) { K.toast('Nothing to clear', 'No orders recorded.', 'info'); return; }
      openConfirm({
        title: 'Clear all orders',
        body: `Remove all <strong>${state.orders.length}</strong> orders? The stock log is kept.`,
        okText: 'Clear orders', danger: true,
        onOk: async () => {
          try { await K.clearOrders(); K.toast('Orders cleared', 'Order list emptied.', 'success'); renderAll(); }
          catch (err) { if (handleAuthFailure(err)) return; K.toast('Clear failed', err.message, 'error'); }
        }
      });
    });

    $('#exportCsvBtn').addEventListener('click', exportCsv);
    $('#exportOrdersBtn').addEventListener('click', exportOrders);
    $('#exportLogBtn').addEventListener('click', exportLog);
    $('#backupBtn').addEventListener('click', backup);

    $('#resetBtn').addEventListener('click', () => {
      openConfirm({
        title: 'Reset everything',
        body: 'Restore the seed catalogue? Every product, stock level and order in the database will be replaced.',
        okText: 'Reset', danger: true,
        onOk: async () => {
          try { await K.resetCatalogue(); K.toast('Reset complete', 'Seed catalogue restored.', 'success'); renderAll(); }
          catch (err) { if (handleAuthFailure(err)) return; K.toast('Reset failed', err.message, 'error'); }
        }
      });
    });

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (!$('#confirmModal').hidden) return closeConfirm();
      if (!$('#stockModal').hidden) return closeStockModal();
      if (!$('#productModal').hidden) return closeProductModal();
    });

    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') poll(); });
    K.startPolling(() => {
      renderAll();
      const fresh = state.orders.filter((o) => o.status === 'New').length;
      if (fresh) K.toast('New activity', `${fresh} order${fresh === 1 ? '' : 's'} waiting.`, 'info');
    }, { admin: true, everyMs: CONFIG.pollMs });
  }

  async function poll() {
    try { await K.loadAdmin(); renderAll(); } catch (_) { /* keep last data */ }
  }

  /* =========================================================
     BOOT
     ========================================================= */
  /**
   * The server picks the first free port, and a leftover server process can
   * hold an older one. If this page was loaded from a different port than the
   * API it is talking to, the portal would silently show another database —
   * so refuse to run and say so plainly.
   */
  function checkSameServer() {
    const here = window.location.port;
    const api = new URL(CONFIG.apiBase, window.location.href).port;
    if (api && here && api !== here) {
      document.body.innerHTML = `<div style="font-family:system-ui;padding:60px;max-width:680px;margin:auto;color:#0f172a">
        <h1 style="margin:0 0 10px">Wrong server</h1>
        <p style="color:#475569;line-height:1.6">This portal page came from port <b>${here}</b> but is talking to the API on port <b>${api}</b> — they are two different databases.</p>
        <p style="color:#475569;line-height:1.6">Open the portal from the same address as the API instead, and close any other copies of the app:</p>
        <p><a href="http://${window.location.hostname}:${api}/admin.html" style="color:#2563eb;font-weight:600">http://${window.location.hostname}:${api}/admin.html</a></p>
        <p style="color:#94a3b8;font-size:13px">Tip: stop any other running copies of the server first, then reload.</p>
      </div>`;
      return false;
    }
    return true;
  }

  async function init() {
    if (!checkSameServer()) return;
    if (!(await requireSession())) return;

    $('#userEmail').textContent = adminEmail;
    $('#userInitial').textContent = (adminEmail[0] || 'A').toUpperCase();
    $('#setWa').textContent = `${CONFIG.storeWhatsAppDisplay} (${CONFIG.storeWhatsApp})`;
    $('#setEmail').textContent = CONFIG.adminEmail;
    $('#setCur').textContent = `${CONFIG.currency} — Nigerian Naira`;
    $('#setFree').textContent = K.money(CONFIG.freeShippingFrom);
    $('#setFee').textContent = K.money(CONFIG.shippingFee);
    $('#setLow').textContent = `${CONFIG.lowStockThreshold} units`;

    wire();
    try {
      await K.loadAdmin();
      renderAll();
    } catch (err) {
      if (handleAuthFailure(err)) return;
      K.toast('Could not load data', err.message, 'error');
      renderAll();
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
