-- 1. Create Central Inventory Table
CREATE TABLE IF NOT EXISTS central_inventory (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    unit TEXT NOT NULL,
    category TEXT NOT NULL,
    current_stock NUMERIC DEFAULT 0,
    last_purchase_cost NUMERIC DEFAULT 0,
    last_purchase_date TEXT,
    is_finished BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create Procurements Table (Buying History)
CREATE TABLE IF NOT EXISTS procurements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id TEXT,
    item_name TEXT,
    quantity NUMERIC,
    unit TEXT,
    total_cost NUMERIC,
    vendor TEXT,
    date TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create Stock Allocations Table (Dispatch History)
CREATE TABLE IF NOT EXISTS stock_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    material_id TEXT NOT NULL,
    material_name TEXT NOT NULL,
    station_name TEXT NOT NULL,
    quantity NUMERIC NOT NULL,
    unit TEXT NOT NULL,
    date TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE central_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_allocations ENABLE ROW LEVEL SECURITY;

-- 5. Create Policies (Allowing Anonymous access for simplicity in the current app setup)
-- In a production environment, these should be restricted to authenticated admins.
DROP POLICY IF EXISTS "Public Central Inventory" ON central_inventory;
CREATE POLICY "Public Central Inventory" ON central_inventory FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public Procurements" ON procurements;
CREATE POLICY "Public Procurements" ON procurements FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public Allocations" ON stock_allocations;
CREATE POLICY "Public Allocations" ON stock_allocations FOR ALL TO anon USING (true) WITH CHECK (true);

-- 6. Refresh PostgREST cache
NOTIFY pgrst, 'reload schema';
