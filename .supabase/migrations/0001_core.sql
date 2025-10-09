-- 0001_core.sql — foundational schema + business logic triggers
SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = on;
SET search_path = public, pg_catalog;

CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS app_private;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_roles WHERE rolname = 'anon'
    ) THEN
        CREATE ROLE anon NOLOGIN;
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_roles WHERE rolname = 'authenticated'
    ) THEN
        CREATE ROLE authenticated NOLOGIN;
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_roles WHERE rolname = 'service_role'
    ) THEN
        CREATE ROLE service_role NOLOGIN;
    END IF;
END;
$$;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    claims jsonb;
    subject text;
BEGIN
    BEGIN
        claims := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;
    EXCEPTION
        WHEN others THEN
            RETURN NULL;
    END;

    subject := claims ->> 'sub';
    IF subject IS NULL OR subject = '' THEN
        RETURN NULL;
    END IF;

    RETURN subject::uuid;
END;
$$;

CREATE OR REPLACE FUNCTION auth.role() RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    claims jsonb;
    role_value text;
BEGIN
    BEGIN
        claims := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;
    EXCEPTION
        WHEN others THEN
            RETURN 'anon';
    END;

    role_value := claims ->> 'role';
    IF role_value IS NULL OR role_value = '' THEN
        RETURN 'anon';
    END IF;

    RETURN role_value;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.current_tenant_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    claims jsonb;
    tenant_text text;
BEGIN
    BEGIN
        claims := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;
    EXCEPTION
        WHEN others THEN
            claims := '{}'::jsonb;
    END;

    tenant_text := claims ->> 'tenant_id';
    IF tenant_text IS NULL OR tenant_text = '' THEN
        RETURN NULL;
    END IF;

    RETURN tenant_text::uuid;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.sync_slot_bounds()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.slot IS NULL THEN
        RAISE EXCEPTION USING
            ERRCODE = 'not_null_violation',
            MESSAGE = 'slot range must be provided';
    END IF;

    NEW.slot_start := lower(NEW.slot);
    NEW.slot_end := upper(NEW.slot);
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.attach_allocation_slot()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    slot_value timestamptz;
BEGIN
    SELECT a.slot_start
    INTO slot_value
    FROM appointments a
    WHERE a.tenant_id = NEW.tenant_id
      AND a.id = NEW.appointment_id;

    IF slot_value IS NULL THEN
        RAISE EXCEPTION USING
            ERRCODE = 'foreign_key_violation',
            MESSAGE = 'appointment reference not found for allocation';
    END IF;

    NEW.appointment_slot_start := slot_value;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.ensure_valid_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP <> 'UPDATE' THEN
        RETURN NEW;
    END IF;

    IF NEW.status = OLD.status THEN
        RETURN NEW;
    END IF;

    IF OLD.status = 'draft' AND NEW.status IN ('scheduled', 'cancelled') THEN
        RETURN NEW;
    ELSIF OLD.status = 'scheduled' AND NEW.status IN ('confirmed', 'cancelled', 'draft') THEN
        RETURN NEW;
    ELSIF OLD.status = 'confirmed' AND NEW.status IN ('checked_in', 'cancelled') THEN
        RETURN NEW;
    ELSIF OLD.status = 'checked_in' AND NEW.status IN ('completed', 'no_show') THEN
        RETURN NEW;
    ELSIF OLD.status = 'completed' AND NEW.status = 'completed' THEN
        RETURN NEW;
    ELSIF OLD.status = 'cancelled' AND NEW.status = 'cancelled' THEN
        RETURN NEW;
    ELSIF OLD.status = 'no_show' AND NEW.status = 'no_show' THEN
        RETURN NEW;
    ELSE
        RAISE EXCEPTION USING
            ERRCODE = 'check_violation',
            MESSAGE = format('invalid status transition from %s to %s', OLD.status, NEW.status);
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.ensure_appointments_partition_for(target timestamptz)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
    partition_start timestamptz := date_trunc('month', target);
    partition_end timestamptz := partition_start + INTERVAL '1 month';
    partition_name text := format('appointments_%s', to_char(partition_start, 'YYYYMM'));
    constraint_name text := partition_name || '_exclude_overlap';
