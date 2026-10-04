-- ============================================================
-- Migration: consultation price
-- ============================================================
alter table clinic.settings add column consultation_price numeric(10, 2);
