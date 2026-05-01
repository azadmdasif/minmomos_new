-- 1. Add new columns to customers table
ALTER TABLE customers ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS birthday DATE;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS note TEXT;

-- 2. Drop the existing function to change its return type
DROP FUNCTION IF EXISTS get_customer_stats();

-- 3. Re-create the function with the new columns in the return table
CREATE OR REPLACE FUNCTION get_customer_stats()
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
    LEFT JOIN orders o ON (c.phone = o.customer_phone OR c.id = o.customer_id) AND o.deletion_info IS NULL
    GROUP BY c.id, c.phone, c.name, c.email, c.birthday, c.note, c.created_at
    ORDER BY last_visit DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
