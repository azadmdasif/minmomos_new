-- Add subcategory column to central_inventory
ALTER TABLE central_inventory ADD COLUMN IF NOT EXISTS subcategory TEXT;

-- Add subcategory column to inventory (branch inventory)
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS subcategory TEXT;

-- Refresh schema cache
NOTIFY pgrst, 'reload schema';
