-- 1. Create Finance Ledger table in Supabase
CREATE TABLE IF NOT EXISTS finance_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tab_name TEXT NOT NULL,
    date DATE NOT NULL,
    credit_cash NUMERIC DEFAULT 0,
    credit_cash_details TEXT DEFAULT '',
    credit_bank NUMERIC DEFAULT 0,
    credit_bank_details TEXT DEFAULT '',
    debit_cash NUMERIC DEFAULT 0,
    debit_cash_details TEXT DEFAULT '',
    debit_bank NUMERIC DEFAULT 0,
    debit_bank_details TEXT DEFAULT '',
    is_opening BOOLEAN DEFAULT false,
    is_deleted BOOLEAN DEFAULT false,
    delete_reason TEXT DEFAULT '',
    deleted_at TIMESTAMP WITH TIME ZONE,
    edit_history JSONB DEFAULT '[]'::jsonb,
    bill_url TEXT DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Support altering existing table if it already exists
ALTER TABLE finance_ledger ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;
ALTER TABLE finance_ledger ADD COLUMN IF NOT EXISTS delete_reason TEXT DEFAULT '';
ALTER TABLE finance_ledger ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE finance_ledger ADD COLUMN IF NOT EXISTS edit_history JSONB DEFAULT '[]'::jsonb;
ALTER TABLE finance_ledger ADD COLUMN IF NOT EXISTS bill_url TEXT DEFAULT NULL;

-- 2. Create Storage Bucket for Receipt/Bill Storage
INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', true)
ON CONFLICT (id) DO NOTHING;

-- 3. Storage Bucket Policy to allow Public Access (reading and writing receipts)
-- Dropping existing policy to prevent conflicts
DROP POLICY IF EXISTS "Allow public read and write access for receipts" ON storage.objects;

CREATE POLICY "Allow public read and write access for receipts"
ON storage.objects
FOR ALL
TO public
USING (bucket_id = 'receipts')
WITH CHECK (bucket_id = 'receipts');

-- 4. Enable Row Level Security (RLS)
ALTER TABLE finance_ledger ENABLE ROW LEVEL SECURITY;

-- 3. Create a policy to allow all actions on finance_ledger for public access
DROP POLICY IF EXISTS "Allow all actions on finance_ledger" ON finance_ledger;
CREATE POLICY "Allow all actions on finance_ledger" 
ON finance_ledger 
FOR ALL 
TO public 
USING (true) 
WITH CHECK (true);

-- 4. Create index to lookup by tab_name efficiently
CREATE INDEX IF NOT EXISTS idx_finance_ledger_tab_name ON finance_ledger(tab_name);
