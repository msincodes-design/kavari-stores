/* ============================================================
   Kavari Stores — server
   Zero-dependency Node HTTP server + API + JSON-file database.
   Serves the storefront, the admin portal and the API from one
   origin, so every device in the world hits the same data.
   ============================================================ */
'use strict';

const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 5050);
const ROOT = __dirname;

/*
 * Where the database lives.
 *   Local:  <app>/data/db.json
 *   Hosted: set DATA_DIR=/data (or any mounted volume) so the database sits on
 *           persistent storage and survives redeploys.
 */
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const PORT_FILE = path.join(DATA_DIR, 'server-port.txt');
const SEED_FILE = path.join(ROOT, 'data', 'seed.json');

/* If the persistent volume is empty but the app ships a seed database, copy it in. */
async function seedFromFileIfEmpty() {
  try {
    await fsp.access(DB_FILE);
    return false;                       // already has a database
  } catch (_) { /* not there yet */ }
  try {
    await fsp.mkdir(DATA_DIR, { recursive: true });
    await fsp.copyFile(SEED_FILE, DB_FILE);
    console.log('[db] copied the seed database into', DATA_DIR);
    return true;
  } catch (_) {
    return false;                       // no seed file — the server will build one
  }
}

/* ---------------- config (mirrors the client CONFIG) ---------------- */
const CONFIG = {
  brand: 'Kavari Stores',
  currency: '₦',
  lowStockThreshold: 5,
  shippingFee: 2500,
  freeShippingFrom: 50000,
  storeWhatsApp: '2347062262036',
  storeWhatsAppDisplay: '0706 226 2036',
  adminEmail: 'dayoife28@gmail.com',
  admin: { email: 'dayoife28@gmail.com', password: '12345' }
};

