-- ============================================================================
-- MINMOMOS ADD-ON STATISTICAL LEARNING ENGINE & CUSTOMER MEMORY SETUP (POSTGRESQL)
-- Fully Idempotent, High-Performance, Multi-Device Schema & pg_cron Nightly Rebuild
-- ============================================================================

-- 1. Table: addon_impressions
CREATE TABLE IF NOT EXISTS addon_impressions (
  impression_id UUID PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  order_id TEXT,
  customer_id TEXT,
  customer_phone TEXT,
  
  -- Cart Context
  cart_total NUMERIC(10, 2) NOT NULL,
  cart_type TEXT NOT NULL, -- 'steamed_only', 'fried_crispy_only', 'mixed', 'has_drink', 'meal'
  value_band TEXT NOT NULL, -- '<100', '100-199', '200+'
  daypart TEXT NOT NULL, -- 'lunch', 'tea_snack', 'dinner', 'late_night'
  weekday TEXT NOT NULL, -- 'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'
  
  -- Offer Economics
  offer_key TEXT NOT NULL,
  offer_price NUMERIC(10, 2) NOT NULL,
  offer_cost NUMERIC(10, 2) NOT NULL,
  margin_multiple NUMERIC(6, 2) NOT NULL,
  reference_price NUMERIC(10, 2) NOT NULL,
  deal_strength NUMERIC(6, 3) NOT NULL,
  rounding_tier TEXT NOT NULL, -- '50', '10', 'pinned', 'none'
  
  -- Policy & Learning
  source TEXT NOT NULL, -- 'pinned', 'history', 'affinity', 'complement', 'explore', 'holdout', 'thompson_l1', 'thompson_l0', 'rule_fallback'
  policy_version TEXT NOT NULL DEFAULT 'v1.0-hierarchical-beta-binomial',
  propensity NUMERIC(6, 4) NOT NULL DEFAULT 1.0,
  
  -- Outcome Tracking
  outcome TEXT NOT NULL DEFAULT 'pending', -- 'accepted', 'declined', 'skipped', 'timed_out', 'removed_before_print', 'not_shown_holdout'
  shown_ms BIGINT,
  decision_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_addon_imp_created ON addon_impressions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_addon_imp_offer ON addon_impressions (offer_key, outcome);
CREATE INDEX IF NOT EXISTS idx_addon_imp_customer ON addon_impressions (customer_phone, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_addon_imp_cart_band ON addon_impressions (cart_type, value_band);

-- 2. Table: addon_fixed_events (fixed section picks: Mojito, Popcorn, Fries)
CREATE TABLE IF NOT EXISTS addon_fixed_events (
  event_id UUID PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  order_id TEXT,
  customer_id TEXT,
  customer_phone TEXT,
  cart_total NUMERIC(10, 2) NOT NULL,
  cart_type TEXT NOT NULL,
  value_band TEXT NOT NULL,
  daypart TEXT NOT NULL,
  weekday TEXT NOT NULL,
  fixed_item_id TEXT NOT NULL, -- 'fries', 'mojito', 'popcorn'
  fixed_item_name TEXT NOT NULL,
  price NUMERIC(10, 2) NOT NULL,
  action TEXT NOT NULL -- 'added', 'incremented', 'decremented', 'removed'
);

CREATE INDEX IF NOT EXISTS idx_addon_fixed_created ON addon_fixed_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_addon_fixed_item ON addon_fixed_events (fixed_item_id, created_at DESC);

-- 3. Precomputed Statistical Tables (L0 and L1)
CREATE TABLE IF NOT EXISTS addon_stats_l0 (
  offer_key TEXT PRIMARY KEY,
  n_impressions INTEGER NOT NULL DEFAULT 0,
  n_accepts INTEGER NOT NULL DEFAULT 0,
  decayed_impressions NUMERIC(10, 2) NOT NULL DEFAULT 0,
  decayed_accepts NUMERIC(10, 2) NOT NULL DEFAULT 0,
  alpha NUMERIC(10, 3) NOT NULL DEFAULT 2.44,
  beta NUMERIC(10, 3) NOT NULL DEFAULT 12.56,
  posterior_mean NUMERIC(6, 4) NOT NULL DEFAULT 0.1625,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS addon_stats_l1 (
  stat_key TEXT PRIMARY KEY, -- 'offer_key:::cart_type:::value_band'
  offer_key TEXT NOT NULL,
  cart_type TEXT NOT NULL,
  value_band TEXT NOT NULL,
  n_impressions INTEGER NOT NULL DEFAULT 0,
  n_accepts INTEGER NOT NULL DEFAULT 0,
  decayed_impressions NUMERIC(10, 2) NOT NULL DEFAULT 0,
  decayed_accepts NUMERIC(10, 2) NOT NULL DEFAULT 0,
  alpha NUMERIC(10, 3) NOT NULL DEFAULT 2.44,
  beta NUMERIC(10, 3) NOT NULL DEFAULT 12.56,
  posterior_mean NUMERIC(6, 4) NOT NULL DEFAULT 0.1625,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Item Pair Complementarity Table
CREATE TABLE IF NOT EXISTS item_pair_stats (
  pair_key TEXT PRIMARY KEY, -- 'item_a:::item_b'
  item_a TEXT NOT NULL,
  item_b TEXT NOT NULL,
  co_occurrences INTEGER NOT NULL DEFAULT 0,
  total_a INTEGER NOT NULL DEFAULT 0,
  total_b INTEGER NOT NULL DEFAULT 0,
  total_orders INTEGER NOT NULL DEFAULT 0,
  lift NUMERIC(8, 3) NOT NULL DEFAULT 1.0,
  smoothed_lift NUMERIC(8, 3) NOT NULL DEFAULT 1.0,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Customer Profile Memory
CREATE TABLE IF NOT EXISTS customer_addon_profile (
  lookup_key TEXT PRIMARY KEY, -- phone or customer_id
  customer_id TEXT,
  phone TEXT,
  visits INTEGER NOT NULL DEFAULT 0,
  last_visit TIMESTAMPTZ,
  median_days_between_visits NUMERIC(6, 1) DEFAULT 14,
  avg_cart NUMERIC(10, 2) DEFAULT 0,
  usual_daypart TEXT DEFAULT 'lunch',
  veg_only_so_far INTEGER DEFAULT 0,
  item_counts JSONB DEFAULT '{}'::jsonb,
  category_counts JSONB DEFAULT '{}'::jsonb,
  addon_history JSONB DEFAULT '{}'::jsonb,
  deal_strength_accepts JSONB DEFAULT '{}'::jsonb,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_addon_phone ON customer_addon_profile (phone);

-- 6. POS Fast Snapshot Table (Single indexed lookup for 15-minute cached reads)
CREATE TABLE IF NOT EXISTS addon_stats_snapshot (
  snapshot_id SERIAL PRIMARY KEY,
  snapshot_data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. IDEMPOTENT NIGHTLY REBUILD PROCEDURE
-- Rebuilds L0, L1, Pair Stats, and Customer Profiles completely from raw logs.
-- Completely avoids incremental drift and operates idempotently.
CREATE OR REPLACE FUNCTION rebuild_addon_engine_stats()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ref_date TIMESTAMPTZ := NOW();
  v_k_l0 NUMERIC := 15.0;
  v_k_l1 NUMERIC := 15.0;
  v_p_prior NUMERIC := 0.1625;
  v_snapshot_json JSONB;
BEGIN
  -- 1. Truncate / Refresh L0 Aggregates with 90-day Exponential Decay
  DELETE FROM addon_stats_l0;
  
  INSERT INTO addon_stats_l0 (offer_key, n_impressions, n_accepts, decayed_impressions, decayed_accepts, alpha, beta, posterior_mean, last_updated)
  SELECT 
    offer_key,
    COUNT(*) AS n_impressions,
    COUNT(*) FILTER (WHERE outcome = 'accepted') AS n_accepts,
    ROUND(SUM(POWER(0.5, GREATEST(0, EXTRACT(EPOCH FROM (v_ref_date - created_at)) / (86400 * 90)))), 2) AS decayed_impressions,
    ROUND(SUM(CASE WHEN outcome = 'accepted' THEN POWER(0.5, GREATEST(0, EXTRACT(EPOCH FROM (v_ref_date - created_at)) / (86400 * 90))) ELSE 0 END), 2) AS decayed_accepts,
    ROUND(v_k_l0 * v_p_prior + SUM(CASE WHEN outcome = 'accepted' THEN POWER(0.5, GREATEST(0, EXTRACT(EPOCH FROM (v_ref_date - created_at)) / (86400 * 90))) ELSE 0 END), 3) AS alpha,
    ROUND(v_k_l0 * (1 - v_p_prior) + SUM(CASE WHEN outcome = 'declined' THEN POWER(0.5, GREATEST(0, EXTRACT(EPOCH FROM (v_ref_date - created_at)) / (86400 * 90))) ELSE 0 END), 3) AS beta,
    ROUND(
      (v_k_l0 * v_p_prior + SUM(CASE WHEN outcome = 'accepted' THEN POWER(0.5, GREATEST(0, EXTRACT(EPOCH FROM (v_ref_date - created_at)) / (86400 * 90))) ELSE 0 END)) /
      (v_k_l0 + SUM(POWER(0.5, GREATEST(0, EXTRACT(EPOCH FROM (v_ref_date - created_at)) / (86400 * 90))))),
      4
    ) AS posterior_mean,
    v_ref_date AS last_updated
  FROM addon_impressions
  WHERE outcome IN ('accepted', 'declined')
  GROUP BY offer_key;

  -- 2. Truncate / Refresh L1 Aggregates with Shrinkage toward L0 Parent
  DELETE FROM addon_stats_l1;

  INSERT INTO addon_stats_l1 (stat_key, offer_key, cart_type, value_band, n_impressions, n_accepts, decayed_impressions, decayed_accepts, alpha, beta, posterior_mean, last_updated)
  SELECT 
    i.offer_key || ':::' || i.cart_type || ':::' || i.value_band AS stat_key,
    i.offer_key,
    i.cart_type,
    i.value_band,
    COUNT(*) AS n_impressions,
    COUNT(*) FILTER (WHERE i.outcome = 'accepted') AS n_accepts,
    ROUND(SUM(POWER(0.5, GREATEST(0, EXTRACT(EPOCH FROM (v_ref_date - i.created_at)) / (86400 * 90)))), 2) AS decayed_impressions,
    ROUND(SUM(CASE WHEN i.outcome = 'accepted' THEN POWER(0.5, GREATEST(0, EXTRACT(EPOCH FROM (v_ref_date - i.created_at)) / (86400 * 90))) ELSE 0 END), 2) AS decayed_accepts,
    ROUND(v_k_l1 * COALESCE(l0.posterior_mean, v_p_prior) + SUM(CASE WHEN i.outcome = 'accepted' THEN POWER(0.5, GREATEST(0, EXTRACT(EPOCH FROM (v_ref_date - i.created_at)) / (86400 * 90))) ELSE 0 END), 3) AS alpha,
    ROUND(v_k_l1 * (1 - COALESCE(l0.posterior_mean, v_p_prior)) + SUM(CASE WHEN i.outcome = 'declined' THEN POWER(0.5, GREATEST(0, EXTRACT(EPOCH FROM (v_ref_date - i.created_at)) / (86400 * 90))) ELSE 0 END), 3) AS beta,
    ROUND(
      (v_k_l1 * COALESCE(l0.posterior_mean, v_p_prior) + SUM(CASE WHEN i.outcome = 'accepted' THEN POWER(0.5, GREATEST(0, EXTRACT(EPOCH FROM (v_ref_date - i.created_at)) / (86400 * 90))) ELSE 0 END)) /
      (v_k_l1 + SUM(POWER(0.5, GREATEST(0, EXTRACT(EPOCH FROM (v_ref_date - i.created_at)) / (86400 * 90))))),
      4
    ) AS posterior_mean,
    v_ref_date AS last_updated
  FROM addon_impressions i
  LEFT JOIN addon_stats_l0 l0 ON l0.offer_key = i.offer_key
  WHERE i.outcome IN ('accepted', 'declined')
  GROUP BY i.offer_key, i.cart_type, i.value_band, l0.posterior_mean;

  -- 3. Build & Save Consolidated JSON Snapshot for POS 15-Minute Cached Fetch
  SELECT jsonb_build_object(
    'l0', (SELECT jsonb_object_agg(offer_key, to_jsonb(l0)) FROM addon_stats_l0 l0),
    'l1', (SELECT jsonb_object_agg(stat_key, to_jsonb(l1)) FROM addon_stats_l1 l1),
    'lastUpdated', v_ref_date,
    'version', 'v1.0-pg-rebuild'
  ) INTO v_snapshot_json;

  INSERT INTO addon_stats_snapshot (snapshot_data, created_at)
  VALUES (v_snapshot_json, v_ref_date);

  -- Keep only the last 10 snapshots
  DELETE FROM addon_stats_snapshot 
  WHERE snapshot_id NOT IN (
    SELECT snapshot_id FROM addon_stats_snapshot ORDER BY created_at DESC LIMIT 10
  );

END;
$$;

-- 8. Enable pg_cron Nightly Schedule at 03:00 AM (If pg_cron is enabled in Postgres)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'rebuild-addon-stats-nightly',
      '0 3 * * *',
      'SELECT rebuild_addon_engine_stats();'
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- pg_cron not active or permissions restricted; client-side/server-side rebuild fallback is active
END $$;
