
-- 1. Fix existing orders that might be missing the customer_id link
-- This ensures all orders with a phone number are correctly linked to the customer profile
UPDATE orders SET customer_id = c.id 
FROM customers c 
WHERE orders.customer_phone = c.phone 
AND orders.customer_id IS NULL;

-- 2. Update the get_customer_stats RPC function
-- We'll make the join more robust by checking both customer_id and phone
-- This fixes the issue where LTV or visits show as 0 despite having orders
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
        COALESCE(SUM(o.total), 0)::NUMERIC as total_spent,
        MAX(o.date) as last_visit,
        c.created_at as joined_date
    FROM customers c
    LEFT JOIN orders o ON (c.phone = o.customer_phone OR c.id = o.customer_id) AND o.deletion_info IS NULL
    GROUP BY c.id, c.phone, c.created_at
    ORDER BY last_visit DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Sync functions for table columns (LTV and Total Orders)
-- This ensures the 'customers' table stays updated automatically
CREATE OR REPLACE FUNCTION sync_customer_stats()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE customers
    SET 
        total_orders = sub.order_count,
        ltv = sub.total_spent
    FROM (
        SELECT 
            COUNT(id) as order_count, 
            COALESCE(SUM(total), 0) as total_spent
        FROM orders 
        WHERE customer_phone = COALESCE(NEW.customer_phone, OLD.customer_phone)
        AND deletion_info IS NULL
    ) sub
    WHERE phone = COALESCE(NEW.customer_phone, OLD.customer_phone);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_customer_stats ON orders;
CREATE TRIGGER trg_sync_customer_stats
AFTER INSERT OR UPDATE OR DELETE ON orders
FOR EACH ROW EXECUTE FUNCTION sync_customer_stats();

-- 4. Sync current values for existing data
UPDATE customers c
SET 
  total_orders = sub.order_count,
  ltv = sub.total_spent
FROM (
    SELECT 
        customer_phone, 
        COUNT(id) as order_count, 
        SUM(total) as total_spent
    FROM orders 
    WHERE deletion_info IS NULL 
    GROUP BY customer_phone
) sub
WHERE c.phone = sub.customer_phone;
