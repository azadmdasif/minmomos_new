-- Update get_customer_stats to support branch filtering
DROP FUNCTION IF EXISTS get_customer_stats();

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
    joined_date TIMESTAMP WITH TIME ZONE
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
        c.created_at as joined_date
    FROM customers c
    LEFT JOIN orders o ON (c.phone = o.customer_phone OR c.id = o.customer_id)
        AND o.deletion_info IS NULL
        AND (branch_filter IS NULL OR o.branch_name = branch_filter)
    GROUP BY c.id, c.phone, c.name, c.email, c.birthday, c.note, c.created_at
    ORDER BY last_visit DESC NULLS LAST;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