BEGIN
    EXECUTE format(
        'CREATE TABLE IF NOT EXISTS %I PARTITION OF appointments FOR VALUES FROM (%L) TO (%L)',
        partition_name,
        partition_start,
        partition_end
    );

    BEGIN
        EXECUTE format(
            'ALTER TABLE %I ADD CONSTRAINT %I EXCLUDE USING gist (
                tenant_id WITH =,
                staff_id WITH =,
                slot WITH &&
            ) WHERE (status IN (''scheduled'', ''confirmed'', ''checked_in''))',
            partition_name,
            constraint_name
        );
    EXCEPTION
        WHEN duplicate_object THEN
            NULL;
    END;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.ensure_appointments_partition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
    PERFORM app_private.ensure_appointments_partition_for(lower(NEW.slot));
    RETURN NEW;
END;
$$;


CREATE OR REPLACE FUNCTION app_private.recalculate_product_stock()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    target_tenant uuid := COALESCE(NEW.tenant_id, OLD.tenant_id);
    target_product uuid := COALESCE(NEW.product_id, OLD.product_id);
    totals record;
BEGIN
    IF target_tenant IS NULL OR target_product IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT
        COALESCE(SUM(quantity_delta), 0) AS quantity_on_hand,
        COALESCE(SUM(reserved_delta), 0) AS quantity_reserved
    INTO totals
    FROM product_stock_movements m
    WHERE m.tenant_id = target_tenant
      AND m.product_id = target_product;

    INSERT INTO product_stock (tenant_id, product_id, quantity_on_hand, quantity_reserved, updated_at)
    VALUES (target_tenant, target_product, totals.quantity_on_hand, totals.quantity_reserved, now())
    ON CONFLICT (tenant_id, product_id)
    DO UPDATE
        SET quantity_on_hand = EXCLUDED.quantity_on_hand,
            quantity_reserved = EXCLUDED.quantity_reserved,
            updated_at = EXCLUDED.updated_at;

    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.bump_data_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    target uuid := COALESCE(NEW.tenant_id, OLD.tenant_id);
BEGIN
    IF target IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    UPDATE tenants t
    SET data_version = t.data_version + 1,
        updated_at = now()
    WHERE t.id = target;

    RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION app_private.audit_append()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
SET row_security = off
AS $$
DECLARE
    actor_id uuid := auth.uid();
    tenant uuid := COALESCE(NEW.tenant_id, OLD.tenant_id);
    before_doc jsonb := NULL;
    after_doc jsonb := NULL;
    entity_identifier text := NULL;
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        before_doc := to_jsonb(OLD);
    END IF;

    IF TG_OP IN ('UPDATE', 'INSERT') THEN
        after_doc := to_jsonb(NEW);
    END IF;

    IF TG_OP = 'DELETE' THEN
        BEGIN
            entity_identifier := OLD.id::text;
        EXCEPTION
            WHEN undefined_column THEN
                entity_identifier := NULL;
        END;
    ELSE
        BEGIN
            entity_identifier := NEW.id::text;
        EXCEPTION
            WHEN undefined_column THEN
                entity_identifier := NULL;
        END;
    END IF;

    INSERT INTO audit_log (
        tenant_id,
        actor_id,
        event_type,
        entity,
        entity_id,
        before,
        after,
        performed_at
    ) VALUES (
        tenant,
        actor_id,
        lower(TG_OP),
        TG_TABLE_NAME,
        entity_identifier,
        before_doc,
        after_doc,
        now()
    );

    RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION app_private.outbox_enqueue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
SET row_security = off
AS $$
DECLARE
    tenant uuid := COALESCE(NEW.tenant_id, OLD.tenant_id);
    aggregate_id uuid := NULL;
    payload jsonb;
BEGIN
    IF tenant IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    payload := jsonb_build_object(
        'op', TG_OP,
        'table', TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME,
        'record', CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END
    );

    BEGIN
        IF TG_OP = 'DELETE' THEN
            aggregate_id := OLD.id;
        ELSE
            aggregate_id := NEW.id;
        END IF;
    EXCEPTION
        WHEN undefined_column THEN
            aggregate_id := NULL;
    END;

    INSERT INTO outbox_events (
        tenant_id,
        aggregate,
        aggregate_id,
        event_type,
        payload
    ) VALUES (
        tenant,
        TG_TABLE_NAME,
        aggregate_id,
        lower(TG_OP),
        payload
    );

    RETURN COALESCE(NEW, OLD);
END;
$$;

DO $$
BEGIN
    CREATE TYPE appointment_status AS ENUM (
        'draft',
        'scheduled',
        'confirmed',
        'checked_in',
        'completed',
        'cancelled',
        'no_show'
    );
EXCEPTION
    WHEN duplicate_object THEN
        NULL;
END;
$$;

CREATE TABLE IF NOT EXISTS tenants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug text NOT NULL,
    name text NOT NULL,
    locale text DEFAULT 'de-CH' CHECK (locale ~ '^[a-z]{2}-[A-Z]{2}$'),
    data_version bigint NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    UNIQUE (slug)
);

