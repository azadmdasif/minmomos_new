-- Add Voiding capability to transactions
ALTER TABLE procurements ADD COLUMN IF NOT EXISTS is_voided BOOLEAN DEFAULT false;
ALTER TABLE procurements ADD COLUMN IF NOT EXISTS void_reason TEXT;

ALTER TABLE stock_allocations ADD COLUMN IF NOT EXISTS is_voided BOOLEAN DEFAULT false;
ALTER TABLE stock_allocations ADD COLUMN IF NOT EXISTS void_reason TEXT;

-- Refresh schema cache
NOTIFY pgrst, 'reload schema';
