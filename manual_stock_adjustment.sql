-- 1. Ensure inventory and inventory_logs exist with consistent columns
CREATE TABLE IF NOT EXISTS inventory (
  id TEXT NOT NULL,
  branch_name TEXT NOT NULL,
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'MOMO',
  current_stock NUMERIC DEFAULT 0,
  reorder_level NUMERIC DEFAULT 10,
  last_purchase_date TIMESTAMP WITH TIME ZONE,
  last_purchase_cost NUMERIC,
  is_finished BOOLEAN DEFAULT false,
  request_pending BOOLEAN DEFAULT false,
  PRIMARY KEY (id, branch_name)
);

CREATE TABLE IF NOT EXISTS inventory_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id TEXT NOT NULL,
  branch_name TEXT NOT NULL,
  reason TEXT NOT NULL,
  quantity_change NUMERIC NOT NULL,
  cost NUMERIC,
  performed_by TEXT, -- NEW COLUMN to track user
  date TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Add performed_by to inventory_logs if it doesn't exist
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='inventory_logs' AND column_name='performed_by'
    ) THEN
        ALTER TABLE inventory_logs ADD COLUMN performed_by TEXT;
    END IF;
END $$;

-- 3. Policy Cleanup (Allow anon for simplicity as per existing pattern)
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public Access Inventory" ON inventory;
CREATE POLICY "Public Access Inventory" ON inventory FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public Access Logs" ON inventory_logs;
CREATE POLICY "Public Access Logs" ON inventory_logs FOR ALL TO anon USING (true) WITH CHECK (true);

-- 4. Refresh Cache
NOTIFY pgrst, 'reload schema';
