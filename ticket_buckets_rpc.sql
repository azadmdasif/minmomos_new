-- Optional Supabase PostgreSQL RPC for server-side Order Ticket Size & Value Bucket aggregation
-- All day boundaries are evaluated in IST (Asia/Kolkata).
-- Mirrors exact Single-Period OrderValueHistogram revenue, channel, and filter rules:
--   - Excludes voided/deleted orders (deletion_info IS NULL) and CANCELLED orders
--   - Revenue = GREATEST(0, CASE WHEN UPPER(type) = 'DELIVERY' AND manual_total IS NOT NULL THEN manual_total ELSE total END)
--   - Channels = DINE_IN, TAKEAWAY, DELIVERY (with delivery_brand split: MINMOMOS vs MINCHICKEN)

CREATE OR REPLACE FUNCTION get_ticket_bucket_aggregation(
  p_start_date DATE,
  p_end_date DATE,
  p_branch TEXT DEFAULT 'All',
  p_buckets JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_start_ts TIMESTAMPTZ;
  v_end_ts TIMESTAMPTZ;
  v_result JSONB;
BEGIN
  -- Inclusive IST day bounds converted to TIMESTAMPTZ
  v_start_ts := (p_start_date::TEXT || ' 00:00:00 Asia/Kolkata')::TIMESTAMPTZ;
  v_end_ts   := ((p_end_date + 1)::TEXT || ' 00:00:00 Asia/Kolkata')::TIMESTAMPTZ;

  WITH filtered_orders AS (
    SELECT
      o.id,
      UPPER(COALESCE(o.type, 'TAKEAWAY')) AS channel,
      CASE
        WHEN UPPER(COALESCE(o.type, '')) = 'DELIVERY' THEN
          CASE UPPER(COALESCE(o.delivery_brand, ''))
            WHEN 'MINCHICKEN' THEN 'MINCHICKEN'
            ELSE 'MINMOMOS'
          END
        ELSE NULL
      END AS delivery_brand,
      GREATEST(
        0,
        CASE
          WHEN UPPER(COALESCE(o.type, '')) = 'DELIVERY' AND o.manual_total IS NOT NULL
            THEN o.manual_total::NUMERIC
          ELSE COALESCE(o.total, 0)::NUMERIC
        END
      ) AS effective_val,
      (o.date AT TIME ZONE 'Asia/Kolkata')::DATE AS ist_day
    FROM orders o
    WHERE o.deletion_info IS NULL
      AND COALESCE(o.status, '') <> 'CANCELLED'
      AND o.date >= v_start_ts
      AND o.date < v_end_ts
      AND (p_branch IS NULL OR p_branch = 'All' OR o.branch_name = p_branch)
  ),
  bucket_defs AS (
    SELECT
      (b->>'id') AS bucket_id,
      (b->>'min')::NUMERIC AS min_val,
      CASE
        WHEN b->>'max' IS NULL OR b->>'max' = 'null' OR b->>'max' = 'Infinity' THEN NULL
        ELSE (b->>'max')::NUMERIC
      END AS max_val,
      ord AS sort_order
    FROM jsonb_array_elements(p_buckets) WITH ORDINALITY AS t(b, ord)
  ),
  matched_orders AS (
    SELECT
      fo.channel,
      fo.delivery_brand,
      fo.effective_val,
      (
        SELECT bd.bucket_id
        FROM bucket_defs bd
        WHERE fo.effective_val >= bd.min_val
          AND (bd.max_val IS NULL OR fo.effective_val < bd.max_val)
        ORDER BY bd.min_val ASC, bd.sort_order ASC
        LIMIT 1
      ) AS bucket_id
    FROM filtered_orders fo
  ),
  bucket_agg AS (
    SELECT
      bucket_id,
      channel,
      COUNT(*)::INT AS orders,
      ROUND(SUM(effective_val))::NUMERIC AS revenue
    FROM matched_orders
    WHERE bucket_id IS NOT NULL
    GROUP BY bucket_id, channel
  ),
  delivery_brand_bucket_agg AS (
    SELECT
      bucket_id,
      delivery_brand AS brand,
      COUNT(*)::INT AS orders,
      ROUND(SUM(effective_val))::NUMERIC AS revenue
    FROM matched_orders
    WHERE bucket_id IS NOT NULL
      AND channel = 'DELIVERY'
      AND delivery_brand IS NOT NULL
    GROUP BY bucket_id, delivery_brand
  ),
  active_days_agg AS (
    SELECT
      COUNT(DISTINCT ist_day)::INT AS all_days,
      COUNT(DISTINCT CASE WHEN channel = 'DINE_IN' THEN ist_day END)::INT AS dine_in_days,
      COUNT(DISTINCT CASE WHEN channel = 'TAKEAWAY' THEN ist_day END)::INT AS takeaway_days,
      COUNT(DISTINCT CASE WHEN channel = 'DELIVERY' THEN ist_day END)::INT AS delivery_days,
      COUNT(DISTINCT CASE WHEN channel = 'DELIVERY' AND delivery_brand = 'MINMOMOS' THEN ist_day END)::INT AS minmomos_days,
      COUNT(DISTINCT CASE WHEN channel = 'DELIVERY' AND delivery_brand = 'MINCHICKEN' THEN ist_day END)::INT AS minchicken_days
    FROM filtered_orders
  ),
  channel_totals_agg AS (
    SELECT
      COUNT(*)::INT AS all_orders,
      COALESCE(ROUND(SUM(effective_val)), 0)::NUMERIC AS all_revenue,
      COUNT(*) FILTER (WHERE channel = 'DINE_IN')::INT AS dine_in_orders,
      COALESCE(ROUND(SUM(effective_val) FILTER (WHERE channel = 'DINE_IN')), 0)::NUMERIC AS dine_in_revenue,
      COUNT(*) FILTER (WHERE channel = 'TAKEAWAY')::INT AS takeaway_orders,
      COALESCE(ROUND(SUM(effective_val) FILTER (WHERE channel = 'TAKEAWAY')), 0)::NUMERIC AS takeaway_revenue,
      COUNT(*) FILTER (WHERE channel = 'DELIVERY')::INT AS delivery_orders,
      COALESCE(ROUND(SUM(effective_val) FILTER (WHERE channel = 'DELIVERY')), 0)::NUMERIC AS delivery_revenue,
      COUNT(*) FILTER (WHERE channel = 'DELIVERY' AND delivery_brand = 'MINMOMOS')::INT AS minmomos_orders,
      COALESCE(ROUND(SUM(effective_val) FILTER (WHERE channel = 'DELIVERY' AND delivery_brand = 'MINMOMOS')), 0)::NUMERIC AS minmomos_revenue,
      COUNT(*) FILTER (WHERE channel = 'DELIVERY' AND delivery_brand = 'MINCHICKEN')::INT AS minchicken_orders,
      COALESCE(ROUND(SUM(effective_val) FILTER (WHERE channel = 'DELIVERY' AND delivery_brand = 'MINCHICKEN')), 0)::NUMERIC AS minchicken_revenue
    FROM filtered_orders
  )
  SELECT jsonb_build_object(
    'rows', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'bucketId', bucket_id,
      'channel', channel,
      'orders', orders,
      'revenue', revenue
    )) FROM bucket_agg), '[]'::jsonb),
    'deliveryBrandRows', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'bucketId', bucket_id,
      'brand', brand,
      'orders', orders,
      'revenue', revenue
    )) FROM delivery_brand_bucket_agg), '[]'::jsonb),
    'activeDays', (SELECT jsonb_build_object(
      'ALL', all_days,
      'DINE_IN', dine_in_days,
      'TAKEAWAY', takeaway_days,
      'DELIVERY', delivery_days,
      'DELIVERY_MINMOMOS', minmomos_days,
      'DELIVERY_MINCHICKEN', minchicken_days
    ) FROM active_days_agg),
    'channelTotals', (SELECT jsonb_build_object(
      'ALL', jsonb_build_object('orders', all_orders, 'revenue', all_revenue),
      'DINE_IN', jsonb_build_object('orders', dine_in_orders, 'revenue', dine_in_revenue),
      'TAKEAWAY', jsonb_build_object('orders', takeaway_orders, 'revenue', takeaway_revenue),
      'DELIVERY', jsonb_build_object('orders', delivery_orders, 'revenue', delivery_revenue),
      'DELIVERY_MINMOMOS', jsonb_build_object('orders', minmomos_orders, 'revenue', minmomos_revenue),
      'DELIVERY_MINCHICKEN', jsonb_build_object('orders', minchicken_orders, 'revenue', minchicken_revenue)
    ) FROM channel_totals_agg)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;
