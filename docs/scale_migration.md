# MVP to Scale Migration Plan

This document details how CodecCloud evolves from the default MVP deployment (transactional processing with an outbox) to the scale configuration that introduces CQRS, event sourcing, and advanced observability. The plan minimises downtime, maintains data integrity, and respects Swiss/EU compliance requirements.

## Operating Modes

### MVP Mode (Default)

- Single Postgres write model with partitioned tables and strict Row Level Security.
- Synchronous booking and order workflows with transactional guarantees.
- Outbox table coupled with LISTEN/NOTIFY and cron fallback for asynchronous work.
- Redis provides idempotency tracking, session caching, and rate limiting.
- Aggregates (availability calendars, sales metrics) computed incrementally in-table.

### Scale Mode (`FEATURE_SCALE=on`)

- Command and query separation with read replicas fed by event projections.
- Event store backed by `audit_log` backfill and append-only event tables.
- Snapshotting for long-lived aggregates (staff utilisation, loyalty balances).
- Saga orchestration for cross-domain flows (booking confirmation, fulfilment, refunds).
- Expanded observability: dedicated OTel collector, trace-based alerting, workload-specific dashboards.

## Transition Principles

1. **Expand → Migrate → Contract** – Introduce new structures alongside MVP tables, migrate data, then retire legacy paths after validation.
2. **Dual-Write Gatekeeping** – While migrating, commands write to both transactional tables and the event store; feature flags keep reads on the proven path until validation passes.
3. **Backfill Safety** – All backfills run with rate limiting, tenant scoping, and checksum verification. Each step is resumable and logs progress into the audit log.
4. **No Lost Events** – Use idempotency keys and sequence checkpoints to ensure event stream completeness even if jobs retry.
5. **Compliance Preservation** – Retain historical records for ≥10 years, ensure encryption for sensitive payloads, and document each migration step for auditors.

## Step-by-Step Migration

### 1. Prepare Infrastructure

- Provision Redis clusters with replica support and enable persistence snapshots.
- Enable Netlify feature environments for canary deploys tied to the `FEATURE_SCALE` flag.
- Add Supabase read replicas and ensure WAL retention covers the backfill duration.
- Configure dedicated OTel collector endpoints for edge functions and workers.

### 2. Introduce Event Store

- Create `event_store` table partitioned by month with columns `(id uuid, tenant_id uuid, aggregate_type text, aggregate_id uuid, event_type text, version integer, payload jsonb, occurred_at timestamptz)`.
- Add write policies enforcing monotonic version increments and tenant isolation.
- Implement CDC triggers on transactional tables to append domain events for historical records.
- Populate the event store by replaying `audit_log` entries, matching actions to domain events and capturing metadata (actor, source, IP).

### 3. Build Projection Pipeline

- Deploy projection workers that consume the event stream via LISTEN/NOTIFY and checkpoint progress in `event_projection_offsets`.
- Generate read models: availability slots, appointment summaries, revenue dashboards, loyalty balances, and inventory stock views.
- Validate projections by reconciling totals against transactional tables; discrepancies block rollout and raise alerts.

### 4. Enable CQRS Reads

- Guard new API routes and UI components with `FEATURE_SCALE` or downstream flags (e.g., `FEATURE_WAITLIST`).
- Provide feature toggles per tenant, allowing incremental opt-in and staged rollout.
- Measure performance (p95 latency, throughput) and correctness (projection vs. transactional parity) via dashboards.

### 5. Activate Saga Orchestration

- Introduce orchestrators for complex workflows: booking lifecycle, payment capture/refund, resource rebalancing.
- Each saga emits compensating actions into the event stream and records state transitions in `saga_instances` with versioned snapshots.
- Monitor saga metrics (timeout rate, compensation frequency) and tie alerts to on-call rotations.

### 6. Retire Legacy Paths

- Once projections are validated and sagas stable, flip read paths to the query models.
- Deprecate direct read access to transactional tables for API consumers; keep internal fallbacks for emergency read-only access.
- Drop redundant materialized views after verifying dashboards run on the new projections.
- Document rollback steps and maintain them for at least one release cycle.

## Rollback Strategy

- Maintain `FEATURE_SCALE` off by default; toggling it off returns the system to transactional reads while continuing event capture.
- Keep dual-write logic for one full release cycle to ensure zero data loss if rollback is necessary.
- Store daily snapshots of the projection databases; if corruption occurs, rebuild from the event store replay.
- Track deployment checkpoints in the audit log, including operator, timestamp, and change summary.

## Verification Checklist

- [ ] Event store populated with parity to transactional tables (random sample checks).
- [ ] Projections reconcile with transactional totals (appointments, revenue, inventory) within ±0.1% variance.
- [ ] Saga orchestrations meet success SLA (≥99% success, ≤1% compensation rate).
- [ ] Observability dashboards updated with new metrics and alert routes tested.
- [ ] Rollback procedure executed in staging and documented in the RUNBOOK.

## Communication Plan

- Notify tenant administrators about the migration timeline and feature benefits.
- Provide sandbox tenants to pilot the new capabilities and collect feedback.
- Share weekly status reports covering progress, risk items, and compliance checkpoints.
- After rollout, publish a post-migration analysis summarising performance gains and outstanding tasks.

The migration approach ensures CodecCloud can scale to high booking volumes without sacrificing the security, compliance, or operational discipline established in MVP mode.
