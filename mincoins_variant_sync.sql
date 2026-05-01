ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS min_coins_prices JSONB DEFAULT '{}';

-- Optional: Migrate existing data if any (just as a safeguard)
UPDATE menu_items SET min_coins_prices = jsonb_build_object('steamed', jsonb_build_object('medium', min_coins_price))
WHERE min_coins_price > 0 AND (min_coins_prices IS NULL OR min_coins_prices = '{}');
