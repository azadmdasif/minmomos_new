-- MASTER INVENTORY SYNC SCRIPT
-- Run this if you see "Database Update Required" or "Table Not Found" errors in the Stock Hub.

-- 1. Base Tables
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

CREATE TABLE IF NOT EXISTS central_inventory (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'MOMO',
  current_stock NUMERIC DEFAULT 0,
  last_purchase_cost NUMERIC DEFAULT 0,
  last_purchase_date TIMESTAMPTZ DEFAULT NOW(),
  is_finished BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS inventory_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id TEXT NOT NULL,
  item_name TEXT,
  branch_name TEXT NOT NULL,
  reason TEXT NOT NULL,
  quantity_change NUMERIC NOT NULL,
  cost NUMERIC,
  performed_by TEXT,
  date TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS procurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id TEXT,
  item_name TEXT,
  quantity NUMERIC,
  unit TEXT,
  total_cost NUMERIC,
  vendor TEXT,
  date TIMESTAMPTZ DEFAULT NOW(),
  is_voided BOOLEAN DEFAULT false,
  void_reason TEXT
);

CREATE TABLE IF NOT EXISTS stock_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id TEXT NOT NULL,
  material_name TEXT NOT NULL,
  station_name TEXT NOT NULL,
  quantity NUMERIC NOT NULL,
  unit TEXT NOT NULL,
  date TIMESTAMPTZ DEFAULT NOW(),
  is_voided BOOLEAN DEFAULT false,
  void_reason TEXT
);

-- 2. Schema Evolution (Add missing columns to existing tables)
DO $$ 
BEGIN 
    -- inventory_logs: performed_by
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory_logs' AND column_name='performed_by') THEN
        ALTER TABLE inventory_logs ADD COLUMN performed_by TEXT;
    END IF;

    -- inventory_logs: item_name
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory_logs' AND column_name='item_name') THEN
        ALTER TABLE inventory_logs ADD COLUMN item_name TEXT;
    END IF;

    -- procurements: is_voided
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='procurements' AND column_name='is_voided') THEN
        ALTER TABLE procurements ADD COLUMN is_voided BOOLEAN DEFAULT false;
    END IF;
    
    -- procurements: void_reason
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='procurements' AND column_name='void_reason') THEN
        ALTER TABLE procurements ADD COLUMN void_reason TEXT;
    END IF;

    -- stock_allocations: is_voided
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stock_allocations' AND column_name='is_voided') THEN
        ALTER TABLE stock_allocations ADD COLUMN is_voided BOOLEAN DEFAULT false;
    END IF;

    -- stock_allocations: void_reason
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stock_allocations' AND column_name='void_reason') THEN
        ALTER TABLE stock_allocations ADD COLUMN void_reason TEXT;
    END IF;
END $$;

-- 3. Security (RLS & Policies)
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE central_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_allocations ENABLE ROW LEVEL SECURITY;

-- Drop old policies to avoid conflicts
DROP POLICY IF EXISTS "Public Access Inventory" ON inventory;
DROP POLICY IF EXISTS "Public Inventory" ON inventory;
DROP POLICY IF EXISTS "Public Access Central" ON central_inventory;
DROP POLICY IF EXISTS "Public Central" ON central_inventory;
DROP POLICY IF EXISTS "Public Access Logs" ON inventory_logs;
DROP POLICY IF EXISTS "Public Logs" ON inventory_logs;
DROP POLICY IF EXISTS "Public Access Procurements" ON procurements;
DROP POLICY IF EXISTS "Public Proc" ON procurements;
DROP POLICY IF EXISTS "Public Access Allocations" ON stock_allocations;
DROP POLICY IF EXISTS "Public Allocations" ON stock_allocations;
DROP POLICY IF EXISTS "Public Alloc" ON stock_allocations;

-- Create fresh unified policies
CREATE POLICY "Public Inventory" ON inventory FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Public Central" ON central_inventory FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Public Logs" ON inventory_logs FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Public Proc" ON procurements FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Public Alloc" ON stock_allocations FOR ALL TO anon USING (true) WITH CHECK (true);

-- 4. Finalize
NOTIFY pgrst, 'reload schema';