const SEED = [
  { name: 'Anker 20W USB-C Fast Charger', sku: 'KAV-1001', category: 'Electronics', price: 18500, cost: 13200, stock: 42, reorder: 8,  unit: 'piece', featured: true,  image: '', description: 'Compact GaN charger with PowerIQ 3.0 — full charge in 45 minutes.' },
  { name: 'Sony WH-CH520 Wireless Headphones', sku: 'KAV-1002', category: 'Electronics', price: 74500, cost: 58000, stock: 4,  reorder: 6,  unit: 'piece', featured: true,  image: '', description: 'Up to 50 hours battery, multipoint pairing and on-ear controls.' },
  { name: 'Oraimo 20,000mAh Power Bank', sku: 'KAV-1003', category: 'Electronics', price: 26900, cost: 19500, stock: 0,  reorder: 6,  unit: 'piece', featured: false, image: '', description: 'Dual output fast-charge power bank with digital battery display.' },
  { name: 'JBL Go 4 Portable Speaker', sku: 'KAV-1004', category: 'Electronics', price: 42000, cost: 31000, stock: 17, reorder: 5,  unit: 'piece', featured: false, image: '', description: 'IP67 waterproof Bluetooth speaker with punchy bass and 7h playtime.' },
  { name: 'Premium Cotton Oxford Shirt', sku: 'KAV-2001', category: 'Apparel', price: 22000, cost: 14000, stock: 31, reorder: 10, unit: 'piece', featured: true,  image: '', description: 'Breathable 100% cotton oxford weave, tailored regular fit.' },
  { name: 'Unisex Hooded Sweatshirt', sku: 'KAV-2002', category: 'Apparel', price: 31500, cost: 21500, stock: 3,  reorder: 6,  unit: 'piece', featured: false, image: '', description: 'Heavyweight fleece-lined hoodie with brushed inner for warmth.' },
  { name: 'Ankara Print Midi Dress', sku: 'KAV-2003', category: 'Apparel', price: 38900, cost: 24000, stock: 12, reorder: 5,  unit: 'piece', featured: false, image: '', description: 'Hand-tailored midi dress in authentic wax-print cotton.' },
  { name: 'Performance Running Sneakers', sku: 'KAV-2004', category: 'Apparel', price: 56000, cost: 41000, stock: 8,  reorder: 4,  unit: 'pair',  featured: false, image: '', description: 'Responsive foam midsole with breathable engineered mesh upper.' },
  { name: 'Golden Penny Semovita 2kg', sku: 'KAV-3001', category: 'Groceries', price: 6800, cost: 5200, stock: 96, reorder: 20, unit: 'bag',   featured: false, image: '', description: 'Fortified semolina flour, smooth texture — family pack.' },
  { name: 'Extra Virgin Olive Oil 1L', sku: 'KAV-3002', category: 'Groceries', price: 14500, cost: 10800, stock: 23, reorder: 10, unit: 'bottle', featured: false, image: '', description: 'Cold-pressed extra virgin olive oil in a dark glass bottle.' },
  { name: 'Peak Milk Powder 400g', sku: 'KAV-3003', category: 'Groceries', price: 7200, cost: 5400, stock: 2,  reorder: 12, unit: 'tin',   featured: false, image: '', description: 'Full-cream instant milk powder, rich in calcium and vitamin D.' },
  { name: 'Basmati Rice 5kg Premium', sku: 'KAV-3004', category: 'Groceries', price: 18900, cost: 14200, stock: 54, reorder: 15, unit: 'bag',   featured: false, image: '', description: 'Aged long-grain basmati with a light, non-sticky cook.' },
  { name: 'Ceramic Non-Stick Frying Pan 28cm', sku: 'KAV-4001', category: 'Home', price: 24000, cost: 16500, stock: 15, reorder: 5,  unit: 'piece', featured: false, image: '', description: 'PFOA-free ceramic coating, induction-ready forged aluminium body.' },
  { name: 'Stainless Steel Water Dispenser', sku: 'KAV-4002', category: 'Home', price: 68000, cost: 52000, stock: 6,  reorder: 3,  unit: 'piece', featured: false, image: '', description: '10L insulated dispenser keeps drinks cold for up to 12 hours.' },
  { name: 'Shea Butter Body Lotion 500ml', sku: 'KAV-5001', category: 'Beauty', price: 9800, cost: 6100, stock: 37, reorder: 12, unit: 'bottle', featured: false, image: '', description: 'Unrefined shea butter with vitamin E for 24-hour deep hydration.' },
  { name: 'Vitamin C Brightening Serum', sku: 'KAV-5002', category: 'Beauty', price: 17500, cost: 11200, stock: 1,  reorder: 6,  unit: 'bottle', featured: true,  image: '', description: '15% stabilised vitamin C serum with hyaluronic acid and niacinamide.' },
  { name: 'Hardcover A5 Notebook Set (3)', sku: 'KAV-6001', category: 'Stationery', price: 5400, cost: 3600, stock: 61, reorder: 20, unit: 'set',   featured: false, image: '', description: '120gsm bleed-resistant paper, elastic closure and ribbon marker.' },
  { name: 'Gel Pen Pack — 12 Colours', sku: 'KAV-6002', category: 'Stationery', price: 3900, cost: 2400, stock: 88, reorder: 25, unit: 'pack',  featured: false, image: '', description: 'Smooth-flow 0.7mm gel ink in twelve vivid, quick-dry colours.' },
  { name: 'Adjustable Dumbbell Set 20kg', sku: 'KAV-7001', category: 'Sports', price: 92000, cost: 71000, stock: 5,  reorder: 2,  unit: 'set',   featured: false, image: '', description: 'Quick-lock adjustable plates with textured anti-slip chrome handles.' },
  { name: 'Yoga Mat with Carry Strap', sku: 'KAV-7002', category: 'Sports', price: 15800, cost: 10500, stock: 0,  reorder: 8,  unit: 'piece', featured: false, image: '', description: '6mm double-sided TPE mat with alignment lines and carry strap.' }
];

/* ============================================================
   DATABASE — a single JSON document, written atomically
   ============================================================ */
