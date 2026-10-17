# Phase 2 — Step 5: Patient Management

**Branch:** \`feature/phase2-05-patient-management\`  
**Base:** \`feature/phase2-04-calendar-dashboard\` (stacked PR sequence: #1 → #2 → #3 → #4 → #5).  
**Status:** Source code committed, not deployed. No live data was read or changed. Full build and tests are not yet verified.

## Features

1. \`/dashboard/patients\` is available to authorized doctor/active secretary accounts. It does **not enumerate patients on page load**. Staff explicitly searches by a 2+ letter patient name, or 3+ international mobile digits. Search uses server actions with current Clerk/session role checks, allowlisted characters, bounded count + 25 results per page, and soft-deleted patients excluded. The query is sent in an authenticated POST action rather than inserted into URL/browser history. Only name, phone and patient ID are returned.
2. \`/dashboard/patients/[patientId]\` checks current \`patients:history\` permission and renders patient identity and paginated visit history (20/page). The server validates UUID and page bounds; deleted patient and appointments are excluded. Receptionists see identity, appointment date/time/status; the doctor additionally sees the email, DOB/gender and reason for visit.
3. Doctor-only \`patients:manage\` action edits **name/email only**, never overwrites verified phone, and uses the \`clinic.update_staff_patient_profile\` SECURITY INVOKER RPC. It checks the old \`updated_at\` under a row lock to reject lost updates and atomically writes \`profile_updated\` to \`clinic.patient_management_audit\`.
4. Doctor-only \`patients:export\` action prepares an individual patient's visit-history CSV (UTF-8 BOM) with fields escaped against CSV injection (quotes, Excel formula cells). The export is limited to **1,000 appointments per patient** and fails rather than truncating larger histories; every successful export action first inserts an auditable \`history_exported\` event. No public download URLs or direct client-side Supabase access.
5. Existing patient self-service login, booking, payment, dashboard and manual booking flows remain unchanged.

## Security / operational constraints

- New audit table \`clinic.patient_management_audit\` has RLS on, no public / anon / authenticated table privileges, and service-role-only database access.
- The SQL RPC grants EXECUTE only to \`service_role\`. The server is responsible for current Clerk doctor authorization and for preventing patient/public calls from using the service role.
- Patient-search and history calls check current role **on every action/page request**. Disabled secretary access is rejected without waiting for cookie expiration. Hiding buttons is not the authorization layer.
- Exporting is **doctor-only**, not receptionist-accessible; no bulk dump of all patients. Staff profile edits are audited; patient self-service edits are outside this step's staff audit.
- Query text is not embedded in a GET URL; patient data still requires appropriate retention, access logs and encrypted backups for a production medical platform.
- Appointment history is staff booking/visit history, not a complete electronic health record. Clinical notes or prescriptions are not added.
- Search pagination is capped to 1,000 pages; deep history browsing is also bounded for abuse prevention.

## Files

- \`supabase/migrations/20261017103000_patient_management_audit.sql\`
- \`lib/patient-management.ts\`, \`actions/staff-patients.ts\`
- \`app/(doctor)/dashboard/patients/page.tsx\`
- \`app/(doctor)/dashboard/patients/[patientId]/page.tsx\`
- \`components/doctor/patient-search.tsx\`, \`patient-profile-editor.tsx\`, \`patient-history-export.tsx\`
- \`lib/auth/permissions.ts\`, \`components/doctor/dashboard-nav.tsx\`, \`lib/supabase/database.types.ts\`
- \`tests/patient-management.test.ts\`, \`tests/patient-management-database.test.ts\`, \`tests/rbac.test.ts\`

## Staging verification gates

1. Deploy/prerequisite migration files in order before the new audit SQL migration. Never deploy this source to production against an unmigrated database.
2. Run \`npm ci && npm run lint && npx tsc --noEmit && npm run build\`. Previous GitHub runner provisioning failures mean no green build has yet been observed.
3. With \`tsx\` and \`@electric-sql/pglite\` test tooling installed, run unit/DB tests. Test both stale-profile edits and missing audit table against staging.
4. Verify no authenticated public / patient caller can enumerate patients, read patient histories or invoke the staff profile RPC; check disabled receptionist and direct server-action calls.
5. Test name prefix/substring including Arabic, phone prefix, invalid query syntax, empty results, thousands of matches, and large per-patient histories.
6. Verify the CSV cannot run Excel formulas and cannot be retrieved when the audit log write fails. Review log retention/privacy policy and database backups.
7. Confirm patient changes created in the patient self-service flow cannot be silently overwritten by a concurrently open doctor page.

## Next step

Step 6 — Expanded staff/appointment audit events, robust notification outbox and operational monitoring. This implementation only audits doctor profile changes and patient-history exports.
