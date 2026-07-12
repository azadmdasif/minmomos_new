-- Create ledger_categories table in Supabase
CREATE TABLE IF NOT EXISTS ledger_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('credit', 'debit')),
    mapped_stock_subcategories TEXT[] DEFAULT '{}', -- Array of stock subcategory IDs mapped to this ledger category
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Seed default credit and debit categories if they don't exist
INSERT INTO ledger_categories (name, type, mapped_stock_subcategories) VALUES
-- Debits
('gas', 'debit', '{}'),
('rent', 'debit', '{}'),
('salary', 'debit', '{}'),
('momo', 'debit', '{"momo"}'),
('store investment', 'debit', '{}'),
('zomato commission and ads', 'debit', '{}'),
('debt', 'debit', '{}'),
('grocery', 'debit', '{"veggies", "others"}'),
('soft drinks', 'debit', '{"cola", "drinks"}'),
('ice', 'debit', '{}'),
('packaginf', 'debit', '{"packaging"}'),
('veggies', 'debit', '{"veggies"}'),
('burger buns', 'debit', '{"buns"}'),
('others', 'debit', '{"others"}'),

-- Credits
('revenue', 'credit', '{}'),
('zomato payout', 'credit', '{}'),
('investment', 'credit', '{}'),
('debt', 'credit', '{}'),
('previous balance', 'credit', '{}'),
('other', 'credit', '{}')
ON CONFLICT (name) DO NOTHING;

-- Enable Row Level Security (RLS)
ALTER TABLE ledger_categories ENABLE ROW LEVEL SECURITY;

-- Create policy to allow public access (read, write, update, delete)
DROP POLICY IF EXISTS "Allow public access on ledger_categories" ON ledger_categories;
CREATE POLICY "Allow public access on ledger_categories" 
ON ledger_categories 
FOR ALL 
TO public 
USING (true) 
WITH CHECK (true);
