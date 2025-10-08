# CodecCloud Salon Platform

CodecCloud is a production-grade salon operations platform that targets Swiss and European compliance requirements while delivering premium booking and point-of-sale experiences. The system combines a Next.js 15 web application, edge-resident business logic, and Supabase-managed data services to support online and in-person appointments with rigorous security, observability, and localization guarantees.

## Product Pillars

- **Security first** – Row Level Security on every table, mandatory step-up MFA for privileged operations, strict CSP/HSTS, double-submit CSRF mitigation, and rotating JWT signing keys with key identifiers.
- **Operational resilience** – Partitioned appointment storage, optimistic concurrency control, structured audit logging, outbox with DLQ handling, circuit breakers, and disaster recovery drills targeted at RTO ≤ 1h and RPO ≤ 24h.
- **Performance and scalability** – Edge rendering (SSR/ISR) with CDN caching, Redis-backed caching with tenant-aware keys, precomputed aggregates, and feature flags that unlock CQRS plus event sourcing in scale mode.
- **Compliance by design** – DSG/DSGVO data handling, Swiss retention rules (OR 962), double opt-in communications, encrypted sensitive payloads, and tamper-evident fiscal journaling.
- **Exceptional experience** – Accessible and fast UI (Lighthouse ≥ 95, LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1) with next-intl based localization for de-CH, fr-CH, it-CH, and en-CH.

## Monorepo Layout

```
/README.md                 → This document with onboarding details
/.env.example              → Reference environment variables validated at runtime
/docs/                     → Architecture, ERD, scale migration, and operational guides
/apps/web/                 → Next.js 15 application (SSR/ISR/Edge, PWA, shadcn/ui)
/packages/domain/          → Domain logic (pricing, availability, commissions, inventory, sagas)
/packages/ui/              → Design system and shared React components
/packages/types/           → Shared types, Zod schemas, OpenAPI generation, env validation
/functions/                → Edge functions, background workers, cron jobs
/.supabase/migrations/     → Database migrations (expand/migrate/contract) with rollback scripts
/policies/                 → SQL policies enforcing RLS and tenant isolation
/scripts/                  → Developer tooling (prepare-pr, seeding, verification)
/.github/workflows/        → CI/CD automation, quality gates, security scans
```

The folders beyond this batch are introduced incrementally; their contracts are documented here to keep this README forward-compatible with later batches.

## Local Development

1. Install dependencies with `pnpm install` (Node.js 20 LTS and pnpm ≥ 8.7 recommended).
2. Duplicate `.env.example` to `.env.local` and adjust the secrets for your Supabase project, payment providers, mail delivery, and feature flags.
3. Run the Supabase stack (local or managed) and apply migrations from `./.supabase/migrations` once created.
4. Start the development server with `pnpm dev` (to be added in the web app package) and rely on Netlify edge previews for integration testing.

### Quality Gates

The repository enforces the following commands in CI and must remain green before merging:

- `pnpm lint` – ESLint with project-wide flat config and lint-staged integration.
- `pnpm typecheck` – `tsc --noEmit` against strict TypeScript configuration.
- `pnpm test` – Vitest unit and integration suites; Playwright E2E available via `pnpm e2e`.

Run `pnpm prepare:pr` to execute the full verification script (lint, typecheck, tests, and additional consistency checks) before opening a pull request.

### Coding Standards

- TypeScript `strict` mode everywhere; no implicit any, exhaustive switch handling, and typed Supabase queries.
- React 19 with the Next.js App Router, server components by default, client components only when interactive state is required.
- Monetary calculations use integers representing Swiss rappen or euro cents and banker’s rounding for any conversions from floats.
- No try/catch around imports; prefer top-level await only where supported.
- Security headers and middleware must not rely on global service roles; use scoped service tokens with explicit expirations.

## Environment Configuration

Configuration is validated at runtime via `packages/types/env.ts` using Zod schemas with descriptive error messages. The `.env.example` file contains a comprehensive set of variables covering application URLs, Supabase credentials, Stripe/SumUp integrations, mail providers, observability, feature flags, and caching infrastructure. Secrets must never be committed; rely on Netlify environment management and Supabase secrets rotation.

Key guidelines:

