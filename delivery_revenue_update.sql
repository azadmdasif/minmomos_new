
-- 1. Add manual pricing columns for Delivery/Zomato orders if they don't exist
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS manual_total NUMERIC,
ADD COLUMN IF NOT EXISTS manual_discount NUMERIC;

-- 2. Update the Customer Stats RPC to include manual pricing in LTV
CREATE OR REPLACE FUNCTION get_customer_stats()
RETURNS TABLE (
    id UUID,
    phone TEXT,
    total_orders BIGINT,
    total_spent NUMERIC,
    last_visit TIMESTAMP WITH TIME ZONE,
    joined_date TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id,
        c.phone,
        COUNT(o.id) as total_orders,
        -- Use manual_total if available (for delivery), otherwise standard total
        COALESCE(SUM(COALESCE(o.manual_total, o.total)), 0)::NUMERIC as total_spent,
        MAX(o.date) as last_visit,
        c.created_at as joined_date
    FROM customers c
    LEFT JOIN orders o ON (c.phone = o.customer_phone OR c.id = o.customer_id) AND o.deletion_info IS NULL
    GROUP BY c.id, c.phone, c.created_at
    ORDER BY last_visit DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Refresh Postgrest cache
NOTIFY pgrst, 'reload schema';
