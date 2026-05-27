-- Create marketing_message_logs table for keeping track of sent WhatsApp messages and enforcing 4-day cooldown
CREATE TABLE IF NOT EXISTS marketing_message_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  phone TEXT NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  message_text TEXT,
  type TEXT
);

-- Index for tracing customer cooling status by phone and date
CREATE INDEX IF NOT EXISTS idx_marketing_message_logs_phone ON marketing_message_logs (phone);
CREATE INDEX IF NOT EXISTS idx_marketing_message_logs_sent ON marketing_message_logs (sent_at DESC);

-- Create custom_offers table for custom checkout-triggered discounts
CREATE TABLE IF NOT EXISTS custom_offers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  min_order_value NUMERIC DEFAULT 0 NOT NULL,
  free_item_name TEXT NULL, -- Nullable to support discount-only offers
  offer_type TEXT DEFAULT 'free_item' NOT NULL, -- 'free_item' or 'discount'
  discount_type TEXT NULL, -- 'percentage' or 'flat'
  discount_value NUMERIC NULL,
  target_group TEXT NOT NULL, -- 'all', 'L0', 'L1', 'L2', 'L3', 'L4', 'L5'
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Index for fetching active custom checkout offers
CREATE INDEX IF NOT EXISTS idx_custom_offers_active ON custom_offers (is_active);

-- Enable Row-Level Security
ALTER TABLE marketing_message_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_offers ENABLE ROW LEVEL SECURITY;

-- Grant ALL access to anonymous/anon users for localized POS client sync
DROP POLICY IF EXISTS "Public Message Logs" ON marketing_message_logs;
CREATE POLICY "Public Message Logs" ON marketing_message_logs FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public Custom Offers" ON custom_offers;
CREATE POLICY "Public Custom Offers" ON custom_offers FOR ALL TO anon USING (true) WITH CHECK (true);

