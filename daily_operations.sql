-- Create daily_operations table in Supabase
CREATE TABLE IF NOT EXISTS daily_operations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL,
    branch_name TEXT NOT NULL,
    manager_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Arrived', -- Arrived, AttendanceDone, OpeningCashAndInventoryDone, OpeningSOPDone, Operations, ClosingStarted, ClosingDone, Closed
    opening_time TIMESTAMP WITH TIME ZONE,
    opening_gps TEXT,
    opening_photo TEXT,
    attendance JSONB DEFAULT '[]'::jsonb,
    opening_cash NUMERIC,
    opening_cash_discrepancy_reason TEXT,
    opening_inventory JSONB DEFAULT '[]'::jsonb,
    opening_sop_checklist JSONB DEFAULT '[]'::jsonb,
    opening_sop_time TIMESTAMP WITH TIME ZONE,
    opening_sop_photos JSONB DEFAULT '[]'::jsonb,
    events JSONB DEFAULT '[]'::jsonb, -- Customer complaints, staff issues, equipment issues, food wastage
    google_reviews_count INTEGER DEFAULT 0,
    manager_notes TEXT,
    closing_sop_checklist JSONB DEFAULT '[]'::jsonb,
    closing_sop_time TIMESTAMP WITH TIME ZONE,
    closing_cash NUMERIC,
    closing_upi NUMERIC,
    closing_discrepancy_reason TEXT,
    closing_time TIMESTAMP WITH TIME ZONE,
    closing_photo TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_branch_date UNIQUE (branch_name, date)
);

-- Enable Row Level Security (RLS)
ALTER TABLE daily_operations ENABLE ROW LEVEL SECURITY;

-- Create policy for public access (all actions)
DROP POLICY IF EXISTS "Allow all actions on daily_operations" ON daily_operations;
CREATE POLICY "Allow all actions on daily_operations"
ON daily_operations
FOR ALL
TO public
USING (true)
WITH CHECK (true);
