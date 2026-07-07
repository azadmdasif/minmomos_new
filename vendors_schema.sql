-- 1. Create Vendors Table
CREATE TABLE IF NOT EXISTS vendors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    contact_person TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create Vendor Mappings Table
CREATE TABLE IF NOT EXISTS vendor_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id TEXT NOT NULL REFERENCES central_inventory(id) ON DELETE CASCADE,
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(item_id)
);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_mappings ENABLE ROW LEVEL SECURITY;

-- 4. Create Public Access Policies
DROP POLICY IF EXISTS "Public Vendors" ON vendors;
CREATE POLICY "Public Vendors" ON vendors FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public Vendor Mappings" ON vendor_mappings;
CREATE POLICY "Public Vendor Mappings" ON vendor_mappings FOR ALL TO anon USING (true) WITH CHECK (true);

-- 5. Refresh PostgREST cache
NOTIFY pgrst, 'reload schema';
