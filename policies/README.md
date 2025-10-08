# Row-Level Security Reference

This project enforces strict tenant isolation across all business tables. Each request must provide a JWT claim `tenant_id` and executes as the Supabase `authenticated` role (or anon for public reads). The helper functions below centralise tenant resolution and membership checks:

- `app_private.current_tenant_id()` extracts the tenant from the active JWT.
- `app_private.is_tenant_member(target uuid)` verifies membership via `tenant_members` rows with `revoked_at IS NULL`.
- `auth.uid()`/`auth.role()` are lightweight shims so migrations run on plain PostgreSQL during CI.

## Table Coverage

| Table | Policy | Effect |
|-------|--------|--------|
| `tenants` | `tenants_self_access` | Read/update only for active members. |
| `tenant_members` | `tenant_members_self_access`, `tenant_members_owner_manage` | Users see their own membership; tenant owners manage roster changes. |
| `staff_profiles`, `resources`, `appointment_services`, `appointments`, `resource_allocations`, `products`, `product_stock`, `product_stock_movements` | `<table>_tenant_access` | Full CRUD limited to the tenant in the JWT and only if the caller is an active member. |
| `audit_log` | `audit_log_read` | Read-only access for the owning tenant. |
| `outbox_events` | `outbox_events_read` | Read-only access for the owning tenant; background workers can reuse the same policy with service claims. |

All RLS-protected tables have `FORCE ROW LEVEL SECURITY` enabled so even superusers acting without bypass privileges must satisfy the policies.

## Grants

The `authenticated` role receives `SELECT/INSERT/UPDATE/DELETE` on public tables and sequences, while `anon` is limited to read-only access. Default privileges keep future tables aligned with this contract. No service-role keys are required for daily operations—privileged maintenance should run with elevated database roles rather than bypassing RLS via API keys.

## Partitions & Triggers

Appointments are monthly range-partitioned; the `app_private.ensure_appointments_partition()` trigger creates partitions on-the-fly and attaches a GiST `EXCLUDE` constraint to avoid overlapping bookings per staff member. Resource allocations use a static `EXCLUDE` constraint for shared assets. Audit, outbox, data version, and stock recalculation triggers inherit the same tenant-scoped policies because they operate within the same tables and never expose cross-tenant data.
