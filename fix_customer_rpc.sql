
-- 1. Restore the full get_customer_stats with branch filter and manual_total support
DROP FUNCTION IF EXISTS get_customer_stats();
DROP FUNCTION IF EXISTS get_customer_stats(TEXT);

CREATE OR REPLACE FUNCTION get_customer_stats(branch_filter TEXT DEFAULT NULL, phone_filter TEXT DEFAULT NULL)
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
        -- Use manual_total for delivery if available, otherwise standard total
        COALESCE(SUM(COALESCE(o.manual_total, o.total)), 0)::NUMERIC as total_spent,
        MAX(o.date) as last_visit,
        c.created_at as joined_date,
        c.welcome_coupon_used,
        c.welcome_coupon_code
    FROM customers c
    LEFT JOIN orders o ON (c.phone = o.customer_phone OR c.id = o.customer_id)
        AND o.deletion_info IS NULL
        AND (branch_filter IS NULL OR o.branch_name = branch_filter)
    WHERE (phone_filter IS NULL OR c.phone = phone_filter)
    GROUP BY c.id, c.phone, c.name, c.email, c.birthday, c.note, c.created_at, c.welcome_coupon_used, c.welcome_coupon_code
    ORDER BY last_visit DESC NULLS LAST;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Notify to reload schema
NOTIFY pgrst, 'reload schema';
