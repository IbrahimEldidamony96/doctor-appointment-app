-- ============================================================
-- Migration: dashboard stats function
-- ============================================================
-- IMPORTANT: for this (and every other clinic.* query) to be
-- reachable via supabase-js, the `clinic` schema must be added to
-- "Exposed schemas" in Supabase Dashboard → Project Settings → API
-- → Data API settings. This should already be done from the first
-- migration, but double-check it if any query silently 404s.
-- ============================================================

create or replace function clinic.get_dashboard_stats()
returns table (
  total_appointments bigint,
  completed_appointments bigint,
  cancelled_appointments bigint,
  no_show_appointments bigint,
  cancellation_rate numeric,
  total_revenue numeric,
  revenue_this_month numeric,
  average_rating numeric,
  reviews_count bigint
)
language sql
stable
as $$
  select
    count(*) as total_appointments,
    count(*) filter (where status = 'completed') as completed_appointments,
    count(*) filter (where status = 'cancelled') as cancelled_appointments,
    count(*) filter (where status = 'no_show') as no_show_appointments,
    round(
      100.0 * count(*) filter (where status = 'cancelled') / nullif(count(*), 0),
      1
    ) as cancellation_rate,
    (select coalesce(sum(amount), 0) from clinic.payments where status = 'paid') as total_revenue,
    (
      select coalesce(sum(amount), 0) from clinic.payments
      where status = 'paid' and paid_at >= date_trunc('month', now())
    ) as revenue_this_month,
    (select round(avg(rating), 1) from clinic.reviews) as average_rating,
    (select count(*) from clinic.reviews) as reviews_count
  from clinic.appointments;
$$;
