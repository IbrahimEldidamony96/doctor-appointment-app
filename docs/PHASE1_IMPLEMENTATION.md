# Phase 1 backend integrity — implementation handoff

**Date:** 2026-10-16  
**Branch:** `fix/phase-1-backend-integrity`  
**Pull Request:** https://github.com/IbrahimEldidamony96/doctor-appointment-app/pull/1  
**Base:** `main` commit `8a162b4e8db60be2328952e534c536c1498a4e90`

This document complements `docs/DOCTOR_APP_ANALYSIS.md`. It tracks changes implemented in the feature branch (not merged), without claiming execution of tests or deployment.

## Implemented in the branch

1. **Patient OTP:** `lib/auth/otp.ts` now calls serialized SQL functions `clinic.issue_otp` / `clinic.verify_otp`; send and verify routes validate request content type/JSON and return sanitized errors. Six-digit OTP and server-side hash secrets; approved Meta authentication template required.
2. **Patient sessions:** `lib/auth/patient-jwt.ts` enforces explicit issuer/audience, standard timestamps, bounded 30-day expiration, stronger secret validation and patient UUID/E.164 claims.
3. **Doctor authorization:** `isDoctorUser` and `isAuthorizedDoctor` now resolve to the same allowlist implementation. Status changes reject stale/invalid transitions with UI feedback.
4. **Appointments:** Booking and cancellation now call `clinic.create_patient_appointment` and `clinic.cancel_patient_appointment`. Displayed free slots use Cairo/DST-aware interval overlap generation.
5. **Payments:** `begin_payment_attempt` serializes attempt creation. New payment intentions persist Paymob's numeric `intention_order_id` as `provider_order_id`. The HMAC-verified callback correlates **signed** `order.id` and checks amount/currency/integration ID, then calls idempotent `apply_paymob_transaction`; merchant references are not used for trusted lookup.
6. **Notifications:** WhatsApp authentication, reminder and clinic notifications use named approved templates rather than free-form messages. Email patient name/content are HTML-escaped.
7. **Reminders:** Atomic SQL `claim_appointment_reminders` claims and leases batches, and acknowledgements condition on `reminder_claim_token`. `vercel.json` schedules once daily 05:00 UTC (Hobby-compatible), **not exact 24-hour pre-visit delivery**.
8. **Admin:** Doctor availability edits validate clock/date values and return errors when delete/update affects no rows.
9. **Structure:** Removed duplicate conflicting `app/page.tsx` so the styled `app/(patient)/page.tsx` owns `/`. Supabase application imports use the more complete schema types in `lib/supabase/database.types.ts`.

## Build verification update (2026-10-16)

- Fixed **TS1117** duplicate `payment_in_progress` property in `components/patient/appointment-card.tsx` (commit `38304f6`).
- Fixed a separate production typecheck blocker: repository tests import `@electric-sql/pglite`, which is absent from committed dependencies/lockfile, while `tsconfig.json` included all `tests/**/*.ts`. Tests now remain outside the production tsconfig's typecheck and are run separately by the CI test step (commit `c10ddfc`).
- **Build remains unverified.** GitHub Actions runs failed before allocating a runner and before any build/test command executed. The assistant's container does have Node.js, but its network cannot access GitHub or npm to download the repository or dependencies; there is no preexisting local checkout/node_modules.
- **Required verification:** From this branch in a networked checkout with Node.js 22 and valid environment variables, run `npm ci && npm run build`. Only label the build passing after seeing a successful exit code and the actual Next.js output. Tests need their separately installed dev test tooling.
- **Status:** Changes are committed to the feature branch, with PR #1 still draft. No merge and no assertion that the build passes.

## Current verification status

- **GitHub changes were successfully committed**, and a **draft PR was opened**.
- A new Actions workflow at `.github/workflows/phase1-ci.yml` attempts `npm ci`, TypeScript, lint and isolated database tests.
- Initial workflow attempts on **ubuntu-22.04** and **ubuntu-latest** reported failure **with zero executed steps and runner_id=0** (GitHub runner provisioning / infrastructure / account setup). This **does not prove application checks passed or failed**.
- No actual local `npm ci`, `tsc`, `eslint`, `next build`, PGlite tests, Paymob sandbox callbacks, or live WhatsApp sends were completed by the assistant in this environment. External Git access is unavailable in the container.
- **DO NOT MERGE OR DEPLOY** without successful CI/typecheck/integration smoke test. The code may still contain latent type or runtime issues.

## Commands to run in a normal Node 22 checkout

```bash
git switch fix/phase-1-backend-integrity
npm ci
npm install --no-save --package-lock=false @electric-sql/pglite@0.5.10 tsx@4.23.15
npx tsc --noEmit
npm run lint
node --conditions=react-server --import tsx --test tests/*.test.ts
npm run build
node scripts/check-env.mjs --production
```

The final command requires a properly configured production `.env.local` and will fail on missing credentials by design. Do not paste secrets into PRs or CI logs.

## Staging acceptance criteria

- Apply the already-committed SQL migrations **in order** to a disposable staging DB; verify `clinic` is exposed only as intended and service role has execute permissions on required RPCs. Avoid granting public table access.
- Set actual `DOCTOR_CLERK_USER_IDS`, separate 32+ byte patient, OTP and cron secrets, HTTPS `NEXT_PUBLIC_APP_URL`, Paymob sandbox integration IDs/keys, approved WhatsApp copy-code and utility templates (correct language code and 5-minute OTP).
- Exercise: two OTP verification requests with the same code; attempts/cooldowns; two overlapping booking requests; cancellations at deadline and Cairo DST boundary; concurrent payment initiation; valid HMAC callback, altered merchant reference, modified amount/order ID, duplicate success, delayed failure; concurrent cron requests and reminder lease retry.
- Confirm **actual Paymob callback payload shape** and Intention response in sandbox, including `intention_order_id`. The provider's docs document this field: https://developers.paymob.com/paymob-docs/intention-apis/create-intention
- Verify WhatsApp approved template exists and can be delivered to a real opt-in test number; receipt of an API 200 does not prove delivery.
- Inspect Vercel's job quota and choose a schedule that meets the desired reminder lead time; free-plan daily cron only sends reminders within the next rolling 24h, not exactly one day before. In more active clinics, scale the queue or move to an hourly scheduler.
- Post-deploy: configure alerting, backups, secret rotation, provider retry visibility, legal/privacy requirements for medical data, and reconciliation procedures for ambiguous payment provider timeouts.

## Remaining improvements not represented as completed

- Committed pinned test dependencies and regenerated `package-lock.json` (CI currently installs isolated test tools dynamically).
- Provider reconciliation/outbox for ambiguous Paymob timeouts and exactly-once notification intent. External WhatsApp delivery inherently permits duplicates after uncertain acknowledgement.
- Global/IP-based anti-abuse limiting beyond database per-phone OTP send budget.
- Persistent audit/event logs, production observability, backups and a real deployment/rollback drill.
- Comprehensive tests at the HTTP/action boundary with provider sandbox responses and successful GitHub Actions execution.

## How to resume

Ask: *"Read `docs/PHASE1_IMPLEMENTATION.md` in my Doctor App GitHub repo, inspect the latest PR #1 changes and CI status, then fix the next failing check or staging issue without rereading unchanged files."*
