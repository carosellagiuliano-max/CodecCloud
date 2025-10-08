-- 0001_policies.sql — tenant-scoped row level security policies
SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET search_path = public, pg_catalog;

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT USAGE ON SCHEMA app_private TO authenticated;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT SELECT, USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO authenticated;

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE resource_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE tenant_members FORCE ROW LEVEL SECURITY;
ALTER TABLE staff_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE resources FORCE ROW LEVEL SECURITY;
ALTER TABLE appointment_services FORCE ROW LEVEL SECURITY;
ALTER TABLE appointments FORCE ROW LEVEL SECURITY;
ALTER TABLE resource_allocations FORCE ROW LEVEL SECURITY;
ALTER TABLE products FORCE ROW LEVEL SECURITY;
ALTER TABLE product_stock FORCE ROW LEVEL SECURITY;
ALTER TABLE product_stock_movements FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;
ALTER TABLE outbox_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenants_self_access ON tenants;
CREATE POLICY tenants_self_access ON tenants
    FOR SELECT USING (app_private.is_tenant_member(id));

DROP POLICY IF EXISTS tenant_members_self_access ON tenant_members;
CREATE POLICY tenant_members_self_access ON tenant_members
    FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS tenant_members_owner_manage ON tenant_members;
CREATE POLICY tenant_members_owner_manage ON tenant_members
    FOR ALL USING (
        tenant_id = app_private.current_tenant_id()
        AND EXISTS (
            SELECT 1 FROM tenant_members tm
            WHERE tm.tenant_id = tenant_members.tenant_id
              AND tm.user_id = auth.uid()
              AND tm.role = 'owner'
              AND tm.revoked_at IS NULL
        )
    )
    WITH CHECK (
        tenant_id = app_private.current_tenant_id()
        AND EXISTS (
            SELECT 1 FROM tenant_members tm
            WHERE tm.tenant_id = tenant_members.tenant_id
              AND tm.user_id = auth.uid()
              AND tm.role IN ('owner', 'manager', 'staff')
              AND tm.revoked_at IS NULL
        )
    );

DROP POLICY IF EXISTS staff_profiles_tenant_access ON staff_profiles;
CREATE POLICY staff_profiles_tenant_access ON staff_profiles
    USING (
        tenant_id = app_private.current_tenant_id()
        AND app_private.is_tenant_member(tenant_id)
    )
    WITH CHECK (
        tenant_id = app_private.current_tenant_id()
        AND app_private.is_tenant_member(tenant_id)
    );

DROP POLICY IF EXISTS resources_tenant_access ON resources;
CREATE POLICY resources_tenant_access ON resources
    USING (
        tenant_id = app_private.current_tenant_id()
        AND app_private.is_tenant_member(tenant_id)
    )
    WITH CHECK (
        tenant_id = app_private.current_tenant_id()
        AND app_private.is_tenant_member(tenant_id)
    );

DROP POLICY IF EXISTS appointment_services_tenant_access ON appointment_services;
CREATE POLICY appointment_services_tenant_access ON appointment_services
    USING (
        tenant_id = app_private.current_tenant_id()
        AND app_private.is_tenant_member(tenant_id)
    )
    WITH CHECK (
        tenant_id = app_private.current_tenant_id()
        AND app_private.is_tenant_member(tenant_id)
    );

DROP POLICY IF EXISTS appointments_tenant_access ON appointments;
CREATE POLICY appointments_tenant_access ON appointments
    USING (
        tenant_id = app_private.current_tenant_id()
        AND app_private.is_tenant_member(tenant_id)
    )
    WITH CHECK (
        tenant_id = app_private.current_tenant_id()
        AND app_private.is_tenant_member(tenant_id)
    );

DROP POLICY IF EXISTS resource_allocations_tenant_access ON resource_allocations;
CREATE POLICY resource_allocations_tenant_access ON resource_allocations
    USING (
        tenant_id = app_private.current_tenant_id()
        AND app_private.is_tenant_member(tenant_id)
    )
    WITH CHECK (
        tenant_id = app_private.current_tenant_id()
        AND app_private.is_tenant_member(tenant_id)
    );

DROP POLICY IF EXISTS products_tenant_access ON products;
CREATE POLICY products_tenant_access ON products
    USING (
        tenant_id = app_private.current_tenant_id()
        AND app_private.is_tenant_member(tenant_id)
    )
    WITH CHECK (
        tenant_id = app_private.current_tenant_id()
        AND app_private.is_tenant_member(tenant_id)
    );

DROP POLICY IF EXISTS product_stock_tenant_access ON product_stock;
CREATE POLICY product_stock_tenant_access ON product_stock
    USING (
        tenant_id = app_private.current_tenant_id()
        AND app_private.is_tenant_member(tenant_id)
    )
    WITH CHECK (
        tenant_id = app_private.current_tenant_id()
        AND app_private.is_tenant_member(tenant_id)
    );

DROP POLICY IF EXISTS product_stock_movements_tenant_access ON product_stock_movements;
CREATE POLICY product_stock_movements_tenant_access ON product_stock_movements
    USING (
        tenant_id = app_private.current_tenant_id()
        AND app_private.is_tenant_member(tenant_id)
    )
    WITH CHECK (
        tenant_id = app_private.current_tenant_id()
        AND app_private.is_tenant_member(tenant_id)
    );

DROP POLICY IF EXISTS audit_log_read ON audit_log;
CREATE POLICY audit_log_read ON audit_log
    FOR SELECT USING (
        tenant_id = app_private.current_tenant_id()
        AND app_private.is_tenant_member(tenant_id)
    );

DROP POLICY IF EXISTS outbox_events_read ON outbox_events;
CREATE POLICY outbox_events_read ON outbox_events
    FOR SELECT USING (
        tenant_id = app_private.current_tenant_id()
        AND app_private.is_tenant_member(tenant_id)
    );