CREATE TABLE IF NOT EXISTS tenant_members (
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id uuid NOT NULL,
    role text NOT NULL CHECK (role IN ('owner', 'manager', 'staff')),
    invited_at timestamptz NOT NULL DEFAULT now(),
    accepted_at timestamptz,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, user_id)
);

CREATE OR REPLACE FUNCTION app_private.is_tenant_member(target uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
SET row_security = off
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM tenant_members tm
        WHERE tm.tenant_id = target
          AND tm.user_id = auth.uid()
          AND tm.revoked_at IS NULL
    );
$$;

CREATE TABLE IF NOT EXISTS staff_profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id uuid,
    display_name text NOT NULL,
    color text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS resources (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name text NOT NULL,
    kind text NOT NULL,
    capacity integer NOT NULL DEFAULT 1 CHECK (capacity > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS appointment_services (
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    duration_minutes integer NOT NULL CHECK (duration_minutes > 0),
    price_cents integer NOT NULL CHECK (price_cents >= 0),
    currency char(3) NOT NULL DEFAULT 'CHF',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS appointments (
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    code text NOT NULL,
    customer_id uuid,
    staff_id uuid NOT NULL REFERENCES staff_profiles(id) ON DELETE RESTRICT,
    service_id uuid REFERENCES appointment_services(id) ON DELETE SET NULL,
    status appointment_status NOT NULL DEFAULT 'draft',
    slot tstzrange NOT NULL CHECK (lower(slot) < upper(slot)),
    slot_start timestamptz NOT NULL,
    slot_end timestamptz NOT NULL,
    CHECK (slot_start = lower(slot) AND slot_end = upper(slot)),
    price_cents integer NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
    currency char(3) NOT NULL DEFAULT 'CHF',
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    cancelled_at timestamptz,
    PRIMARY KEY (tenant_id, slot_start, id),
    UNIQUE (tenant_id, slot_start, code)
) PARTITION BY RANGE (slot_start);

DO $$
DECLARE
    current_month timestamptz := date_trunc('month', now()) - INTERVAL '6 months';
    finish_month timestamptz := date_trunc('month', now()) + INTERVAL '24 months';
BEGIN
    WHILE current_month <= finish_month LOOP
        PERFORM app_private.ensure_appointments_partition_for(current_month);
        current_month := current_month + INTERVAL '1 month';
    END LOOP;
END;
$$;

CREATE TABLE IF NOT EXISTS resource_allocations (
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    appointment_id uuid NOT NULL,
    appointment_slot_start timestamptz NOT NULL,
    resource_id uuid NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
    usage_range tstzrange NOT NULL CHECK (lower(usage_range) < upper(usage_range)),
    usage_start timestamptz GENERATED ALWAYS AS (lower(usage_range)) STORED,
    usage_end timestamptz GENERATED ALWAYS AS (upper(usage_range)) STORED,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, id),
    FOREIGN KEY (tenant_id, appointment_id, appointment_slot_start)
        REFERENCES appointments(tenant_id, id, slot_start)
        ON DELETE CASCADE
);

DO $$
BEGIN
    ALTER TABLE resource_allocations
        ADD CONSTRAINT resource_allocations_excl EXCLUDE USING gist (
            tenant_id WITH =,
            resource_id WITH =,
            usage_range WITH &&
        );
EXCEPTION
    WHEN duplicate_object THEN
        NULL;
END;
$$;

CREATE TABLE IF NOT EXISTS products (
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    sku text NOT NULL,
    name text NOT NULL,
    description text,
    price_cents integer NOT NULL CHECK (price_cents >= 0),
    currency char(3) NOT NULL DEFAULT 'CHF',
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, id),
    UNIQUE (tenant_id, sku)
);

CREATE TABLE IF NOT EXISTS product_stock (
    tenant_id uuid NOT NULL,
    product_id uuid NOT NULL,
    quantity_on_hand integer NOT NULL DEFAULT 0,
    quantity_reserved integer NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, product_id),
    FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS product_stock_movements (
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    product_id uuid NOT NULL,
    quantity_delta integer NOT NULL,
    reserved_delta integer NOT NULL DEFAULT 0,
    reason text NOT NULL,
    context jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    PRIMARY KEY (tenant_id, id),
    FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_log (
    id bigserial PRIMARY KEY,
    tenant_id uuid,
    actor_id uuid,
    event_type text NOT NULL,
    entity text NOT NULL,
    entity_id text,
    before jsonb,
    after jsonb,
    performed_at timestamptz NOT NULL DEFAULT now(),
    context jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS outbox_events (
    id bigserial PRIMARY KEY,
    tenant_id uuid NOT NULL,
    aggregate text NOT NULL,
    aggregate_id uuid,
    event_type text NOT NULL,
    payload jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_appointments_staff_slot ON appointments USING btree (staff_id, slot_start);
CREATE INDEX IF NOT EXISTS idx_resource_allocations_resource ON resource_allocations (resource_id, usage_start);
CREATE INDEX IF NOT EXISTS idx_product_stock_movements_product ON product_stock_movements (product_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_tenant_time ON audit_log (tenant_id, performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_outbox_events_tenant ON outbox_events (tenant_id, created_at);

DO $$
BEGIN
    CREATE TRIGGER tenants_touch_updated_at
        BEFORE UPDATE ON tenants
        FOR EACH ROW
        EXECUTE FUNCTION app_private.touch_updated_at();
EXCEPTION
    WHEN duplicate_object THEN
        NULL;
END;
$$;

DO $$
BEGIN
    CREATE TRIGGER tenant_members_touch_updated_at
        BEFORE UPDATE ON tenant_members
        FOR EACH ROW
        EXECUTE FUNCTION app_private.touch_updated_at();
EXCEPTION
    WHEN duplicate_object THEN
        NULL;
END;
$$;

DO $$
BEGIN
    CREATE TRIGGER staff_profiles_touch_updated_at
        BEFORE UPDATE ON staff_profiles
        FOR EACH ROW
        EXECUTE FUNCTION app_private.touch_updated_at();
EXCEPTION
    WHEN duplicate_object THEN
        NULL;
END;
$$;

DO $$
BEGIN
    CREATE TRIGGER resources_touch_updated_at
        BEFORE UPDATE ON resources
        FOR EACH ROW
        EXECUTE FUNCTION app_private.touch_updated_at();
EXCEPTION
    WHEN duplicate_object THEN
        NULL;
END;
$$;

DO $$
BEGIN
    CREATE TRIGGER appointment_services_touch_updated_at
        BEFORE UPDATE ON appointment_services
        FOR EACH ROW
        EXECUTE FUNCTION app_private.touch_updated_at();
EXCEPTION
    WHEN duplicate_object THEN
        NULL;
END;
$$;

DO $$
BEGIN
    CREATE TRIGGER appointments_sync_slot_bounds
        BEFORE INSERT OR UPDATE ON appointments
        FOR EACH ROW
        EXECUTE FUNCTION app_private.sync_slot_bounds();
EXCEPTION
    WHEN duplicate_object THEN
        NULL;
END;
$$;

DO $$
BEGIN
    CREATE TRIGGER appointments_valid_transition
        BEFORE UPDATE ON appointments
        FOR EACH ROW
        EXECUTE FUNCTION app_private.ensure_valid_transition();
EXCEPTION
    WHEN duplicate_object THEN
        NULL;
END;
$$;

DO $$
BEGIN
    CREATE TRIGGER appointments_touch_updated_at
        BEFORE UPDATE ON appointments
        FOR EACH ROW
        EXECUTE FUNCTION app_private.touch_updated_at();
EXCEPTION
    WHEN duplicate_object THEN
        NULL;
END;
$$;

DO $$
BEGIN
    CREATE TRIGGER appointments_audit
        AFTER INSERT OR UPDATE OR DELETE ON appointments
        FOR EACH ROW
        EXECUTE FUNCTION app_private.audit_append();
EXCEPTION
    WHEN duplicate_object THEN
        NULL;
END;
$$;

DO $$
BEGIN
    CREATE TRIGGER appointments_outbox
        AFTER INSERT OR UPDATE OR DELETE ON appointments
        FOR EACH ROW
        EXECUTE FUNCTION app_private.outbox_enqueue();
EXCEPTION
    WHEN duplicate_object THEN
        NULL;
END;
$$;

DO $$
BEGIN
    CREATE TRIGGER appointments_bump_version
        AFTER INSERT OR UPDATE OR DELETE ON appointments
        FOR EACH ROW
        EXECUTE FUNCTION app_private.bump_data_version();
EXCEPTION
    WHEN duplicate_object THEN
        NULL;
END;
$$;

DO $$
BEGIN
    CREATE TRIGGER resource_allocations_touch_updated_at
        BEFORE UPDATE ON resource_allocations
        FOR EACH ROW
        EXECUTE FUNCTION app_private.touch_updated_at();
EXCEPTION
    WHEN duplicate_object THEN
        NULL;
END;
$$;

DO $$
BEGIN
    CREATE TRIGGER resource_allocations_sync_slot
        BEFORE INSERT OR UPDATE ON resource_allocations
        FOR EACH ROW
        EXECUTE FUNCTION app_private.attach_allocation_slot();
EXCEPTION
    WHEN duplicate_object THEN
        NULL;
END;
$$;

DO $$
BEGIN
    CREATE TRIGGER resource_allocations_audit
        AFTER INSERT OR UPDATE OR DELETE ON resource_allocations
        FOR EACH ROW
        EXECUTE FUNCTION app_private.audit_append();
EXCEPTION
    WHEN duplicate_object THEN
        NULL;
END;
$$;

DO $$
BEGIN
    CREATE TRIGGER resource_allocations_outbox
        AFTER INSERT OR UPDATE OR DELETE ON resource_allocations
        FOR EACH ROW
        EXECUTE FUNCTION app_private.outbox_enqueue();
EXCEPTION
    WHEN duplicate_object THEN
        NULL;
END;
$$;

DO $$
BEGIN
    CREATE TRIGGER resource_allocations_bump_version
        AFTER INSERT OR UPDATE OR DELETE ON resource_allocations
        FOR EACH ROW
        EXECUTE FUNCTION app_private.bump_data_version();
EXCEPTION
    WHEN duplicate_object THEN
        NULL;
END;
$$;

DO $$
BEGIN
    CREATE TRIGGER products_touch_updated_at
        BEFORE UPDATE ON products
        FOR EACH ROW
        EXECUTE FUNCTION app_private.touch_updated_at();
EXCEPTION
    WHEN duplicate_object THEN
        NULL;
END;
$$;

DO $$
BEGIN
    CREATE TRIGGER products_audit
        AFTER INSERT OR UPDATE OR DELETE ON products
        FOR EACH ROW
        EXECUTE FUNCTION app_private.audit_append();
EXCEPTION
    WHEN duplicate_object THEN
        NULL;
END;
$$;

DO $$
BEGIN
    CREATE TRIGGER products_outbox
        AFTER INSERT OR UPDATE OR DELETE ON products
        FOR EACH ROW
        EXECUTE FUNCTION app_private.outbox_enqueue();
EXCEPTION
    WHEN duplicate_object THEN
        NULL;
END;
$$;

DO $$
BEGIN
    CREATE TRIGGER products_bump_version
        AFTER INSERT OR UPDATE OR DELETE ON products
        FOR EACH ROW
        EXECUTE FUNCTION app_private.bump_data_version();
EXCEPTION
    WHEN duplicate_object THEN
        NULL;
END;
$$;

DO $$
BEGIN
    CREATE TRIGGER product_stock_movements_audit
        AFTER INSERT OR UPDATE OR DELETE ON product_stock_movements
        FOR EACH ROW
        EXECUTE FUNCTION app_private.audit_append();
EXCEPTION
    WHEN duplicate_object THEN
        NULL;
END;
$$;

DO $$
BEGIN
    CREATE TRIGGER product_stock_movements_outbox
        AFTER INSERT OR UPDATE OR DELETE ON product_stock_movements
        FOR EACH ROW
        EXECUTE FUNCTION app_private.outbox_enqueue();
EXCEPTION
    WHEN duplicate_object THEN
        NULL;
END;
$$;

DO $$
BEGIN
    CREATE TRIGGER product_stock_movements_recalc
        AFTER INSERT OR UPDATE OR DELETE ON product_stock_movements
        FOR EACH ROW
        EXECUTE FUNCTION app_private.recalculate_product_stock();
EXCEPTION
    WHEN duplicate_object THEN
        NULL;
END;
$$;

DO $$
BEGIN
    CREATE TRIGGER product_stock_movements_bump_version
        AFTER INSERT OR UPDATE OR DELETE ON product_stock_movements
        FOR EACH ROW
        EXECUTE FUNCTION app_private.bump_data_version();
EXCEPTION
    WHEN duplicate_object THEN
        NULL;
END;
$$;

COMMENT ON TABLE tenants IS 'Salon tenants with data versioning for cache busting.';
COMMENT ON TABLE appointments IS 'Appointments are monthly partitioned and enforce conflict-free scheduling.';
COMMENT ON TABLE resource_allocations IS 'Resource reservations linked to appointments, protected by EXCLUDE constraints.';
COMMENT ON TABLE product_stock_movements IS 'Immutable ledger of product stock adjustments driving aggregate stock levels.';
COMMENT ON FUNCTION app_private.outbox_enqueue IS 'Stub outbox trigger inserting events for downstream processing.';
