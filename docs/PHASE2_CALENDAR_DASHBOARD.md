# Phase 2 — Step 4: Calendar Dashboard

**GitHub branch:** `feature/phase2-04-calendar-dashboard`  
**Parent:** `feature/phase2-03-appointment-reschedule` (PR #4), on top of PRs #3, #2 and #1.  
**State:** Implementation source committed. Build/tests not executed in a working CI environment. No deployment or live Supabase changes.

## Delivered

- **URL:** `/dashboard/calendar`; also linked from the doctor/secretary sidebar and dashboard overview.
- **Views:** day (chronological timeline), week (Saturday–Friday seven-day column grid) with date navigation and return-to-today link.
- **Server-side status filter:** all, pending, confirmed, completed, cancelled and no-show. Filter is validated and applied to the SQL query. Summary counters reflect the *filtered* appointments in the selected range.
- **Privacy:** page requires current Clerk identity and `calendar:view` permission, checked in `getClinicActor()` on the server on **every request**. Inactive secretary logins do not gain calendar access; public/anonymous visitors cannot load the page. The service-role key stays in server modules only.
- **Calendar content:** patient display name and booking start/end, visit status, clinic recurring open hours, closed dates and partial blocked intervals. Individual appointments are selectable for more details, phone, notes, confirmation/cancellation, doctor-only completion/no-show, and the rescheduling route. Manual booking is a direct shortcut.
- **Correct time model:** use Cairo's local calendar date from `getClinicDateTime()`; use UTC calendar arithmetic only on date-only strings for Saturday-based weeks, avoiding DST day shifts. Visit times are stored as clinic-local SQL TIME.
- **Query limits:** accept only validated ISO day and known statuses/view values. Requested anchor date must be within ±365 days of today; appointment ID is UUID-validated. Calendar loads max 7 days, paginates stable date/time/ID ordering in pages of 500, and throws rather than silently truncating above 10,000 appointments. Deleted rows are excluded.
- **No schema changes needed:** this step reads existing availability, blocked dates, appointments and patient relationships. All rescheduling writes remain in the previous atomic RPC (PR #4); the calendar is read-only apart from calling already-protected status Server Actions.

## Implemented files

`lib/clinic-calendar.ts` — pure query/date/view helpers.  
`lib/calendar-data.ts` — server-only bounded authorized window reads.  
`components/doctor/calendar-board.tsx` — day/week calendar and booking detail actions.  
`app/(doctor)/dashboard/calendar/page.tsx` — guarded Server Component.  
`components/doctor/dashboard-nav.tsx`, `app/(doctor)/dashboard/page.tsx` — navigation.  
`lib/auth/permissions.ts` — explicit `calendar:view` for doctor and secretary.  
`tests/calendar.test.ts`, `tests/rbac.test.ts` — pure logic and role expectations.

## Staging acceptance checks

1. Apply migrations for Phase 1 and the subsequent RBAC, manual booking and rescheduling steps in order *before* deploying this branch. This calendar step itself requires no SQL migration.
2. Doctor and active secretary should both see the calendar; an unauthenticated or disabled user should not. Confirm doctor-only actions cannot be submitted by a secretary even if client buttons are manipulated.
3. Verify Saturday–Friday weeks, month/year transitions, next/previous/today, status filters and day view on mobile.
4. Test `pending`, `confirmed`, `cancelled`, `completed`, `no_show`; closed dates, partial closures and periods outside open hours. Confirm terminated and deleted appointments behave as expected.
5. Book, confirm and move a visit in a separate tab; revisit the calendar and confirm data after route refresh. No live real-time subscription is claimed.
6. From a connected local environment run `npm ci`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `node --import tsx --test tests/calendar.test.ts tests/rbac.test.ts` with the test tooling installed. CI hosted runners previously failed before starting any commands; build success **cannot be asserted**.

## Next milestone

**Step 5: Patient Management** — scoped staff patient search, visit history, protected profile details and CSV export with audit/privacy safeguards.
