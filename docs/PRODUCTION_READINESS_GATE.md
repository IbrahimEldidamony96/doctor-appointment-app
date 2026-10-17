# Production Readiness Gate — Doctor App

This gate is intentionally **NOT approved**. Code in GitHub is not a successful build, a deployed migration, or an end-to-end provider test.

## Current verified observations
- Source of truth for all Phase 2 changes: branch `feature/phase2-06-audit-notification-outbox`; PRs #1–#7 are stacked and open in draft.
- GitHub Actions runs for Phase 1 failed before tests ran; no successful CI evidence.
- Connected Supabase project **doctor-appointment** (`njdhqxvkubmktqbnasib`) has migrations `001`–`006` and `20261004162647` through `20261004172525`, but **none of the Phase 2 migrations**.
- Existing Supabase project has **zero staging branches**. Creating a Supabase development branch requires an explicit cost confirmation by the user. Do not apply Phase 2 SQL on production as an alternative.
- The current executor has Node 22/npm 10 but cannot reach GitHub/npm, and the source checkout is not available locally. Actual `npm ci`, `tsc`, `next build` and database tests are pending.
- This PR adds a GitHub Actions workflow covering source changes, typecheck, lint, Next.js production build and isolated database/security test runner, including workflow_dispatch.

## Release checklist
- [ ] Successfully provision a GitHub runner (or locally run commands against this exact branch).
- [ ] `npm ci`
- [ ] `npx tsc --noEmit`
- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] `node --conditions=react-server --import tsx --test tests/*.test.ts` after isolated test tools install
- [ ] Create a **separate authorized staging Supabase project/branch**, apply Phase 2 migrations in order, verify schema, privilege grants and RLS.
- [ ] Integration tests: Clerk doctor and staff authorization, patient OTP WhatsApp, atomic booking/overlap, reschedule, Paymob sandbox, Resend and outbox retry/ack, Cairo DST.
- [ ] Inspect error logs, provider delivery and cost limits. Validate failure/recovery and privacy.
- [ ] Review and merge stacked PRs in dependency order only after all above checks succeed.
- [ ] Re-run build/deployment smoke tests on merged main before enabling production traffic.

## Suggested Windows local verification
```powershell
git fetch origin
git switch fix/phase2-production-readiness
git pull --ff-only origin fix/phase2-production-readiness
npm ci
npx tsc --noEmit
npm run lint
npm run build
npm install --no-save --package-lock=false --ignore-scripts @electric-sql/pglite@0.5.10 tsx@4.23.15
node --conditions=react-server --import tsx --test tests/*.test.ts
```

**No live database migrations, merges, or real patient/provider messages should be sent until staging is verified.**
