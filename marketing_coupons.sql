-- Create marketing_coupons table for keeping track of promo campaigns and coupons
CREATE TABLE IF NOT EXISTS marketing_coupons (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  phone TEXT NOT NULL,
  customer_name TEXT,
  coupon_code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  is_used BOOLEAN DEFAULT FALSE NOT NULL
);

-- Index for searching coupons by phone number
CREATE INDEX IF NOT EXISTS idx_marketing_coupons_phone ON marketing_coupons (phone);

-- Index for coupon code lookup
CREATE INDEX IF NOT EXISTS idx_marketing_coupons_code ON marketing_coupons (coupon_code);
