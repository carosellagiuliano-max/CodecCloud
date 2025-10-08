-- rollback for 0001_core.sql + 0001_policies.sql
SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET search_path = public, pg_catalog;

DO $$
BEGIN
    PERFORM 1 FROM pg_trigger WHERE tgname = 'appointments_sync_slot_bounds';
    IF FOUND THEN
        DROP TRIGGER appointments_sync_slot_bounds ON appointments;
    END IF;
END;
$$;

DO $$
BEGIN
    PERFORM 1 FROM pg_trigger WHERE tgname = 'appointments_partition_guard';
    IF FOUND THEN
        DROP TRIGGER appointments_partition_guard ON appointments;
    END IF;
END;
$$;

DO $$
BEGIN
    PERFORM 1 FROM pg_trigger WHERE tgname = 'appointments_valid_transition';
    IF FOUND THEN
        DROP TRIGGER appointments_valid_transition ON appointments;
    END IF;
END;
$$;

DO $$
BEGIN
    PERFORM 1 FROM pg_trigger WHERE tgname = 'appointments_touch_updated_at';
    IF FOUND THEN
        DROP TRIGGER appointments_touch_updated_at ON appointments;
    END IF;
END;
$$;

DO $$
BEGIN
    PERFORM 1 FROM pg_trigger WHERE tgname = 'appointments_audit';
    IF FOUND THEN
        DROP TRIGGER appointments_audit ON appointments;
    END IF;
END;
$$;

DO $$
BEGIN
    PERFORM 1 FROM pg_trigger WHERE tgname = 'appointments_outbox';
    IF FOUND THEN
        DROP TRIGGER appointments_outbox ON appointments;
    END IF;
END;
$$;

DO $$
BEGIN
    PERFORM 1 FROM pg_trigger WHERE tgname = 'appointments_bump_version';
    IF FOUND THEN
        DROP TRIGGER appointments_bump_version ON appointments;
    END IF;
END;
$$;

DO $$
BEGIN
    PERFORM 1 FROM pg_trigger WHERE tgname = 'resource_allocations_touch_updated_at';
    IF FOUND THEN
        DROP TRIGGER resource_allocations_touch_updated_at ON resource_allocations;
    END IF;
END;
$$;

DO $$
BEGIN
    PERFORM 1 FROM pg_trigger WHERE tgname = 'resource_allocations_sync_slot';
    IF FOUND THEN
        DROP TRIGGER resource_allocations_sync_slot ON resource_allocations;
    END IF;
END;
$$;

DO $$
BEGIN
    PERFORM 1 FROM pg_trigger WHERE tgname = 'resource_allocations_audit';
    IF FOUND THEN
        DROP TRIGGER resource_allocations_audit ON resource_allocations;
    END IF;
END;
$$;

DO $$
BEGIN
    PERFORM 1 FROM pg_trigger WHERE tgname = 'resource_allocations_outbox';
    IF FOUND THEN
        DROP TRIGGER resource_allocations_outbox ON resource_allocations;
    END IF;
END;
$$;

DO $$
BEGIN
    PERFORM 1 FROM pg_trigger WHERE tgname = 'resource_allocations_bump_version';
    IF FOUND THEN
        DROP TRIGGER resource_allocations_bump_version ON resource_allocations;
    END IF;
END;
$$;

DO $$
BEGIN
    PERFORM 1 FROM pg_trigger WHERE tgname = 'products_touch_updated_at';
    IF FOUND THEN
        DROP TRIGGER products_touch_updated_at ON products;
    END IF;
END;
$$;

DO $$
BEGIN
    PERFORM 1 FROM pg_trigger WHERE tgname = 'products_audit';
    IF FOUND THEN
        DROP TRIGGER products_audit ON products;
    END IF;
END;
$$;

DO $$
BEGIN
    PERFORM 1 FROM pg_trigger WHERE tgname = 'products_outbox';
    IF FOUND THEN
        DROP TRIGGER products_outbox ON products;
    END IF;
END;
$$;

DO $$
BEGIN
    PERFORM 1 FROM pg_trigger WHERE tgname = 'products_bump_version';
    IF FOUND THEN
        DROP TRIGGER products_bump_version ON products;
    END IF;
END;
$$;

DO $$
BEGIN
    PERFORM 1 FROM pg_trigger WHERE tgname = 'product_stock_movements_audit';
    IF FOUND THEN
        DROP TRIGGER product_stock_movements_audit ON product_stock_movements;
    END IF;
END;
$$;

DO $$
BEGIN
    PERFORM 1 FROM pg_trigger WHERE tgname = 'product_stock_movements_outbox';
    IF FOUND THEN
        DROP TRIGGER product_stock_movements_outbox ON product_stock_movements;
    END IF;
END;
$$;

DO $$
BEGIN
    PERFORM 1 FROM pg_trigger WHERE tgname = 'product_stock_movements_recalc';
    IF FOUND THEN
        DROP TRIGGER product_stock_movements_recalc ON product_stock_movements;
    END IF;
END;
$$;

DO $$
BEGIN
    PERFORM 1 FROM pg_trigger WHERE tgname = 'product_stock_movements_bump_version';
    IF FOUND THEN
        DROP TRIGGER product_stock_movements_bump_version ON product_stock_movements;
    END IF;
END;
$$;

DROP TABLE IF EXISTS outbox_events CASCADE;
DROP TABLE IF EXISTS audit_log CASCADE;
DROP TABLE IF EXISTS product_stock_movements CASCADE;
DROP TABLE IF EXISTS product_stock CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS resource_allocations CASCADE;
DROP TABLE IF EXISTS appointments CASCADE;
DROP TABLE IF EXISTS appointment_services CASCADE;
DROP TABLE IF EXISTS resources CASCADE;
DROP TABLE IF EXISTS staff_profiles CASCADE;
DROP TABLE IF EXISTS tenant_members CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;

DO $$
BEGIN
    PERFORM 1 FROM pg_type WHERE typname = 'appointment_status';
    IF FOUND THEN
        DROP TYPE appointment_status;
    END IF;
END;
$$;

DROP FUNCTION IF EXISTS app_private.outbox_enqueue() CASCADE;
DROP FUNCTION IF EXISTS app_private.audit_append() CASCADE;
DROP FUNCTION IF EXISTS app_private.bump_data_version() CASCADE;
DROP FUNCTION IF EXISTS app_private.recalculate_product_stock() CASCADE;
DROP FUNCTION IF EXISTS app_private.ensure_appointments_partition() CASCADE;
DROP FUNCTION IF EXISTS app_private.ensure_appointments_partition_for(timestamptz) CASCADE;
DROP FUNCTION IF EXISTS app_private.ensure_valid_transition() CASCADE;
DROP FUNCTION IF EXISTS app_private.touch_updated_at() CASCADE;
DROP FUNCTION IF EXISTS app_private.sync_slot_bounds() CASCADE;
DROP FUNCTION IF EXISTS app_private.attach_allocation_slot() CASCADE;
DROP FUNCTION IF EXISTS app_private.is_tenant_member(uuid) CASCADE;
DROP FUNCTION IF EXISTS app_private.current_tenant_id() CASCADE;
DROP FUNCTION IF EXISTS auth.role() CASCADE;
DROP FUNCTION IF EXISTS auth.uid() CASCADE;

DROP SCHEMA IF EXISTS app_private CASCADE;

