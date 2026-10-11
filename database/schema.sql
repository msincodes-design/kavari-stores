-- ============================================================
--  Kavari Stores — database schema (Postgres)
--  Paste this whole file into Neon's SQL Editor and press Run.
--  Safe to run more than once: it only creates what is missing.
-- ============================================================

CREATE TABLE IF NOT EXISTS products (
  id          TEXT PRIMARY KEY,
  name        TEXT        NOT NULL,
  sku         TEXT        NOT NULL UNIQUE,
  category    TEXT        NOT NULL,
  price       NUMERIC(12,2) NOT NULL CHECK (price > 0),
  cost        NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (cost >= 0),
  stock       INTEGER     NOT NULL DEFAULT 0 CHECK (stock >= 0),
  reorder     INTEGER     NOT NULL DEFAULT 5 CHECK (reorder >= 0),
  unit        TEXT        NOT NULL DEFAULT 'piece',
  featured    BOOLEAN     NOT NULL DEFAULT FALSE,
  image       TEXT        NOT NULL DEFAULT '',
  description TEXT        NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS products_category_idx ON products (category);
CREATE INDEX IF NOT EXISTS products_stock_idx    ON products (stock);

CREATE TABLE IF NOT EXISTS orders (
  id         TEXT PRIMARY KEY,
  placed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status     TEXT        NOT NULL DEFAULT 'New'
             CHECK (status IN ('New', 'Confirmed', 'Delivered', 'Cancelled')),
  customer   JSONB       NOT NULL,
  items      JSONB       NOT NULL,
  subtotal   NUMERIC(12,2) NOT NULL,
  shipping   NUMERIC(12,2) NOT NULL DEFAULT 0,
  total      NUMERIC(12,2) NOT NULL,
  units      INTEGER     NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS orders_placed_idx ON orders (placed_at DESC);
CREATE INDEX IF NOT EXISTS orders_status_idx ON orders (status);

CREATE TABLE IF NOT EXISTS movements (
  id         TEXT PRIMARY KEY,
  at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  type       TEXT        NOT NULL,
  product_id TEXT,
  name       TEXT        NOT NULL DEFAULT '',
  sku        TEXT        NOT NULL DEFAULT '',
  glyph      TEXT        NOT NULL DEFAULT 'package',
  qty        INTEGER     NOT NULL DEFAULT 0,
  total      NUMERIC(12,2) NOT NULL DEFAULT 0,
  note       TEXT        NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS movements_at_idx ON movements (at DESC);
