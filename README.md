# Kavari Stores — Shop + Inventory Portal + API

A retail app in three parts, backed by a real server-side database, so the
shop a customer opens anywhere in the world shows the same catalogue and stock
as the portal you administer.

```
kavari-stores/
├── server.js          Node HTTP server + REST API + database (no dependencies)
├── data/db.json       the database (created automatically, never served publicly)
├── start-server.cmd   double-click launcher for Windows
├── index.html         customer storefront
├── login.html         staff sign-in
├── admin.html         inventory portal (requires sign-in)
├── store.js           shared API client (used by both front-ends)
├── app.js             storefront logic
├── admin.js           portal logic
├── styles.css         shared design system
└── admin.css          portal + login styles
```

## Running it

1. Double-click **`start-server.cmd`** (or run `node server.js`).
2. The console prints the addresses:

```
Shop     http://127.0.0.1:5052/
Staff    http://127.0.0.1:5052/login.html
API      http://127.0.0.1:5052/api/health
```

3. Staff sign in with **dayoife28@gmail.com / 12345**.

The port is chosen automatically if the default is busy; the console always
tells you the one in use.

### Reaching it from anywhere

The server listens on `0.0.0.0`, so any device on your network can reach it at
`http://<your-computer-ip>:5052`. For genuine worldwide access, put it behind a
host (Render, Railway, Fly.io, a VPS, or a tunnel like Cloudflare Tunnel or
ngrok) — the app needs no changes, only a hostname.

## Architecture

**One database, one source of truth.** `data/db.json` is read into memory at
boot and written back atomically (temp file + rename, serialised writes) after
every mutation. The browser holds no database at all — `store.js` is a thin API
client, so what you see is always what the server has.

**Stock is deducted on the server.** When a customer checks out, the server
re-reads live stock, rejects the order if any line no longer fits, and only then
deducts and records it. Two customers cannot oversell the last unit.

**Auth is enforced server-side.** The credentials live in `server.js`, never in
the browser. Sign-in returns a random bearer token held in memory (12-hour
expiry); every admin write requires it. Without a token the API answers `401`.

## API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/health` | — | Status, counts and public config |
| GET | `/api/products` | — | The live catalogue |
| POST | `/api/orders` | — | Place an order (validates and deducts stock) |
| GET | `/api/order?id=KAV-…` | — | Track one order |
| POST | `/api/auth/login` | — | Sign in, returns a token |
| GET | `/api/auth/verify` | token | Check a session |
| POST | `/api/auth/logout` | token | End a session |
| GET | `/api/admin/snapshot` | token | Products + orders + stock log + stats |
| POST | `/api/products` | token | Create a product |
| PUT | `/api/products/:id` | token | Update a product |
| DELETE | `/api/products/:id` | token | Delete a product |
| POST | `/api/products/:id/stock` | token | Restock / adjust (`{ delta, note }`) |
| GET | `/api/orders` | token | All orders |
| POST | `/api/orders/:id/status` | token | New / Confirmed / Delivered / Cancelled |
| DELETE | `/api/orders` | token | Clear the order list |
| GET | `/api/movements` | token | The stock-movement journal |
| GET | `/api/backup` | token | Full JSON export |
| POST | `/api/reset` | token | Restore the seed catalogue |

`/data/`, `/server.js` and `/node_modules/` are blocked from static serving.

## Customer flow (no payment integration)

1. Browse and filter — category chips, search, in-stock switch, sorting, quick view.
2. Stock badges: `In stock`, `Only N left` (below the product's reorder level),
   `Out of stock`. Out-of-stock items cannot be added — enforced in the UI *and*
   on the server.
3. Cart sidebar with quantity controls capped at live stock, delivery fee and
   free delivery from ₦50,000.
4. Checkout collects name, phone, optional email, address, city/state, delivery
   preference and notes, validated both sides.
5. The order is placed on the server and the customer gets:
   - a **WhatsApp message** pre-filled with the full order to the store on
     **0706 226 2036** (`wa.me/2347062262036`), opened automatically, and
   - a **pre-filled email to dayoife28@gmail.com**, plus a copy-details button.

   Payment is deliberately not integrated: the confirmation screen tells the
   customer the store will agree payment (transfer or on delivery) on WhatsApp.

## Admin portal

- **Dashboard** — inventory value (retail and cost), items tracked, low-stock
  alerts, orders received, restock list with one-click restocking, latest orders,
  and a live "synced x min ago" indicator.
- **Inventory** — search, category, stock-level and sort filters; each row has a
  thumbnail, SKU, category, price, stock, status, line value and actions:
  adjust stock, edit, delete (behind a confirm dialog; past orders and the log
  are kept).
- **Product editor** — image upload from the device (resized to 900 px and
  re-encoded as JPEG) or a pasted image URL, with live preview; name, SKU with
  uniqueness check and auto-generator, category suggestions, selling price, cost
  price, stock, reorder level, "sold per" unit, featured flag and description
  with a character counter; a live margin strip (margin/unit, markup %, stock
  value at cost) that warns when cost exceeds price; server-validated fields with
  inline errors.
- **Orders** — every checkout with full delivery details, a one-tap
  "Message customer" WhatsApp link, email, call link, status, copy-details and
  CSV export.
- **Transactions** — an automatic journal of every stock movement: sale,
  restock, edit, create, delete, reset, with quantity, value, timestamp and note.
- **Settings** — the live configuration, full JSON backup, and a guarded reset.

## Live updates

The storefront polls `/api/products` every 20 seconds and on tab focus; the
portal polls `/api/admin/snapshot`. Changes made in the portal appear in the
shop without a reload, on any device.

## Honest limitations

- **The token store is in memory.** Restarting the server signs everyone out
  (they simply sign in again). Sessions are not shared between server processes.
- **One process, one database file.** Correct and fast for a single store, but
  running several server instances against one file would need a real database
  (PostgreSQL/SQLite) behind it.
- **No HTTPS by itself.** On a public host, terminate TLS at the host or proxy.
- **The email step needs the customer to press send.** WhatsApp opens reliably;
  the email opens their mail client pre-filled. Sending it automatically needs
  an SMTP/provider key on the server — the one place to add when you want it.
- **Change the admin password** in `server.js` (`CONFIG.admin`) before putting
  this on the public internet, and prefer environment variables over the file.

## Suggested next steps

1. Move the database to SQLite or Postgres and the credentials to environment
   variables.
2. Automatic order emails to the store (SMTP or a provider API).
3. Customer accounts with order history and delivery tracking.
4. Suppliers and purchase orders, so restocking records who it came from.
