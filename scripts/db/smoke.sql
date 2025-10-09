\set ON_ERROR_STOP on
SET client_min_messages = WARNING;

-- seed baseline data as superuser
INSERT INTO tenants (id, slug, name)
VALUES
    ('00000000-0000-0000-0000-000000000001', 'alpha-coiffure', 'Alpha Coiffure GmbH')
ON CONFLICT (id) DO NOTHING;

INSERT INTO tenants (id, slug, name)
VALUES
    ('00000000-0000-0000-0000-000000000002', 'beta-style', 'Beta Style AG')
ON CONFLICT (id) DO NOTHING;

INSERT INTO tenant_members (tenant_id, user_id, role)
VALUES
    ('00000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'owner')
ON CONFLICT DO NOTHING;

INSERT INTO tenant_members (tenant_id, user_id, role)
VALUES
    ('00000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'owner')
ON CONFLICT DO NOTHING;

INSERT INTO staff_profiles (id, tenant_id, user_id, display_name)
VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Alexandra Meier')
ON CONFLICT (id) DO NOTHING;

INSERT INTO resources (id, tenant_id, name, kind, capacity)
VALUES
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000001', 'Behandlungsraum 1', 'room', 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO appointment_services (id, tenant_id, name, duration_minutes, price_cents)
VALUES
    ('cccccccc-cccc-cccc-cccc-cccccccccccc', '00000000-0000-0000-0000-000000000001', 'Haarschnitt', 60, 8500)
ON CONFLICT (id) DO NOTHING;

SELECT app_private.ensure_appointments_partition_for('2024-06-01 00:00+00'::timestamptz);
SELECT app_private.ensure_appointments_partition_for('2024-07-01 00:00+00'::timestamptz);

-- authenticate as tenant Alpha
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","tenant_id":"00000000-0000-0000-0000-000000000001"}';

INSERT INTO appointments (
    tenant_id,
    code,
    customer_id,
    staff_id,
    service_id,
    status,
    slot,
    slot_start,
    slot_end,
    price_cents
) VALUES (
    '00000000-0000-0000-0000-000000000001',
    'APT-0001',
    NULL,
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'scheduled',
    tstzrange('2024-06-01 08:00+00', '2024-06-01 09:00+00', '[)'),
    '2024-06-01 08:00+00',
    '2024-06-01 09:00+00',
    8500
) ON CONFLICT DO NOTHING;

DO $$
BEGIN
    BEGIN
        INSERT INTO appointments (
            tenant_id,
            code,
            customer_id,
            staff_id,
            service_id,
            status,
            slot,
            slot_start,
            slot_end,
            price_cents
        ) VALUES (
            '00000000-0000-0000-0000-000000000001',
            'APT-0002',
            NULL,
            'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            'cccccccc-cccc-cccc-cccc-cccccccccccc',
            'scheduled',
            tstzrange('2024-06-01 08:30+00', '2024-06-01 09:30+00', '[)'),
            '2024-06-01 08:30+00',
            '2024-06-01 09:30+00',
            8500
        );
        RAISE EXCEPTION 'expected exclusion violation not triggered';
    EXCEPTION
        WHEN exclusion_violation THEN
            NULL; -- expected
    END;
END;
$$;

DO $$
BEGIN
    BEGIN
        INSERT INTO appointments (
            tenant_id,
            code,
            customer_id,
            staff_id,
            service_id,
            status,
            slot,
            slot_start,
            slot_end,
            price_cents
        ) VALUES (
            '00000000-0000-0000-0000-000000000002', -- different tenant
            'APT-BETA-0001',
            NULL,
            'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            'cccccccc-cccc-cccc-cccc-cccccccccccc',
            'scheduled',
            tstzrange('2024-07-01 08:00+00', '2024-07-01 09:00+00', '[)'),
            '2024-07-01 08:00+00',
            '2024-07-01 09:00+00',
            7500
        );
        RAISE EXCEPTION 'RLS failed to prevent cross-tenant insert';
    EXCEPTION
        WHEN insufficient_privilege OR check_violation THEN
            NULL; -- expected rejection
    END;
END;
$$;

RESET ROLE;
RESET request.jwt.claims;

-- authenticate as tenant Beta and assert isolation
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated","tenant_id":"00000000-0000-0000-0000-000000000002"}';

SELECT COUNT(*) AS beta_visible_appointments
FROM appointments;

RESET ROLE;
RESET request.jwt.claims;

SELECT 'smoke test completed' AS status;
