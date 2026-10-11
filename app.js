/* ============================================================
   Kavari Stores — CUSTOMER STOREFRONT
   Reads the catalogue from the server, places orders on the
   server, and hands the order to WhatsApp + the store's email.
   No inventory controls, no local database.
   ============================================================ */
(() => {
  'use strict';

  const K = window.Kavari;
  const { state, CONFIG } = K;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const money = K.money;
  const esc = K.esc;

  const filters = { q: '', category: 'All', inStockOnly: false, sort: 'featured' };
  const MY_ORDERS_KEY = 'kavari.myorders.v2';
  let myOrders = [];
  let activeOrder = null;
  let lastError = null;

  /* ---------------- this device's own order list ---------------- */
  function loadMyOrders() { try { myOrders = JSON.parse(localStorage.getItem(MY_ORDERS_KEY)) || []; } catch (_) { myOrders = []; } }
  function saveMyOrders() { try { localStorage.setItem(MY_ORDERS_KEY, JSON.stringify(myOrders.slice(0, 25))); } catch (_) { /* optional */ } }

  /* ---------------- filters ---------------- */
  function filtered() {
    let list = state.products.slice();
    if (filters.category !== 'All') list = list.filter((p) => p.category === filters.category);
    if (filters.inStockOnly) list = list.filter((p) => p.stock > 0);
    if (filters.q) {
      const q = filters.q.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.category.toLowerCase().includes(q));
    }
    const byName = (a, b) => a.name.localeCompare(b.name);
    switch (filters.sort) {
      case 'price-asc':  list.sort((a, b) => a.price - b.price); break;
      case 'price-desc': list.sort((a, b) => b.price - a.price); break;
      case 'name-asc':   list.sort(byName); break;
      case 'stock-desc': list.sort((a, b) => b.stock - a.stock); break;
      default: list.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || byName(a, b));
    }
    return list;
  }

  function stockBadge(p) {
    const s = K.stockState(p);
    if (s === 'out') return '<span class="stock stock--out">Out of stock</span>';
    if (s === 'low') return `<span class="stock stock--low">Only ${p.stock} left</span>`;
    return '<span class="stock stock--in">In stock</span>';
  }

  /* ---------------- render: storefront ---------------- */
  function renderChips() {
    const cats = ['All', ...K.categories()];
    $('#categoryChips').innerHTML = cats.map((c) =>
      `<button class="chip ${filters.category === c ? 'is-active' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
  }

  /* ---------------- featured showcase: slides through in-stock, imaged products first ---------------- */
  const showcase = { items: [], index: 0, timer: null, wired: false };

  function showcaseItems() {
    const pool = state.products.filter((p) => p.stock > 0);
    if (!pool.length) return [];
    const withImage = pool.filter((p) => p.image);
    const featured = pool.filter((p) => p.featured);
    // imaged + featured first, then imaged, then featured, then the rest — max 6
    const rank = (p) => (p.image && p.featured ? 0 : p.image ? 1 : p.featured ? 2 : 3);
    return pool.slice().sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name)).slice(0, withImage.length ? 6 : 5);
  }

  function renderShowcase() {
    const track = $('#showcaseTrack');
    const dots = $('#showcaseDots');
    if (!track || !dots) return;

    showcase.items = showcaseItems();
    if (showcase.index >= showcase.items.length) showcase.index = 0;

    if (!showcase.items.length) {
      track.innerHTML = `<div class="showcase__slide"><div class="showcase__media showcase__media--glyph"><span class="card__glyph">🏷️</span><div class="showcase__shade"></div><div class="showcase__caption"><span class="showcase__flag">Kavari Stores</span><p class="showcase__name">The shelf is being restocked</p><p class="showcase__sub">Check back shortly — or ask us on WhatsApp.</p></div></div></div>`;
      dots.innerHTML = '';
      return;
    }

    track.innerHTML = showcase.items.map((p) => `
      <div class="showcase__slide" data-quick="${p.id}" role="tab" aria-label="${esc(p.name)}">
        <div class="showcase__media${p.image ? '' : ' showcase__media--glyph'}"${p.image ? ` style="background-image:url('${esc(p.image)}')"` : ''}>
          ${p.image ? '' : `<span class="card__glyph">${K.glyphFor(p)}</span>`}
          <div class="showcase__shade"></div>
          <div class="showcase__caption">
            <span class="showcase__flag">${p.featured ? 'Featured' : esc(p.category)}</span>
            <p class="showcase__name">${esc(p.name)}</p>
            <p class="showcase__sub"><strong>${money(p.price)}</strong> · ${p.stock <= 0 ? 'Out of stock' : p.stock + ' available'} · tap to view</p>
          </div>
        </div>
      </div>`).join('');

    dots.innerHTML = showcase.items.map((_, i) =>
      `<button data-dot="${i}" role="tab" aria-selected="${i === showcase.index}" aria-label="Show slide ${i + 1}"></button>`).join('');

    goToSlide(showcase.index, true);
    restartShowcase();
  }

  function goToSlide(i, instant) {
    const track = $('#showcaseTrack');
    const dots = $('#showcaseDots');
    if (!track || !showcase.items.length) return;
    showcase.index = (i + showcase.items.length) % showcase.items.length;
    if (instant) track.style.transition = 'none';
    track.style.transform = `translateX(-${showcase.index * 100}%)`;
    if (instant) requestAnimationFrame(() => { track.style.transition = ''; });
    if (dots) {
      [...dots.children].forEach((d, n) => {
        d.classList.toggle('is-active', n === showcase.index);
        d.setAttribute('aria-selected', String(n === showcase.index));
      });
    }
  }

  function restartShowcase() {
    clearInterval(showcase.timer);
    if (showcase.items.length < 2) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    showcase.timer = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      goToSlide(showcase.index + 1);
    }, 5000);
  }

  function wireShowcase() {
    if (showcase.wired) return;
    showcase.wired = true;
    const root = $('#showcase');
    if (!root) return;
    $('#showcasePrev').addEventListener('click', (e) => { e.stopPropagation(); goToSlide(showcase.index - 1); restartShowcase(); });
    $('#showcaseNext').addEventListener('click', (e) => { e.stopPropagation(); goToSlide(showcase.index + 1); restartShowcase(); });
    $('#showcaseDots').addEventListener('click', (e) => {
      const d = e.target.closest('[data-dot]');
      if (!d) return;
      goToSlide(Number(d.dataset.dot));
      restartShowcase();
    });
    root.addEventListener('pointerenter', () => clearInterval(showcase.timer));
    root.addEventListener('pointerleave', () => restartShowcase());
    let touchX = null;
    root.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
    root.addEventListener('touchend', (e) => {
      if (touchX === null) return;
      const dx = e.changedTouches[0].clientX - touchX;
      if (Math.abs(dx) > 40) goToSlide(showcase.index + (dx < 0 ? 1 : -1));
      touchX = null;
      restartShowcase();
    }, { passive: true });
    // tapping a slide opens that product's quick view
    $('#showcaseTrack').addEventListener('click', (e) => {
      const slide = e.target.closest('[data-quick]');
      if (slide) openQuickView(slide.dataset.quick);
    });
  }

  function renderStorefront() {
    renderChips();
    $('#heroProducts').textContent = state.products.length;
    $('#heroInStock').textContent = state.products.filter((p) => p.stock > 0).length;
    wireShowcase();
    renderShowcase();

    const grid = $('#productGrid');

    if (lastError && !state.products.length) {
      grid.innerHTML = `<div class="empty">
        <div class="empty__glyph">📡</div>
        <h3>Cannot reach the store</h3>
        <p>${esc(lastError)}</p>
        <button class="btn btn--primary" style="margin-top:14px" data-retry>Try again</button>
      </div>`;
      return;
    }
    if (!state.loaded) {
      grid.innerHTML = `<div class="empty"><div class="empty__glyph">⏳</div><h3>Loading the catalogue…</h3><p>Fetching live stock from the store.</p></div>`;
      return;
    }

    const list = filtered();
    if (!list.length) {
      const hasAny = state.products.length > 0;
      grid.innerHTML = `<div class="empty">
        <div class="empty__glyph">${hasAny ? '🔍' : '📦'}</div>
        <h3>${hasAny ? 'Nothing matches those filters' : 'The shop is being stocked'}</h3>
        <p>${hasAny ? 'Try clearing the search box or choosing another category.' : 'Please check back shortly, or message us on WhatsApp.'}</p>
      </div>`;
      return;
    }

    grid.innerHTML = list.map((p) => {
      const remaining = K.stockAvailable(p);
      const canAdd = p.stock > 0 && remaining > 0;
      const label = p.stock <= 0 ? 'Out of stock' : remaining <= 0 ? 'Max in cart' : 'Add to cart';
      const media = `<div class="card__media" data-quick="${p.id}"${p.image ? ` style="background-image:url('${esc(p.image)}')"` : ''}>${p.image ? '' : `<span class="card__glyph">${K.glyphFor(p)}</span>`}${p.featured ? '<span class="card__flag">Featured</span>' : ''}</div>`;

      return `<article class="card ${p.stock <= 0 ? 'is-out' : ''}" data-id="${p.id}">
        ${media}
        <div class="card__body">
          <span class="card__cat">${esc(p.category)}</span>
          <h3 class="card__name" data-quick="${p.id}">${esc(p.name)}</h3>
          <p class="card__desc">${esc(p.description || 'Ask us for details on WhatsApp.')}</p>
          <span class="card__sku">${esc(p.sku)}</span>
          <div class="card__meta">
            <span class="card__price">${money(p.price)}</span>
            ${stockBadge(p)}
          </div>
          <div class="card__actions">
            <button class="btn btn--primary btn--sm" data-add="${p.id}" ${canAdd ? '' : 'disabled'}>${label}</button>
            <button class="btn btn--ghost btn--icon" data-ask="${p.id}" title="Ask about this product on WhatsApp" aria-label="Ask about this product on WhatsApp">
              <svg class="ic" viewBox="0 0 24 24"><path d="M21 11.5a8.4 8.4 0 01-12.3 7.4L3 20.5l1.7-5.6A8.4 8.4 0 1121 11.5z"/></svg>
            </button>
          </div>
        </div>
      </article>`;
    }).join('');
  }

  /* ---------------- render: cart ---------------- */
  function renderCart() {
    const lines = K.cartLines();
    const count = K.cartCount();
    const body = $('#cartBody');
    const foot = $('#cartFoot');

    $('#cartCount').textContent = count;
    $('#cartSub').textContent = count === 0
      ? 'Nothing here yet'
      : `${count} ${count === 1 ? 'unit' : 'units'} · ${lines.length} product${lines.length === 1 ? '' : 's'}`;

    if (!lines.length) {
      body.innerHTML = `<div class="cart__empty">
        <div class="empty__glyph">🛍️</div>
        <h4>Your cart is empty</h4>
        <p>Add something from the shop and it will show up here.</p>
        <button class="btn btn--ghost" data-goto-shop>Back to shop</button>
      </div>`;
      foot.style.display = 'none';
      return;
    }
    foot.style.display = '';

    body.innerHTML = lines.map(({ product: p, qty, lineTotal }) => {
      const atMax = qty >= p.stock;
      const img = p.image
        ? `<span class="cart-item__thumb cart-item__thumb--img" style="background-image:url('${esc(p.image)}')"></span>`
        : `<span class="cart-item__thumb">${K.glyphFor(p)}</span>`;
      return `<div class="cart-item" data-id="${p.id}">
        ${img}
        <div class="cart-item__main">
          <div class="cart-item__name">${esc(p.name)}</div>
          <div class="cart-item__sku">${esc(p.sku)} · ${money(p.price)} per ${esc(p.unit || 'unit')}</div>
          <div class="cart-item__row">
            <span class="qty">
              <button data-dec="${p.id}" aria-label="Decrease quantity">−</button>
              <span>${qty}</span>
              <button data-inc="${p.id}" aria-label="Increase quantity" ${atMax ? 'disabled' : ''}>+</button>
            </span>
            <span class="cart-item__price">${money(lineTotal)}</span>
          </div>
          ${atMax ? `<p class="cart-item__warn">Maximum available (${p.stock}) reached</p>` : ''}
          <button class="cart-item__remove" data-remove="${p.id}">Remove</button>
        </div>
      </div>`;
    }).join('');

    const t = K.cartTotals();
    $('#cartSubtotal').textContent = money(t.subtotal);
    $('#cartShip').textContent = t.shipping === 0 ? 'Free' : money(t.shipping);
    $('#cartTotal').textContent = money(t.total);
    $('#checkoutBtn').disabled = false;
    $('#cartShip').title = t.shipping === 0 ? 'Free delivery applied' : `Add ${money(CONFIG.freeShippingFrom - t.subtotal)} more for free delivery`;
  }

  /* ---------------- render: my orders ---------------- */
  function renderMyOrders() {
    const host = $('#myOrdersList');
    const badge = $('#myOrdersBadge');
    badge.hidden = myOrders.length === 0;
    badge.textContent = myOrders.length;

    if (!myOrders.length) {
      host.innerHTML = `<div class="empty">
        <div class="empty__glyph">🧾</div>
        <h3>No orders yet</h3>
        <p>Once you check out, your order details stay here so you can resend them to the store.</p>
        <button class="btn btn--ghost" style="margin-top:14px" data-goto-shop>Start shopping</button>
      </div>`;
      return;
    }

    host.innerHTML = myOrders.map((o) => `
      <article class="log">
        <header class="log__head">
          <span class="log__id">${esc(o.id)}</span>
          <span class="log__time">${esc(K.fullTime(o.at))} · ${esc(K.timeAgo(o.at))}</span>
          <span class="log__total">${money(o.total)}</span>
        </header>
        <div class="log__lines">
          ${o.items.map((i) => `
            <div class="log__line">
              <span class="log__glyph">${i.glyph || '📦'}</span>
              <span class="log__name">${esc(i.name)} <span class="mono">${esc(i.sku)}</span></span>
              <span class="log__qty">${i.qty} × ${money(i.price)}</span>
              <span class="log__amt">${money(i.lineTotal)}</span>
            </div>`).join('')}
        </div>
        <div class="log__meta">Deliver to ${esc(o.customer.name)}, ${esc(o.customer.address)}, ${esc(o.customer.city)} · ${esc(o.customer.delivery)}</div>
        <div class="log__actions">
          <a class="btn btn--primary btn--sm" target="_blank" rel="noopener" href="${esc(o.whatsappUrl)}">Resend on WhatsApp</a>
          <a class="btn btn--ghost btn--sm" href="${esc(o.mailtoUrl)}">Email the store</a>
          <button class="btn btn--ghost btn--sm" data-reorder="${esc(o.id)}">Order again</button>
        </div>
      </article>`).join('');
  }

  /* ---------------- quick view ---------------- */
  function openQuickView(id) {
    const p = K.getProduct(id);
    if (!p) return;
    const remaining = K.stockAvailable(p);
    const canAdd = p.stock > 0 && remaining > 0;
    $('#qvTitle').textContent = p.name;
    $('#quickViewBody').innerHTML = `
      ${p.image
        ? `<div class="qv__media" style="background-image:url('${esc(p.image)}')"></div>`
        : `<div class="qv__media"><span class="qv__glyph">${K.glyphFor(p)}</span></div>`}
      <div class="qv__info">
        <div class="qv__top">
          <span class="card__cat">${esc(p.category)}</span>
          ${stockBadge(p)}
        </div>
        <p class="qv__desc">${esc(p.description || 'No description provided — ask us on WhatsApp for full details.')}</p>
        <dl class="qv__specs">
          <div><dt>SKU</dt><dd class="mono">${esc(p.sku)}</dd></div>
          <div><dt>Price</dt><dd>${money(p.price)}</dd></div>
          <div><dt>Sold per</dt><dd>${esc(p.unit || 'piece')}</dd></div>
          <div><dt>Availability</dt><dd>${p.stock <= 0 ? 'Out of stock' : `${p.stock} ${esc(K.unitLabel(p, p.stock))} in store`}</dd></div>
        </dl>
        <div class="qv__actions">
          <button class="btn btn--primary" data-add="${p.id}" ${canAdd ? '' : 'disabled'}>${canAdd ? 'Add to cart' : 'Out of stock'}</button>
          <a class="btn btn--ghost" target="_blank" rel="noopener" href="${askUrl(p)}">Ask on WhatsApp</a>
        </div>
      </div>`;
    $('#quickViewModal').hidden = false;
  }
  const closeQuickView = () => { $('#quickViewModal').hidden = true; };

  function askUrl(p) {
    const text = `Hello ${CONFIG.brand}! I would like to ask about:\n\n• ${p.name} (${p.sku}) — ${money(p.price)}\n\nIs it available?`;
    return `https://wa.me/${CONFIG.storeWhatsApp}?text=${encodeURIComponent(text)}`;
  }

  /* ---------------- cart drawer ---------------- */
  const openCart = () => { $('#cart').classList.add('is-open'); $('#cart').setAttribute('aria-hidden', 'false'); $('#scrim').hidden = false; };
  const closeCart = () => { $('#cart').classList.remove('is-open'); $('#cart').setAttribute('aria-hidden', 'true'); $('#scrim').hidden = true; };

  /* ---------------- checkout ---------------- */
  const BUYER_KEY = 'kavari.buyer.v2';
  const saveBuyer = (c) => { try { localStorage.setItem(BUYER_KEY, JSON.stringify(c)); } catch (_) { /* optional */ } };
  const loadBuyer = () => { try { return JSON.parse(localStorage.getItem(BUYER_KEY)); } catch (_) { return null; } };

  function openCheckout() {
    if (!K.cartLines().length) { K.toast('Cart is empty', 'Add a product before checking out.', 'warn'); return; }
    $('#checkoutForm').reset();
    clearErrors();
    const saved = loadBuyer();
    if (saved) {
      $('#c-name').value = saved.name || '';
      $('#c-phone').value = saved.phone || '';
      $('#c-email').value = saved.email || '';
      $('#c-address').value = saved.address || '';
      $('#c-city').value = saved.city || '';
    }
    renderRecap();
    closeCart();
    $('#checkoutModal').hidden = false;
    setTimeout(() => { if (!$('#c-name').value) $('#c-name').focus(); else $('#c-address').focus(); }, 40);
  }
  const closeCheckout = () => { $('#checkoutModal').hidden = true; };

  function renderRecap() {
    const lines = K.cartLines();
    const t = K.cartTotals();
    $('#checkoutRecap').innerHTML = `
      ${lines.map((l) => `<div class="recap__line">
          <span>${esc(l.product.name)} <em>× ${l.qty}</em></span>
          <strong>${money(l.lineTotal)}</strong>
        </div>`).join('')}
      <div class="recap__line recap__line--muted"><span>Delivery</span><strong>${t.shipping ? money(t.shipping) : 'Free'}</strong></div>
      <div class="recap__line recap__line--total"><span>Total (${K.cartCount()} units)</span><strong>${money(t.total)}</strong></div>`;
  }

  function clearErrors() {
    $$('#checkoutForm .field').forEach((f) => f.classList.remove('has-error'));
    $$('#checkoutForm .field__error').forEach((e) => { e.textContent = ''; });
  }
  function showErrors(errors) {
    clearErrors();
    Object.entries(errors).forEach(([k, msg]) => {
      const el = $(`#checkoutForm [data-error="${k}"]`);
      if (!el) return;
      el.textContent = msg;
      el.closest('.field').classList.add('has-error');
    });
    const first = $('#checkoutForm .field.has-error input, #checkoutForm .field.has-error textarea');
    if (first) first.focus();
  }

  async function submitCheckout(e) {
    e.preventDefault();
    const btn = $('#placeOrderBtn');
    const label = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = 'Sending your order…';

    try {
      const order = await K.placeOrder({
        name: $('#c-name').value,
        phone: $('#c-phone').value,
        email: $('#c-email').value,
        address: $('#c-address').value,
        city: $('#c-city').value,
        delivery: $('#c-delivery').value,
        notes: $('#c-notes').value
      });

      saveBuyer(order.customer);
      myOrders.unshift({
        id: order.id, at: order.at, items: order.items, subtotal: order.subtotal,
        shipping: order.shipping, total: order.total, customer: order.customer,
        whatsappUrl: order.whatsappUrl, mailtoUrl: order.mailtoUrl
      });
      saveMyOrders();

      activeOrder = order;
      $('#successId').textContent = `Order ID ${order.id} · ${money(order.total)}`;
      $('#successWhatsApp').href = order.whatsappUrl;
      $('#successMail').href = order.mailtoUrl;
      closeCheckout();
      $('#successModal').hidden = false;
      window.open(order.whatsappUrl, '_blank');
      renderAll();
    } catch (err) {
      if (err.errors) {
        showErrors(err.errors);
        K.toast('Check the highlighted fields', err.message, 'warn');
      } else {
        K.toast('Order not sent', err.message, 'error');
        closeCheckout();
        await refresh();
      }
    } finally {
      btn.disabled = false;
      btn.innerHTML = label;
    }
  }

  /* ---------------- master render ---------------- */
  function renderAll() { renderStorefront(); renderCart(); renderMyOrders(); }

  function setView(v) {
    $$('.masthead__link').forEach((t) => {
      const on = t.dataset.view === v;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', String(on));
    });
    $$('.view').forEach((s) => s.classList.toggle('is-active', s.id === `view-${v}`));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function refresh() {
    try {
      await K.loadProducts();
      lastError = null;
      renderAll();
    } catch (err) {
      lastError = err.message;
      renderStorefront();
      if (!state.products.length) K.toast('Offline', err.message, 'error');
    }
  }

  /* ---------------- events ---------------- */
  function wire() {
    $('#waHelpLink').href = `https://wa.me/${CONFIG.storeWhatsApp}?text=${encodeURIComponent(`Hello ${CONFIG.brand}! I would like to place an order.`)}`;

    $$('.masthead__link').forEach((t) => t.addEventListener('click', () => setView(t.dataset.view)));

    $('#storeSearch').addEventListener('input', (e) => { filters.q = e.target.value; renderStorefront(); });
    $('#categoryChips').addEventListener('click', (e) => {
      const c = e.target.closest('[data-cat]'); if (!c) return;
      filters.category = c.dataset.cat; renderStorefront();
    });
    $('#inStockOnly').addEventListener('change', (e) => { filters.inStockOnly = e.target.checked; renderStorefront(); });
    $('#sortSelect').addEventListener('change', (e) => { filters.sort = e.target.value; renderStorefront(); });

    $('#productGrid').addEventListener('click', (e) => {
      if (e.target.closest('[data-retry]')) { refresh(); return; }
      const add = e.target.closest('[data-add]');
      const ask = e.target.closest('[data-ask]');
      const qv = e.target.closest('[data-quick]');
      if (add) {
        if (add.disabled) return;
        const res = K.addToCart(add.dataset.add, 1);
        if (!res.ok) { K.toast('Cannot add item', res.msg, 'warn'); renderStorefront(); return; }
        const p = K.getProduct(add.dataset.add);
        K.toast('Added to cart', `${p.name} — ${money(p.price)}`, 'success');
        bumpCart();
        renderAll();
        if (!window.matchMedia('(max-width: 900px)').matches) openCart();
        return;
      }
      if (ask) { const p = K.getProduct(ask.dataset.ask); if (p) window.open(askUrl(p), '_blank'); return; }
      if (qv) openQuickView(qv.dataset.quick);
    });

    $$('#quickViewModal [data-close]').forEach((b) => b.addEventListener('click', closeQuickView));
    $('#quickViewBody').addEventListener('click', (e) => {
      const add = e.target.closest('[data-add]');
      if (!add || add.disabled) return;
      const res = K.addToCart(add.dataset.add, 1);
      if (!res.ok) { K.toast('Cannot add item', res.msg, 'warn'); return; }
      K.toast('Added to cart', 'Item added from quick view.', 'success');
      bumpCart(); closeQuickView(); renderAll(); openCart();
    });

    $('#cartBtn').addEventListener('click', openCart);
    $('#cartClose').addEventListener('click', closeCart);
    $('#scrim').addEventListener('click', closeCart);

    $('#cartBody').addEventListener('click', (e) => {
      const inc = e.target.closest('[data-inc]');
      const dec = e.target.closest('[data-dec]');
      const rm = e.target.closest('[data-remove]');
      const shop = e.target.closest('[data-goto-shop]');
      if (shop) { closeCart(); setView('storefront'); return; }
      if (inc) { const r = K.setCartQty(inc.dataset.inc, K.cartQty(inc.dataset.inc) + 1); if (!r.ok) K.toast('Stock limit', r.msg, 'warn'); }
      else if (dec) { K.setCartQty(dec.dataset.dec, K.cartQty(dec.dataset.dec) - 1); }
      else if (rm) { const p = K.getProduct(rm.dataset.remove); K.removeFromCart(rm.dataset.remove); K.toast('Removed', `${p ? p.name : 'Item'} taken out of your cart.`, 'info'); }
      else return;
      renderAll();
    });

    $('#checkoutBtn').addEventListener('click', openCheckout);
    $('#checkoutForm').addEventListener('submit', submitCheckout);
    $$('#checkoutModal [data-close]').forEach((b) => b.addEventListener('click', closeCheckout));

    $('#successCopy').addEventListener('click', async () => {
      if (!activeOrder) return;
      try {
        await navigator.clipboard.writeText(activeOrder.plainText || K.orderText(activeOrder));
        K.toast('Copied', 'Order details copied to your clipboard.', 'success');
      } catch (_) { K.toast('Copy failed', 'Your browser blocked clipboard access — use WhatsApp instead.', 'warn'); }
    });
    $$('#successModal [data-close]').forEach((b) => b.addEventListener('click', () => { $('#successModal').hidden = true; }));

    $('#myOrdersList').addEventListener('click', (e) => {
      if (e.target.closest('[data-goto-shop]')) { setView('storefront'); return; }
      const again = e.target.closest('[data-reorder]');
      if (!again) return;
      const o = myOrders.find((x) => x.id === again.dataset.reorder);
      if (!o) return;
      let added = 0; const skipped = [];
      o.items.forEach((i) => {
        const p = K.getProduct(i.id);
        if (!p || p.stock <= 0) { skipped.push(i.name); return; }
        const r = K.addToCart(i.id, Math.min(i.qty, p.stock));
        if (r.ok) added++; else skipped.push(i.name);
      });
      renderAll();
      if (added) { K.toast('Items added', `${added} product(s) back in your cart.`, 'success'); openCart(); }
      if (skipped.length) K.toast('Some items unavailable', skipped.join(', '), 'warn');
    });

    $('#clearMyOrdersBtn').addEventListener('click', () => {
      if (!myOrders.length) { K.toast('Nothing to clear', 'No orders saved on this device.', 'info'); return; }
      myOrders = []; saveMyOrders(); renderMyOrders();
      K.toast('Cleared', 'Your saved order list was emptied.', 'success');
    });

    document.addEventListener('click', (e) => {
      if (e.target.closest('[data-goto-shop]')) { setView('storefront'); closeCart(); }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (!$('#successModal').hidden) return void ($('#successModal').hidden = true);
      if (!$('#checkoutModal').hidden) return closeCheckout();
      if (!$('#quickViewModal').hidden) return closeQuickView();
      if ($('#cart').classList.contains('is-open')) return closeCart();
    });

    /* re-fetch when the tab comes back, and poll for admin changes */
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
    window.addEventListener('online', () => { K.toast('Back online', 'Syncing with the store.', 'info'); refresh(); });
    window.addEventListener('offline', () => K.toast('You are offline', 'Orders cannot be sent until you reconnect.', 'warn'));

    K.startPolling(() => {
      renderAll();
      if (state.products.length) K.toast('Catalogue updated', 'New products or stock changes are live.', 'info');
    }, { everyMs: CONFIG.pollMs });
  }

  function bumpCart() {
    const b = $('#cartBtn');
    b.classList.remove('is-bump'); void b.offsetWidth; b.classList.add('is-bump');
  }

  /* ---------------- boot ---------------- */
  /** Warn if this page and the API are served from different ports — that means
   *  two different databases are in play. */
  function checkSameServer() {
    const here = window.location.port;
    const api = new URL(CONFIG.apiBase, window.location.href).port;
    if (api && here && api !== here) {
      document.body.innerHTML = `<div style="font-family:system-ui;padding:60px;max-width:680px;margin:auto;color:#0f172a">
        <h1 style="margin:0 0 10px">Wrong server</h1>
        <p style="color:#475569;line-height:1.6">This shop page came from port <b>${here}</b> but is talking to the API on port <b>${api}</b> — two different databases.</p>
        <p><a href="http://${window.location.hostname}:${api}/" style="color:#2563eb;font-weight:600">Open the shop on the right address</a></p>
      </div>`;
      return false;
    }
    return true;
  }

  async function init() {
    if (!checkSameServer()) return;
    loadMyOrders();
    wire();
    renderAll();          // paints the loading state immediately
    await refresh();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
