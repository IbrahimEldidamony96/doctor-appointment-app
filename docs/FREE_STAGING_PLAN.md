# No-cost verification and staging

## Verified account state, 2026-10-17
The connected Supabase organization **IbrahimEldidamony96's Org** is on plan **Free**.
Existing `doctor-appointment` project is active; two old projects are inactive.
Supabase quoted a **new project at $0/month**, but a paid development **branch at $0.01344/hour**.
Do not create or enable any paid branch or add-ons. No hosted staging project or live migration was created.

Official Supabase Free permits two active free projects across eligible Owner/Admin memberships, subject to limits. A second zero-cost Free project could be chosen later; creation needs confirmation of the target organization. Keep real patient data out of staging.

## Free local checks — Windows PowerShell, Node.js 22+, npm

```powershell
git fetch origin
git switch fix/phase2-production-readiness
git pull --ff-only origin fix/phase2-production-readiness
powershell -ExecutionPolicy Bypass -File scripts/verify-free-local.ps1
```

This runs npm ci, TypeScript, ESLint, Next production build, and PGlite SQL/security suites.
Build may require valid **local-only** environment secrets. Do not put production service keys in test environment.

## Free local Supabase — optional Docker-compatible engine

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-free-supabase.ps1
npx supabase status
```

Local Supabase starts PostgreSQL, API, Auth and local development utilities and replays local migration files; verify the `clinic` schema exposed through the local API.
Use the local API URL and credentials from `npx supabase status` in `.env.local`.
Do NOT use `supabase link`, `db push`, or `db reset --linked` while testing; these could target hosted data.
Local `npx supabase db reset` (without linked) deletes disposable **local** data only.
Do not expose the dev stack to the Internet.

## GitHub Actions with no surprises

Phase 2 workflow is now **manual only**, so pushes cannot automatically consume GitHub-hosted minutes.
Private repository hosted-runner allowance can be exhausted and incur charges; use local scripts rather than paid CI.
Existing GitHub Actions runs failed before any steps were executed. The Build is **not** verified.

## Acceptance and gating

- [ ] Run local build, ESLint, TypeScript and PGlite suites until green
- [ ] Validate every migration against a disposable LOCAL Supabase database
- [ ] Test RBAC, OTP/Clerk, booking, reschedule, Paymob HMAC sandbox/mocks and notification retry mocks
- [ ] Never send billable WhatsApp/SMS or real payment charges for tests
- [ ] Review and merge stacked PRs in dependency order only after checks pass
- [ ] Do not deploy to production before live-like integration tests and privacy/security review

No paid projects, production schema changes, or provider transactions were performed.
