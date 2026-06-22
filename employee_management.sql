-- 1. Create employees table in Supabase
CREATE TABLE IF NOT EXISTS employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    dob DATE NOT NULL,
    address TEXT NOT NULL,
    station_id TEXT DEFAULT NULL,
    branch_name TEXT NOT NULL,
    aadhaar_url TEXT NOT NULL,
    pan_url TEXT NOT NULL,
    passbook_url TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

-- Create policy for public access (all actions)
DROP POLICY IF EXISTS "Allow all actions on employees" ON employees;
CREATE POLICY "Allow all actions on employees"
ON employees
FOR ALL
TO public
USING (true)
WITH CHECK (true);


-- 2. Create employee_attendance table in Supabase
CREATE TABLE IF NOT EXISTS employee_attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('PRESENT', 'ABSENT')),
    marked_comment TEXT DEFAULT '',
    marked_by TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_employee_date UNIQUE (employee_id, date)
);

-- Enable RLS
ALTER TABLE employee_attendance ENABLE ROW LEVEL SECURITY;

-- Create policy for public access
DROP POLICY IF EXISTS "Allow all actions on employee_attendance" ON employee_attendance;
CREATE POLICY "Allow all actions on employee_attendance"
ON employee_attendance
FOR ALL
TO public
USING (true)
WITH CHECK (true);


-- 3. Create employee_leaves table in Supabase
CREATE TABLE IF NOT EXISTS employee_leaves (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    approved_by TEXT DEFAULT '',
    action_date DATE DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE employee_leaves ENABLE ROW LEVEL SECURITY;

-- Create policy for public access
DROP POLICY IF EXISTS "Allow all actions on employee_leaves" ON employee_leaves;
CREATE POLICY "Allow all actions on employee_leaves"
ON employee_leaves
FOR ALL
TO public
USING (true)
WITH CHECK (true);


-- 4. Create Storage Bucket for Employee Documents (Aadhaar, PAN, Bank Passbook)
INSERT INTO storage.buckets (id, name, public)
VALUES ('employee_docs', 'employee_docs', true)
ON CONFLICT (id) DO NOTHING;

-- 5. Storage Bucket Policy to allow Public Access (reading and writing files)
DROP POLICY IF EXISTS "Allow public read and write access for employee_docs" ON storage.objects;
CREATE POLICY "Allow public read and write access for employee_docs"
ON storage.objects
FOR ALL
TO public
USING (bucket_id = 'employee_docs')
WITH CHECK (bucket_id = 'employee_docs');


-- 6. Create employee_weekly_offs table in Supabase
CREATE TABLE IF NOT EXISTS employee_weekly_offs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    week_start_date DATE NOT NULL,
    day_of_week TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_employee_week UNIQUE (employee_id, week_start_date)
);

-- Enable Row Level Security (RLS)
ALTER TABLE employee_weekly_offs ENABLE ROW LEVEL SECURITY;

-- Create policy for public access (all actions)
DROP POLICY IF EXISTS "Allow all actions on employee_weekly_offs" ON employee_weekly_offs;
CREATE POLICY "Allow all actions on employee_weekly_offs"
ON employee_weekly_offs
FOR ALL
TO public
USING (true)
WITH CHECK (true);

