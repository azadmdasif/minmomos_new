-- Update Schema to include Foreign Keys and handle Policy re-creation safely

-- 1. Ensure procurements table has FK or at least PostgREST can join
-- Since we are already in a state where tables might exist, let's add constraints if possible
-- or just ensure the select works. PostgREST can do joins without FKs if we use hints, 
-- but FKs are much better.

-- Add Foreign Key to procurements if it doesn't exist
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'procurements_item_id_fkey'
    ) THEN
        ALTER TABLE procurements 
        ADD CONSTRAINT procurements_item_id_fkey 
        FOREIGN KEY (item_id) REFERENCES central_inventory(id);
    END IF;
END $$;

-- Add Foreign Key to stock_allocations if it doesn't exist
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'stock_allocations_material_id_fkey'
    ) THEN
        ALTER TABLE stock_allocations 
        ADD CONSTRAINT stock_allocations_material_id_fkey 
        FOREIGN KEY (material_id) REFERENCES central_inventory(id);
    END IF;
END $$;

-- Ensure RLS is active and policies are clean
-- We'll use a safer approach for policies

DO $$
BEGIN
    -- central_inventory
    DROP POLICY IF EXISTS "Public Central Inventory" ON central_inventory;
    CREATE POLICY "Public Central Inventory" ON central_inventory FOR ALL TO anon USING (true) WITH CHECK (true);
    
    -- procurements
    DROP POLICY IF EXISTS "Public Procurements" ON procurements;
    CREATE POLICY "Public Procurements" ON procurements FOR ALL TO anon USING (true) WITH CHECK (true);
    
    -- stock_allocations
    DROP POLICY IF EXISTS "Public Allocations" ON stock_allocations;
    CREATE POLICY "Public Allocations" ON stock_allocations FOR ALL TO anon USING (true) WITH CHECK (true);
END $$;

-- Refresh schema cache
NOTIFY pgrst, 'reload schema';