- `TZ` is pinned to `Europe/Zurich` to guarantee deterministic scheduling and audit logs.
- Feature flags such as `FEATURE_SCALE`, `FEATURE_REALTIME`, and `FEATURE_WAITLIST` toggle advanced capabilities described in [docs/scale_migration.md](docs/scale_migration.md).
- JWT signing keys use multiple kids (`SUPABASE_JWT_KID_PRIMARY`, `SUPABASE_JWT_KID_SECONDARY`) to support rolling rotations. Keep previous keys active until all tokens expire.
- Stripe and SumUp webhooks must be validated with shared secrets, replay protection windows (5 minutes), and idempotency keys stored in the database.
- Mail integrations (Resend/Postmark) must enforce bounce/complaint suppression with mirrored states in the database.

## Documentation Set

- [docs/architecture.mmd](docs/architecture.mmd) – Mermaid architecture diagram showing data flow between the web app, edge functions, Supabase services, Redis, and observability tooling.
- [docs/erd.mmd](docs/erd.mmd) – Entity relationship diagram covering core salon concepts, audit logging, and resource allocation.
- [docs/scale_migration.md](docs/scale_migration.md) – Strategy for migrating from the MVP transaction model to the scale-ready CQRS/event-sourced mode, including backfill procedures and rollout safeguards.
- Future documents will cover RUNBOOK, SECURITY, PRIVACY, DEPLOYMENT, SLO/KPIs, and incident response templates.

## Security & Compliance Overview

- **Authentication & Authorization** – Supabase Auth backed by passkeys/TOTP MFA, tenant-aware row policies, and scoped edge tokens. Admin actions (refunds, API key generation, PII exports) require step-up verification.
- **Data Protection** – Encrypt sensitive payloads (allergies, biometric images) with envelope keys stored in a dedicated KMS. Maintain double opt-in audit trails and implement automated anonymisation workflows respecting retention schedules.
- **Auditability** – Append-only `audit_log` partitioned by month with cryptographic signatures. Fiscal events are mirrored in a hash-chained ledger for regulatory export.
- **Operational Monitoring** – OpenTelemetry tracing, Sentry EU ingestion with PII scrubbing, structured logs, and dashboards for SLO tracking.
- **Incident Response** – Break-glass access is time-bound with just-in-time approvals and is fully logged; forced logout is triggered after emergency remediations.

## Performance & Reliability Practices

- Partition appointments by the lower bound of their time range to keep indexes lean and enable quick purges of historical partitions.
- Cache static content via ISR and CDN, while using Redis-backed caches for personalised data with tenant-aware keys and short TTLs.
- Use optimistic locking with version columns on mutable aggregates (inventory, orders) and enforce consistent lock acquisition order: appointment → payment → inventory → commission.
- Run background jobs through the outbox worker using LISTEN/NOTIFY with exponential backoff and jitter on retries; fallback to cron polling if notifications stall.

## Localization & Accessibility

- Localised content must ship for de-CH, fr-CH, it-CH, and en-CH; missing keys fail the build. Use pluralisation rules appropriate for each locale and prefer descriptive keys.
- Date and time formatting respects Switzerland conventions and the Europe/Zurich timezone. Currency is displayed in Swiss francs or euros with integer cent storage and banker’s rounding for presentation conversions.
- Accessibility targets follow WCAG 2.2 AA, emphasising keyboard navigation, focus rings, reduced motion modes, and ARIA live regions for calendar drag-and-drop feedback.

## Deployment Notes

- Netlify handles SSR/ISR/Edge rendering with environment-specific site IDs. Edge functions authenticate with Supabase using short-lived service tokens distributed via Netlify secrets.
- Supabase hosts Postgres 15+, storage, and auth, while Redis (Upstash or Aiven) covers caching and rate limiting. Ensure all providers are EU-hosted with compliant data processing agreements.
- CI/CD (GitHub Actions) enforces lint/type/test, database migration smoke tests, dependency vulnerability scanning, and gitleaks.

## Support & Contribution Workflow

1. Create a feature branch with a descriptive name (`feature/availability-sync`).
2. Update or add documentation alongside code changes; docs are version-controlled and reviewed with the code.
3. Ensure automated checks pass locally; include `pnpm prepare:pr` logs in the pull request description.
4. Request review from domain experts (security, data, product) before merging to the protected branch.

CodecCloud exists to provide salons with trustworthy digital infrastructure. Keep code review thorough, respect data privacy, and uphold the product pillars documented above.
