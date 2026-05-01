-- This script will sync the 'ltv' and 'total_orders' columns in your customers table
-- to match the actual order history. 
-- Run this once in your Supabase SQL Editor.

UPDATE customers c
SET 
  total_orders = (
    SELECT COUNT(o.id) 
    FROM orders o 
    WHERE (o.customer_id = c.id OR o.customer_phone = c.phone)
    AND o.deletion_info IS NULL
  ),
  ltv = (
    SELECT COALESCE(SUM(o.total), 0)
    FROM orders o 
    WHERE (o.customer_id = c.id OR o.customer_phone = c.phone)
    AND o.deletion_info IS NULL
  );
