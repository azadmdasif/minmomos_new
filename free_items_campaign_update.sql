-- Create marketing_free_tags table for keeping track of promotional free item codes/tags
CREATE TABLE IF NOT EXISTS marketing_free_tags (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  item_name TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Index for tags lookup
CREATE INDEX IF NOT EXISTS idx_marketing_free_tags_code ON marketing_free_tags (code);

-- Create customer_free_claims table representing which campaign-tags are sent to which customers
CREATE TABLE IF NOT EXISTS customer_free_claims (
  id TEXT PRIMARY KEY,
  phone TEXT NOT NULL,
  tag_code TEXT NOT NULL,
  item_name TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  is_claimed BOOLEAN DEFAULT FALSE NOT NULL
);

-- Index for searching assigned claims by customer phone and code
CREATE INDEX IF NOT EXISTS idx_customer_free_claims_phone ON customer_free_claims (phone);
CREATE INDEX IF NOT EXISTS idx_customer_free_claims_lookup ON customer_free_claims (phone, tag_code);
