
-- 1. Add missing columns to customers table
ALTER TABLE customers ADD COLUMN IF NOT EXISTS welcome_coupon_code TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS welcome_coupon_used BOOLEAN DEFAULT FALSE;

-- 2. Update get_customer_stats RPC function to include new columns
CREATE OR REPLACE FUNCTION get_customer_stats(branch_filter TEXT DEFAULT NULL)
RETURNS TABLE (
    id UUID,
    phone TEXT,
    name TEXT,
    email TEXT,
    birthday DATE,
    note TEXT,
    total_orders BIGINT,
    total_spent NUMERIC,
    last_visit TIMESTAMP WITH TIME ZONE,
    joined_date TIMESTAMP WITH TIME ZONE,
    welcome_coupon_used BOOLEAN,
    welcome_coupon_code TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id,
        c.phone,
        c.name,
        c.email,
        c.birthday,
        c.note,
        COUNT(o.id) as total_orders,
        COALESCE(SUM(o.total), 0)::NUMERIC as total_spent,
        MAX(o.date) as last_visit,
        c.created_at as joined_date,
        c.welcome_coupon_used,
        c.welcome_coupon_code
    FROM customers c
    LEFT JOIN orders o ON (c.phone = o.customer_phone OR c.id = o.customer_id)
        AND o.deletion_info IS NULL
        AND (branch_filter IS NULL OR o.branch_name = branch_filter)
    GROUP BY c.id, c.phone, c.name, c.email, c.birthday, c.note, c.created_at, c.welcome_coupon_used, c.welcome_coupon_code
    ORDER BY last_visit DESC NULLS LAST;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Fix existing customers who might have 0 orders but need a welcome coupon code
-- This only applies to those who don't have one yet
UPDATE customers 
SET welcome_coupon_code = 'MOMO-' || upper(substring(md5(random()::text) from 1 for 4)) || '-' || right(phone, 4)
WHERE welcome_coupon_code IS NULL;