let db = null;
let writeChain = Promise.resolve();

function seedDb() {
  let uid = 1;
  return {
    meta: { createdAt: new Date().toISOString(), version: 1, nextUid: 1 },
    products: SEED.map((p) => ({ id: `p${uid++}`, ...p })),
    orders: [],
    movements: [],
    _nextUid: uid
  };
}

async function loadDb() {
  try {
    await fsp.mkdir(DATA_DIR, { recursive: true });
    await seedFromFileIfEmpty();
    const raw = await fsp.readFile(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.products) || parsed.products.length === 0) throw new Error('empty');
    db = parsed;
    db.orders = Array.isArray(db.orders) ? db.orders : [];
    db.movements = Array.isArray(db.movements) ? db.movements : [];
    db.meta = db.meta || { createdAt: new Date().toISOString(), version: 1, nextUid: 1 };
    db._nextUid = db._nextUid || (db.products.reduce((max, p) => Math.max(max, Number(String(p.id).replace(/\D/g, '')) || 0), 0) + 1);
    console.log(`[db] loaded ${db.products.length} products, ${db.orders.length} orders`);
  } catch (err) {
    db = seedDb();
    console.log(`[db] seeded a fresh database (${err.message})`);
    await saveDb();
  }
}

function saveDb() {
  // serialise writes so two requests can never interleave a half-written file
  writeChain = writeChain.then(async () => {
    const tmp = `${DB_FILE}.${process.pid}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify(db, null, 2), 'utf8');
    await fsp.rename(tmp, DB_FILE);
  }).catch((err) => { console.error('[db] write failed:', err.message); });
  return writeChain;
}

const nextId = () => `p${db._nextUid++}`;

/* ============================================================
   HELPERS
   ============================================================ */
const money = (n) => CONFIG.currency + Number(n || 0).toLocaleString('en-NG', { maximumFractionDigits: 2 });
const nowIso = () => new Date().toISOString();

function fullTime(iso) {
  return new Date(iso).toLocaleString('en-NG', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true
  });
}

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

const GLYPHS = { Electronics: '🎧', Apparel: '👕', Groceries: '🛒', Home: '🏠', Beauty: '🧴', Stationery: '✏️', Sports: '🏀', Toys: '🧸' };
const glyphFor = (p) => GLYPHS[p.category] || '📦';
const reorderLevel = (p) => (Number.isFinite(p.reorder) && p.reorder > 0 ? p.reorder : CONFIG.lowStockThreshold);
const stockState = (p) => (p.stock <= 0 ? 'out' : p.stock < reorderLevel(p) ? 'low' : 'in');

function decorate(p) {
  return { ...p, glyph: glyphFor(p), reorderLevel: reorderLevel(p), stockState: stockState(p), value: p.price * p.stock };
}

/* ---------------- validation (server is the source of truth) ---------------- */
function validateProduct(input, editingId) {
  const errors = {};
  const name = String(input.name || '').trim();
  const sku = String(input.sku || '').trim().toUpperCase();
  const category = String(input.category || '').trim();
  const price = Number(input.price);
  const cost = input.cost === '' || input.cost == null ? 0 : Number(input.cost);
  const stock = Number(input.stock);
  const reorder = input.reorder === '' || input.reorder == null ? CONFIG.lowStockThreshold : Number(input.reorder);
  const unit = String(input.unit || 'piece').trim() || 'piece';
  const description = String(input.description || '').trim();
  const image = String(input.image || '').trim();

  if (!name) errors.name = 'Product name is required.';
  else if (name.length < 3) errors.name = 'Use at least 3 characters.';
  else if (name.length > 60) errors.name = 'Keep it under 60 characters.';

  if (!sku) errors.sku = 'SKU is required.';
  else if (!/^[A-Z0-9][A-Z0-9-]{2,17}$/.test(sku)) errors.sku = '3–18 characters: A–Z, 0–9 and hyphens only.';
  else if (db.products.some((p) => p.sku.toUpperCase() === sku && p.id !== editingId)) errors.sku = 'That SKU is already in use.';

  if (!category) errors.category = 'Category is required.';
  else if (category.length > 24) errors.category = 'Keep it under 24 characters.';

  if (input.price === '' || input.price == null) errors.price = 'Selling price is required.';
  else if (!Number.isFinite(price)) errors.price = 'Price must be a number.';
  else if (price <= 0) errors.price = 'Price must be greater than zero.';
  else if (price > 100000000) errors.price = 'Price looks unrealistically high.';

  if (!Number.isFinite(cost) || cost < 0) errors.cost = 'Cost price cannot be negative.';
  else if (Number.isFinite(price) && price > 0 && cost > price) errors.cost = 'Cost price is above the selling price — you would sell at a loss.';

  if (input.stock === '' || input.stock == null) errors.stock = 'Stock quantity is required.';
  else if (!Number.isFinite(stock)) errors.stock = 'Stock must be a number.';
  else if (!Number.isInteger(stock)) errors.stock = 'Stock must be a whole number.';
  else if (stock < 0) errors.stock = 'Stock cannot be negative.';
  else if (stock > 1000000) errors.stock = 'Stock exceeds the warehouse maximum.';

  if (!Number.isFinite(reorder) || reorder < 0) errors.reorder = 'Reorder level cannot be negative.';
  else if (!Number.isInteger(reorder)) errors.reorder = 'Reorder level must be a whole number.';

  if (description.length > 180) errors.description = 'Keep the description under 180 characters.';
  if (image && !/^(data:image\/|https?:\/\/)/i.test(image)) errors.image = 'Use an uploaded image or an http(s) link.';
  if (image.length > 1200000) errors.image = 'That image is too large — upload a smaller file.';

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    clean: {
      name, sku, category,
      price: Math.round(price * 100) / 100,
      cost: Math.round((Number.isFinite(cost) ? cost : 0) * 100) / 100,
      stock, reorder: Math.round(reorder), unit,
      description, image, featured: !!input.featured
    }
  };
}

function validateCustomer(input) {
  const errors = {};
  const name = String(input.name || '').trim();
  const phone = String(input.phone || '').trim();
  const email = String(input.email || '').trim();
  const address = String(input.address || '').trim();
  const city = String(input.city || '').trim();
  const notes = String(input.notes || '').trim();
  const delivery = String(input.delivery || 'Standard (1–3 days)').trim();

  if (!name) errors.name = 'Your name is required.';
  else if (name.length < 2) errors.name = 'Please enter your full name.';
  else if (name.length > 60) errors.name = 'Keep it under 60 characters.';

  const digits = phone.replace(/[^\d]/g, '');
  if (!phone) errors.phone = 'Phone number is required.';
  else if (digits.length < 10 || digits.length > 15) errors.phone = 'Enter a valid phone number (10–15 digits).';

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errors.email = 'That email address looks invalid.';

  if (!address) errors.address = 'Delivery address is required.';
  else if (address.length < 8) errors.address = 'Add a bit more detail so the rider can find you.';
  else if (address.length > 220) errors.address = 'Keep it under 220 characters.';

  if (!city) errors.city = 'City or state is required.';
  else if (city.length > 60) errors.city = 'Keep it under 60 characters.';

  if (notes.length > 200) errors.notes = 'Keep notes under 200 characters.';

  return { ok: Object.keys(errors).length === 0, errors, clean: { name, phone, email, address, city, notes, delivery } };
}

/* ---------------- movement log ---------------- */
function logMovement(type, product, qty, note, total) {
  db.movements.unshift({
    id: 'MV-' + Date.now().toString(36).toUpperCase() + Math.floor(Math.random() * 90 + 10),
    at: nowIso(), type, qty: qty || 0, note: note || '',
    productId: product ? product.id : null,
    name: product ? product.name : (note || 'Unknown product'),
    sku: product ? product.sku : '',
    glyph: product ? glyphFor(product) : '📦',
    total: total || 0
  });
  if (db.movements.length > 500) db.movements.length = 500;
}

function generateOrderId() {
  const d = new Date();
  const stamp = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `KAV-${stamp}-${Math.floor(Math.random() * 9000 + 1000)}`;
}

/* ============================================================
   SESSIONS — admin tokens, held in memory
   ============================================================ */
const sessions = new Map(); // token -> { email, at }
const SESSION_TTL = 1000 * 60 * 60 * 12;
const loginAttempts = new Map(); // ip -> { count, until }

function issueToken(email) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { email, at: Date.now() });
  return token;
}
function validToken(token) {
  const s = token && sessions.get(token);
  if (!s) return null;
  if (Date.now() - s.at > SESSION_TTL) { sessions.delete(token); return null; }
  return s;
}
function authEmail(req) {
  const h = req.headers['authorization'] || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : (req.headers['x-kavari-token'] || '');
  const s = validToken(token);
  return s ? s.email : null;
}

/* ============================================================
   HTTP plumbing
   ============================================================ */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8'
};

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function readBody(req, limit = 6 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('Payload too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (e) { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

/* ============================================================
   API
   ============================================================ */
async function handleApi(req, res, url) {
  const p = url.pathname.replace(/^\/api/, '') || '/';
  const method = req.method.toUpperCase();

  /* ---- health ---- */
  if (p === '/health') {
    return sendJson(res, 200, {
      ok: true,
      at: nowIso(),
      products: db.products.length,
      orders: db.orders.length,
      config: {
        brand: CONFIG.brand, currency: CONFIG.currency,
        lowStockThreshold: CONFIG.lowStockThreshold,
        shippingFee: CONFIG.shippingFee, freeShippingFrom: CONFIG.freeShippingFrom,
        storeWhatsApp: CONFIG.storeWhatsApp, storeWhatsAppDisplay: CONFIG.storeWhatsAppDisplay,
        adminEmail: CONFIG.adminEmail
      }
    });
  }

  /* ---- public: catalogue ---- */
  if (p === '/products' && method === 'GET') {
    return sendJson(res, 200, { products: db.products.map(decorate), at: nowIso() });
  }

  /* ---- public: track an order by id ---- */
  if (p === '/order' && method === 'GET') {
    const id = (url.searchParams.get('id') || '').toUpperCase();
    const o = db.orders.find((x) => x.id === id);
    if (!o) return sendJson(res, 404, { error: 'Order not found.' });
    return sendJson(res, 200, { order: o });
  }

  /* ---- public: place an order ---- */
  if (p === '/orders' && method === 'POST') {
    const body = await readBody(req);
    const v = validateCustomer(body.customer || {});
    if (!v.ok) return sendJson(res, 400, { error: 'Validation failed', phase: 'customer', errors: v.errors });

    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) return sendJson(res, 400, { error: 'Your cart is empty.', phase: 'cart' });

    // resolve every line against live stock before changing anything
    const lines = [];
    for (const it of items) {
      const product = db.products.find((x) => x.id === it.id);
      const qty = Math.floor(Number(it.qty));
      if (!product) return sendJson(res, 409, { error: 'A product in your cart is no longer available. Please refresh.', phase: 'cart' });
      if (!Number.isFinite(qty) || qty < 1) return sendJson(res, 400, { error: `Invalid quantity for ${product.name}.`, phase: 'cart' });
      if (qty > product.stock) {
        return sendJson(res, 409, {
          error: `Stock changed: only ${product.stock} of ${product.name} left. Please adjust your cart.`,
          phase: 'cart'
        });
      }
      lines.push({ product, qty, lineTotal: product.price * qty });
    }

    const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
    const shipping = subtotal >= CONFIG.freeShippingFrom ? 0 : CONFIG.shippingFee;
    const order = {
      id: generateOrderId(),
      at: nowIso(),
      status: 'New',
      customer: v.clean,
      items: lines.map((l) => ({
        id: l.product.id, name: l.product.name, sku: l.product.sku,
        glyph: glyphFor(l.product), unit: l.product.unit || 'piece',
        qty: l.qty, price: l.product.price, lineTotal: l.lineTotal
      })),
      subtotal, shipping, total: subtotal + shipping,
      units: lines.reduce((s, l) => s + l.qty, 0)
    };

    // all-or-nothing: deduct, record, log
    lines.forEach((l) => { l.product.stock -= l.qty; });
    db.orders.unshift(order);
    lines.forEach((l) => logMovement('sale', l.product, -l.qty, `Sold on order ${order.id}`, l.lineTotal));
    await saveDb();

    order.whatsappUrl = whatsappUrl(order);
    order.mailtoUrl = mailtoUrl(order);
    order.plainText = orderText(order);
    console.log(`[order] ${order.id} — ${order.customer.name} — ${money(order.total)} (${order.units} units)`);
    return sendJson(res, 201, { order });
  }

  /* ---- admin: login ---- */
  if (p === '/auth/login' && method === 'POST') {
    const ip = req.socket.remoteAddress || 'unknown';
    const rec = loginAttempts.get(ip) || { count: 0, until: 0 };
    if (rec.count >= 8 && Date.now() < rec.until) {
      return sendJson(res, 429, { error: 'Too many failed attempts. Try again in a few minutes.' });
    }

    const body = await readBody(req);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');

    const ok = email === CONFIG.admin.email.toLowerCase() && password === CONFIG.admin.password;
    if (!ok) {
      rec.count += 1;
      rec.until = Date.now() + 5 * 60 * 1000;
      loginAttempts.set(ip, rec);
      return sendJson(res, 401, { error: 'Incorrect email or password.' });
    }

    loginAttempts.delete(ip);
    const token = issueToken(email);
    console.log(`[auth] sign-in from ${ip}`);
    return sendJson(res, 200, { token, email, expiresInMinutes: SESSION_TTL / 60000 });
  }

  if (p === '/auth/verify' && method === 'GET') {
    const email = authEmail(req);
    if (!email) return sendJson(res, 401, { error: 'Not signed in.' });
    return sendJson(res, 200, { email });
  }

  if (p === '/auth/logout' && method === 'POST') {
    const h = req.headers['authorization'] || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : '';
    if (token) sessions.delete(token);
    return sendJson(res, 200, { ok: true });
  }

  /* ---- everything below needs a valid admin session ---- */
  const admin = authEmail(req);
  if (!admin) return sendJson(res, 401, { error: 'Sign in to continue.', needsAuth: true });

  if (p === '/admin/snapshot' && method === 'GET') {
    return sendJson(res, 200, {
      products: db.products.map(decorate),
      orders: db.orders,
      movements: db.movements,
      stats: {
        stockValue: db.products.reduce((s, x) => s + x.price * x.stock, 0),
        costValue: db.products.reduce((s, x) => s + (Number(x.cost) || 0) * x.stock, 0),
        units: db.products.reduce((s, x) => s + x.stock, 0),
        lowStock: db.products.filter((x) => x.stock < reorderLevel(x)).length,
        orderRevenue: db.orders.reduce((s, o) => s + o.total, 0)
      },
      config: {
        brand: CONFIG.brand, currency: CONFIG.currency,
        lowStockThreshold: CONFIG.lowStockThreshold,
        shippingFee: CONFIG.shippingFee, freeShippingFrom: CONFIG.freeShippingFrom,
        storeWhatsApp: CONFIG.storeWhatsApp, storeWhatsAppDisplay: CONFIG.storeWhatsAppDisplay,
        adminEmail: CONFIG.adminEmail, admin: { email: CONFIG.admin.email }
      },
      at: nowIso()
    });
  }

  if (p === '/products' && method === 'POST') {
    const body = await readBody(req);
    const v = validateProduct(body);
    if (!v.ok) return sendJson(res, 400, { error: 'Validation failed', errors: v.errors });
    const product = { id: nextId(), ...v.clean };
    db.products.unshift(product);
    logMovement('create', product, product.stock, 'New product added to the catalogue', 0);
    await saveDb();
    return sendJson(res, 201, { product: decorate(product) });
  }

  const productMatch = p.match(/^\/products\/([A-Za-z0-9_-]+)$/);
  if (productMatch) {
    const id = productMatch[1];
    const idx = db.products.findIndex((x) => x.id === id);
    if (idx === -1) return sendJson(res, 404, { error: 'Product not found.' });

    if (method === 'PUT' || method === 'PATCH') {
      const body = await readBody(req);
      const before = db.products[idx];
      const prevStock = before.stock;
      const v = validateProduct(body, id);
      if (!v.ok) return sendJson(res, 400, { error: 'Validation failed', errors: v.errors });
      db.products[idx] = { ...before, ...v.clean };
      logMovement('edit', db.products[idx], db.products[idx].stock - prevStock, 'Product details updated', 0);
      await saveDb();
      return sendJson(res, 200, { product: decorate(db.products[idx]) });
    }

    if (method === 'DELETE') {
      const [removed] = db.products.splice(idx, 1);
      logMovement('delete', removed, -removed.stock, 'Product deleted from the catalogue', 0);
      await saveDb();
      return sendJson(res, 200, { deleted: removed.name });
    }
  }

  const stockMatch = p.match(/^\/products\/([A-Za-z0-9_-]+)\/stock$/);
  if (stockMatch && method === 'POST') {
    const product = db.products.find((x) => x.id === stockMatch[1]);
    if (!product) return sendJson(res, 404, { error: 'Product not found.' });
    const body = await readBody(req);
    const delta = Number(body.delta);
    if (!Number.isFinite(delta) || !Number.isInteger(delta) || delta === 0) {
      return sendJson(res, 400, { error: 'Enter a whole number (negative to remove).' });
    }
    if (product.stock + delta < 0) {
      return sendJson(res, 409, { error: `Cannot remove ${Math.abs(delta)} — only ${product.stock} on hand.` });
    }
    product.stock += delta;
    logMovement(delta > 0 ? 'restock' : 'edit', product, delta, body.note || (delta > 0 ? 'Stock received' : 'Stock removed'), 0);
    await saveDb();
    return sendJson(res, 200, { product: decorate(product) });
  }

  const statusMatch = p.match(/^\/orders\/([A-Za-z0-9-]+)\/status$/);
  if (statusMatch && method === 'POST') {
    const order = db.orders.find((x) => x.id === statusMatch[1]);
    if (!order) return sendJson(res, 404, { error: 'Order not found.' });
    const body = await readBody(req);
    const status = String(body.status || '');
    if (!['New', 'Confirmed', 'Delivered', 'Cancelled'].includes(status)) {
      return sendJson(res, 400, { error: 'Unknown status.' });
    }
    order.status = status;
    await saveDb();
    return sendJson(res, 200, { order });
  }

  if (p === '/orders' && method === 'GET') {
    return sendJson(res, 200, { orders: db.orders });
  }

  if (p === '/orders' && method === 'DELETE') {
    const n = db.orders.length;
    db.orders = [];
    await saveDb();
    return sendJson(res, 200, { cleared: n });
  }

  if (p === '/movements' && method === 'GET') {
    return sendJson(res, 200, { movements: db.movements });
  }

  if (p === '/backup' && method === 'GET') {
    return sendJson(res, 200, { exportedAt: nowIso(), products: db.products, orders: db.orders, movements: db.movements });
  }

  if (p === '/reset' && method === 'POST') {
    const fresh = seedDb();
    fresh.movements = [{ id: 'MV-RESET', at: nowIso(), type: 'reset', qty: 0, note: 'Database reset to the seed catalogue', name: 'Catalogue reset', sku: '', glyph: '📦', total: 0 }];
    db = fresh;
    await saveDb();
    console.log('[db] reset to seed catalogue');
    return sendJson(res, 200, { ok: true });
  }

  return sendJson(res, 404, { error: `No API route for ${method} ${p}` });
}

/* ============================================================
   STATIC FILES
   ============================================================ */
async function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/' || rel === '') rel = '/index.html';

  // never serve the database, the server code or anything outside the app folder
  const BLOCKED = ['/data/', '/node_modules/'];
  const BLOCKED_FILES = ['/server.js', '/package.json', '/package-lock.json'];
  const lower = rel.toLowerCase();
  if (lower.includes('..') || BLOCKED.some((b) => lower.startsWith(b)) || BLOCKED_FILES.includes(lower)) {
    return sendJson(res, 403, { error: 'Forbidden' });
  }

  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT)) return sendJson(res, 403, { error: 'Forbidden' });

  try {
    const stat = await fsp.stat(file);
    if (stat.isDirectory()) return serveStatic(req, res, new URL(rel.replace(/\/?$/, '/index.html'), 'http://x'));
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': ext === '.html' ? 'no-store' : 'no-cache'
    });
    fs.createReadStream(file).pipe(res);
  } catch (_) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html><meta charset="utf-8"><title>Not found</title>
      <div style="font-family:system-ui;padding:60px;max-width:640px;margin:auto;color:#0f172a">
      <h1 style="margin:0 0 8px">404 — page not found</h1>
      <p style="color:#475569">Kavari Stores could not find <code>${rel.replace(/[<>]/g, '')}</code>.</p>
      <p><a href="/" style="color:#2563eb">Go to the shop</a> · <a href="/login.html" style="color:#2563eb">Staff sign-in</a></p></div>`);
  }
}

