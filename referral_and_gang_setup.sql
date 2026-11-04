-- ==============================================================================
-- MinMomos POS: Referral Program & Student Gang Database Migration
-- Run this script in the Supabase SQL Editor or PostgreSQL Console
-- ==============================================================================

-- 1. Add Referral Program & Student Gang columns to 'customers' table if not already present
DO $$ 
BEGIN
    -- referral_code: Unique code assigned to customers with >1000 LTV or 10+ orders
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'referral_code') THEN
        ALTER TABLE customers ADD COLUMN referral_code TEXT UNIQUE;
    END IF;

    -- is_referral_active: Flag indicating referral privilege is unlocked
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'is_referral_active') THEN
        ALTER TABLE customers ADD COLUMN is_referral_active BOOLEAN DEFAULT FALSE;
    END IF;

    -- referral_wallet: Balance earned by referrer when referees redeem their code
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'referral_wallet') THEN
        ALTER TABLE customers ADD COLUMN referral_wallet NUMERIC DEFAULT 0;
    END IF;

    -- referred_by_code: Code used by this customer on their first purchase
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'referred_by_code') THEN
        ALTER TABLE customers ADD COLUMN referred_by_code TEXT;
    END IF;

    -- gang_coupon_code: Unique Bring-Your-Gang coupon code generated for student customers
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'gang_coupon_code') THEN
        ALTER TABLE customers ADD COLUMN gang_coupon_code TEXT UNIQUE;
    END IF;

    -- referral_code_sent: Flag indicating if VIP referral code has been sent/shared to customer
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'referral_code_sent') THEN
        ALTER TABLE customers ADD COLUMN referral_code_sent BOOLEAN DEFAULT FALSE;
    END IF;

    -- gang_coupon_sent: Flag indicating if student gang coupon has been sent/shared to student (FIRST PRIORITY FOR STUDENTS)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'gang_coupon_sent') THEN
        ALTER TABLE customers ADD COLUMN gang_coupon_sent BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- Set all existing referral and gang codes as unsent by default
UPDATE customers SET referral_code_sent = FALSE WHERE referral_code_sent IS NULL;
UPDATE customers SET gang_coupon_sent = FALSE WHERE gang_coupon_sent IS NULL;

-- 2. Create referral redemptions audit log
CREATE TABLE IF NOT EXISTS referral_redemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_phone TEXT NOT NULL,
    referrer_code TEXT NOT NULL,
    referee_phone TEXT NOT NULL,
    bill_number NUMERIC,
    discount_amount NUMERIC NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for quick lookups on referrals
CREATE INDEX IF NOT EXISTS idx_referral_redemptions_referrer_code ON referral_redemptions(referrer_code);
CREATE INDEX IF NOT EXISTS idx_referral_redemptions_referee_phone ON referral_redemptions(referee_phone);
CREATE INDEX IF NOT EXISTS idx_customers_referral_code ON customers(referral_code);
CREATE INDEX IF NOT EXISTS idx_customers_gang_coupon ON customers(gang_coupon_code);
CREATE INDEX IF NOT EXISTS idx_customers_referral_code_sent ON customers(referral_code_sent);
CREATE INDEX IF NOT EXISTS idx_customers_gang_coupon_sent ON customers(gang_coupon_sent);

-- 3. Create student gang registrations audit log (Flat 50% off up to 200 INR on 3+ members)
CREATE TABLE IF NOT EXISTS student_gang_registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gang_coupon_code TEXT,
    lead_phone TEXT NOT NULL,
    bill_number NUMERIC,
    college TEXT,
    member_phones TEXT[] NOT NULL,
    member_names TEXT[],
    member_count INTEGER DEFAULT 3,
    discount_amount NUMERIC DEFAULT 200,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_gang_coupon ON student_gang_registrations(gang_coupon_code);

-- 4. Atomic function to process referral reward (credits exact discount amount as MinCoins to referrer)
CREATE OR REPLACE FUNCTION process_referral_reward(
    p_referrer_code TEXT,
    p_referee_phone TEXT,
    p_bill_number NUMERIC,
    p_discount_amount NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_referrer RECORD;
    v_result JSONB;
BEGIN
    -- Find referrer by unique code
    SELECT * INTO v_referrer 
    FROM customers 
    WHERE UPPER(referral_code) = UPPER(p_referrer_code)
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid referral code');
    END IF;

    -- Prevent self-referral
    IF v_referrer.phone = p_referee_phone THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot use your own referral code');
    END IF;

    -- Credit referrer: Exact amount credited to min_coins as well as referral_wallet!
    UPDATE customers
    SET 
        referral_wallet = COALESCE(referral_wallet, 0) + p_discount_amount,
        min_coins = COALESCE(min_coins, 0) + p_discount_amount
    WHERE id = v_referrer.id;

    -- Log redemption
    INSERT INTO referral_redemptions (
        referrer_phone,
        referrer_code,
        referee_phone,
        bill_number,
        discount_amount
    ) VALUES (
        v_referrer.phone,
        UPPER(p_referrer_code),
        p_referee_phone,
        p_bill_number,
        p_discount_amount
    );

    -- Update referee
    UPDATE customers
    SET referred_by_code = UPPER(p_referrer_code)
    WHERE phone = p_referee_phone;

    RETURN jsonb_build_object(
        'success', true, 
        'referrer_phone', v_referrer.phone,
        'credited_mincoins', p_discount_amount,
        'new_mincoins_balance', COALESCE(v_referrer.min_coins, 0) + p_discount_amount,
        'new_wallet_balance', COALESCE(v_referrer.referral_wallet, 0) + p_discount_amount
    );
END;
$$;
