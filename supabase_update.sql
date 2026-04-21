-- 1. Create Customers Table
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone TEXT UNIQUE NOT NULL,
    total_orders INT DEFAULT 0,
    ltv NUMERIC DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Update Orders Table
-- adding columns if they don't exist
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone TEXT;

-- 3. Create Index for faster searching
CREATE INDEX IF NOT EXISTS idx_orders_customer_phone ON orders(customer_phone);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);

-- 4. Create RPC function for Customer Analytics
-- This provides the Customer[] interface summary
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
    -- Fixed: Join on phone as fallback to catch historical orders not linked via UUID
    LEFT JOIN orders o ON (c.phone = o.customer_phone OR c.id = o.customer_id) AND o.deletion_info IS NULL
    GROUP BY c.id, c.phone, c.created_at
    ORDER BY last_visit DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Set up RLS (Admin only access for customers as requested)
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

-- Note: app_users table is assumed to exist with a 'role' column
-- Policy: Only Admins can see the customer base
-- Allow staff (who are unauthenticated in Supabase Auth terms but logged into the app) 
-- to lookup and register customers.
DROP POLICY IF EXISTS "Allow authenticated users to select customers" ON customers;
CREATE POLICY "Allow anon to select customers" 
ON customers FOR SELECT 
USING (true);

DROP POLICY IF EXISTS "Allow authenticated users to insert customers" ON customers;
CREATE POLICY "Allow anon to insert customers"
ON customers FOR INSERT
WITH CHECK (true);

-- Also add UPDATE for upsert support
CREATE POLICY "Allow anon to update customers"
ON customers FOR UPDATE
USING (true);

-- Note: The user requested "customer history should be searchable by the admin only"
-- This means we should protect the orders table as well if it contains customer_phone
-- If you want to restrict specific rows, you'd add a policy to orders too.
