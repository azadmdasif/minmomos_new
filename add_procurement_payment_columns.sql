-- SQL script to add payment columns to the procurements table for tracking payment statuses, modes, and history log.
-- Run this script in the Supabase SQL Editor.

ALTER TABLE procurements 
  ADD COLUMN IF NOT EXISTS is_paid BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paid_by TEXT,
  ADD COLUMN IF NOT EXISTS payment_notes TEXT,
  ADD COLUMN IF NOT EXISTS payment_mode TEXT,
  ADD COLUMN IF NOT EXISTS payment_history JSONB DEFAULT '[]'::jsonb;