/* ============================================================
   SERVER
   ============================================================ */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  // CORS so the same app can be opened from any host (LAN, tunnel, phone)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Kavari-Token');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  try {
    if (url.pathname.startsWith('/api')) return await handleApi(req, res, url);
    return await serveStatic(req, res, url);
  } catch (err) {
    console.error('[error]', err);
    if (!res.headersSent) sendJson(res, 500, { error: err.message || 'Server error' });
    else res.end();
  }
});

/* ---------------- start ---------------- */
(async () => {
  await loadDb();

  const tryListen = (port) => new Promise((resolve, reject) => {
    const onError = (err) => { server.removeListener('listening', onOk); reject(err); };
    const onOk = () => { server.removeListener('error', onError); resolve(port); };
    server.once('error', onError);
    server.once('listening', onOk);
    server.listen(port, '0.0.0.0');
  });

  let port = PORT;
  for (let attempt = 0; attempt < 12; attempt++) {
    try { port = await tryListen(PORT + attempt); break; }
    catch (err) {
      if (err.code !== 'EADDRINUSE') { console.error('[fatal]', err.message); process.exit(1); }
    }
  }

  try { await fsp.writeFile(PORT_FILE, String(port), 'utf8'); } catch (_) { /* not fatal on a read-only filesystem */ }

  console.log('');
  const shown = process.env.PUBLIC_URL || `http://127.0.0.1:${port}`;
  console.log('  Kavari Stores is running');
  console.log(`  Shop        ${shown}/`);
  console.log(`  Staff       ${shown}/login.html`);
  console.log(`  API         ${shown}/api/health`);
  console.log(`  Database    ${DB_FILE}`);
  console.log(`  Admin       ${CONFIG.admin.email}`);
  if (!process.env.DATA_DIR) console.log('  Tip         set DATA_DIR on a host so the database lives on persistent storage');
  console.log('');
})();

process.on('SIGINT', () => { console.log('\n[exit] saving and stopping'); saveDb().then(() => process.exit(0)); });
process.on('SIGTERM', () => { saveDb().then(() => process.exit(0)); });
