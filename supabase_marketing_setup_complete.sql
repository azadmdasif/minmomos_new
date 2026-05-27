-- ====================================================================
-- SUPABASE COMPLETE MARKETING CAMPAIGNS SETUP
-- Copy and paste this script into your Supabase Dashboard SQL Editor
-- to create all tables required for promotional campaigning, triggers,
-- message logs, and claim rewards.
-- ====================================================================

-- 1. Create marketing_message_logs table for tracking sent WhatsApp campaigns and cooldowns
CREATE TABLE IF NOT EXISTS marketing_message_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    phone TEXT NOT NULL,
    sent_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    message_text TEXT,
    type TEXT
);

CREATE INDEX IF NOT EXISTS idx_marketing_message_logs_phone ON marketing_message_logs (phone);
CREATE INDEX IF NOT EXISTS idx_marketing_message_logs_sent ON marketing_message_logs (sent_at DESC);


-- 2. Create custom_offers table for custom checkout checkout-triggered discounts
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

CREATE INDEX IF NOT EXISTS idx_custom_offers_active ON custom_offers (is_active);


-- 3. Create marketing_free_tags table for keeping track of promotional free item codes/tags
CREATE TABLE IF NOT EXISTS marketing_free_tags (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    item_name TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_marketing_free_tags_code ON marketing_free_tags (code);


-- 4. Create customer_free_claims table representing which free item rewards are assigned/claimed
CREATE TABLE IF NOT EXISTS customer_free_claims (
    id TEXT PRIMARY KEY,
    phone TEXT NOT NULL,
    tag_code TEXT NOT NULL,
    item_name TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    sent_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    is_claimed BOOLEAN DEFAULT FALSE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_customer_free_claims_phone ON customer_free_claims (phone);
CREATE INDEX IF NOT EXISTS idx_customer_free_claims_lookup ON customer_free_claims (phone, tag_code);


-- 5. Create marketing_discount_tags table for keeping track of promotional percentages for checkout coupons
CREATE TABLE IF NOT EXISTS marketing_discount_tags (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    discount_percentage NUMERIC NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_marketing_discount_tags_code ON marketing_discount_tags (code);


-- 6. Create customer_discount_claims table representing which discount coupons are assigned/claimed
CREATE TABLE IF NOT EXISTS customer_discount_claims (
    id TEXT PRIMARY KEY,
    phone TEXT NOT NULL,
    tag_code TEXT NOT NULL,
    discount_percentage NUMERIC NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    sent_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    is_claimed BOOLEAN DEFAULT FALSE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_customer_discount_claims_phone ON customer_discount_claims (phone);
CREATE INDEX IF NOT EXISTS idx_customer_discount_claims_lookup ON customer_discount_claims (phone, tag_code);


-- ====================================================================
-- SECURITY, ROW LEVEL SECURITY (RLS) AND PUBLIC API POLICIES
-- ====================================================================

-- Enable RLS for all marketing tables
ALTER TABLE marketing_message_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_free_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_free_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_discount_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_discount_claims ENABLE ROW LEVEL SECURITY;

-- Policy setup for marketing_message_logs
DROP POLICY IF EXISTS "Public Message Logs" ON marketing_message_logs;
CREATE POLICY "Public Message Logs" ON marketing_message_logs FOR ALL TO anon USING (true) WITH CHECK (true);

-- Policy setup for custom_offers
DROP POLICY IF EXISTS "Public Custom Offers" ON custom_offers;
CREATE POLICY "Public Custom Offers" ON custom_offers FOR ALL TO anon USING (true) WITH CHECK (true);

-- Policy setup for marketing_free_tags
DROP POLICY IF EXISTS "Public Free Tags" ON marketing_free_tags;
CREATE POLICY "Public Free Tags" ON marketing_free_tags FOR ALL TO anon USING (true) WITH CHECK (true);

-- Policy setup for customer_free_claims
DROP POLICY IF EXISTS "Public Free Claims" ON customer_free_claims;
CREATE POLICY "Public Free Claims" ON customer_free_claims FOR ALL TO anon USING (true) WITH CHECK (true);

-- Policy setup for marketing_discount_tags
DROP POLICY IF EXISTS "Public Discount Tags" ON marketing_discount_tags;
CREATE POLICY "Public Discount Tags" ON marketing_discount_tags FOR ALL TO anon USING (true) WITH CHECK (true);

-- Policy setup for customer_discount_claims
DROP POLICY IF EXISTS "Public Discount Claims" ON customer_discount_claims;
CREATE POLICY "Public Discount Claims" ON customer_discount_claims FOR ALL TO anon USING (true) WITH CHECK (true);
