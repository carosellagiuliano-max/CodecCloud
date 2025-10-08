# AGENTS.md — Salon Platform (CH/EU)

## Mission
Produktionsreife Salon-Plattform (Netlify SSR/ISR/Edge + Supabase EU). Echter Produktionscode, keine Platzhalter/„TODOs“.

## Locale & Legal
UI: de-CH, fr-CH, it-CH, en-CH (next-intl) · TZ: Europe/Zurich · Orthografie: “ss” · Geld: Rappen/Cents als Integer (Banker’s Rounding).

## Commands (wird von Agents/Codex genutzt)
Install: `pnpm i`  
Check: `pnpm lint && pnpm typecheck && pnpm test`  
(optional) E2E: `pnpm e2e`

## Definition of Done
- Alle Checks grün (Lint/Types/Tests/E2E)
- Keine Platzhalter, vollständige Dateien
- i18n-Keys vollständig (Build bricht bei fehlenden Keys)
- PR mit kurzem Verify-Log

## Batches (Scope je Task)
1) README.md, .env.example, docs/architecture.mmd, docs/erd.mmd, docs/scale_migration.md  
2) SQL: Schema + RLS + Trigger (+ rollback/)  
3) Edge Functions + Outbox Worker + Tests  
4) Frontend: Admin/Portal/PWA/i18n  
5) Domain-Packages (pricing/availability/commissions/inventory/…)  
6) CI/CD, netlify.toml, E2E/Load/Chaos/a11y, RUNBOOK/SECURITY/PRIVACY/SLO

Du agierst als Senior Full-Stack Engineer & Compliance Lead (CH/EU). Auftrag: Produktionsreife Salon-Plattform (Netlify SSR/ISR/Edge + Supabase EU) mit maximaler Sicherheit, Robustheit, Performance, Compliance und erstklassigem Frontend-UX. Echter Produktionscode, keine Platzhalter/„TODOs“.

Ausgabeformat („Datei-Emitter“)

Für jede Datei exakt:
FILE: <pfad/Dateiname>

<vollständiger inhalt>


Grosse Outputs in Batches (siehe §60). Jede Datei vollständig, keine abgebrochenen Blöcke.

Sprachen & Lokales

Code & Doku: Englisch (präzise)

UI/i18n: de-CH, fr-CH, it-CH, en-CH (next-intl; Romansh optional später)

Schweiz-Konventionen: „ss“ statt „ß“, TZ: Europe/Zurich, Währung: Rappen/Cents (int), Banker’s Rounding konsistent

0) Betriebs-Modi & Scope-Strategie (MVP ↔ Scale)

MVP-Modus (Default): klassische Transaktionen, ohne ES/CQRS/Sagas; einfache Outbox + Cron; Appointments ab Tag 1 partitioniert; Realtime optional.

Scale-Modus (Flag FEATURE_SCALE=on): CQRS + Event Sourcing + Sagas, Snapshots, LISTEN/NOTIFY, Redis, inkrementelle MVs, Warteliste/Overbooking, erweiterte Observability.

Migrationspfad MVP→Scale: Backfill des event_store aus audit_log; Snapshots ab Erstaktivierung; Dokument /docs/scale_migration.md.

Dual-Implementierungen klar markieren; gemeinsame Interface-Schichten verwenden; Tests für beide Modi.

1) Non-Functional „Definition of Awesome“

Security: RLS überall; Admin-MFA + Step-Up (WebAuthn/TOTP); strikte CSP/HSTS; CSRF kombiniert (SameSite+Origin und Double-Submit); Secret-Mgmt & Rotation; JWT Key-Rotation (kid, Dual-Accept); Edge-Least-Privilege (keine globalen Service-Keys).
Reliability: EXCLUDE, Optimistic Locking (version), Lock-Hierarchie (appointment > payment > inventory > commission), Outbox+DLQ, Circuit-Breaker, Retries (expo+Jitter).
Performance: Schlüsselindizes; Appointments-Partition by date(lower(slot)); Redis Cache; inkrementelle MV-Erneuerung (Staging→Rename); N+1 eliminiert (Dataloader/Aggregation).
Compliance: DSG/DSGVO; OR 962 (10y); Double-Opt-In; zweckgebundene Verschlüsselung sensibler Felder (Allergien/Fotos) mit kürzeren Fristen; Lösch/Anonymisierungs-Konzept.
Operability: SLO/KPI-Dashboards; Sentry EU (PII-Scrub); OpenTelemetry; strukturierte Logs; PITR + Geo-Backups; DR-Plan (RTO ≤1h, RPO ≤24h) + wöchentlicher Drill.
DX: Monorepo; CI/CD; Seeds; Unit/Integration/E2E/Load/Chaos/Property; Lint/Typecheck; Contract-Tests; Renovate/Dependabot; gitleaks.
A11y & Web Vitals: Lighthouse/axe ≥95; LCP ≤2.5s, INP ≤200ms, CLS ≤0.1; p95 Budgets je Route (§36).

2) Frontend-Exzellenz (Speed & Beauty)

Next.js 15 (App Router), React 19, Tailwind v4, Design-Tokens (Spacing-4/8, Typo-Ramp, Radius-2xl, Soft-Shadows), shadcn/ui (Radix), TanStack Query, Zustand, next-themes, Framer Motion (dezente Micro-Interactions), RHF + Zod.
UX: Optimistic Updates (+Revert bei 409), Skeletons/Suspense, Virtualized Lists, Tastatur-Support, Fokus-Ringe, Live-Regionen (Kalender DnD), reduced-motion.
Assets: next/image (AVIF/WebP, priority Above-the-Fold), CDN-Caching, OG-Images.
i18n-QA: fehlende Keys brechen Build; Pluralregeln; de-CH Orthografie.

3) Ziel-Architektur

Frontend (SSR/ISR/Edge, PWA) ↔ Edge Functions (Deno/TS) ↔ Supabase (Postgres 15+, Auth, Storage, pg_cron, Realtime).
Domain-Layer als Packages (core, pricing, availability, commissions, inventory, sagas) mit DI-Container (keine zirkulären Dependencies).
Payments: Stripe online; SumUp in-person (HMAC + IP-Allowlist + Timestamp-Window 5 Min + Server-Verify /transactions/{id}).
Mail: Resend/Postmark EU (Bounces/Complaints → Suppression).
Realtime: Supabase Realtime (LISTEN/NOTIFY) für Kalender/Bookings/Orders.
Observability: Sentry EU + OTel.

4) Repo-Layout (Monorepo)

/apps/web • /packages/domain • /packages/ui • /packages/types

/docs (Architektur, RUNBOOK, SECURITY, PRIVACY, SLO/KPIs, POSTMORTEM_TEMPLATE.md, scale_migration.md)

/.supabase/migrations (+ /rollback für Gegenmigrationen)

/functions (Edge Endpoints, Worker, Jobs) • /policies • /cron • /scripts

/.github/workflows • netlify.toml • .env.example • README.md

5) ENV (Boot-Validation, Zod)

Supabase, Stripe, SumUp (HMAC, IP-Allowlist, TIMESTAMP_WINDOW), Resend/Postmark, Sentry EU, TZ, VAT & VAT-History, Company, ISR/Outbox, Redis, i18n, KMS, Booking-Policies, Feature-Flags (FEATURE_SCALE, FEATURE_REALTIME, FEATURE_WAITLIST …), AUTH/CORS/COOKIE Flags, JWT keys (multi, kid), Mail DNS (SPF/DKIM/DMARC).
→ packages/types/env.ts validiert fail-fast.

6) Datenmodell (vollständig)

Kern: profiles, staff_profiles, staff_availability, staff_time_off, services, appointments (tstzrange, partitioniert), categories, products(+variants), product_stock, orders(+items), vouchers, stock_reservations, idempotency_keys, audit_log (partitioniert, write-once), cms_content.
Ressourcen/Allokation: resources, resource_units; resource_allocations(appointment_id, resource_id, usage_range tstzrange, EXCLUDE … WHERE deleted_at IS NULL).
Treatment/Verbrauch: customer_treatment_history (allergies ENCRYPTED, color_formula jsonb, photos jsonb), treatment_material_usage.
Inventar: stock_locations, product_lots, stock_movements (atomar), stock_adjustments (Korrekturen/Retouren mit Grund); Trigger recalculate_product_stock(); negative Bestände verboten, Adjustments erzwingen.
Preise/Steuern: price_history(scope, ref_id, price_cents, vat_rate, effective_from/to), vat_history; Orders/Segments snappen beides.
Event Sourcing (Scale): event_store, domain_events PARTITIONED, event_snapshots(aggregate_id, version, state), domain_events_dlq; snapshotThreshold=100, Rehydrierung SNAPSHOT_FIRST→tail.
Provisionen: staff_commissions, commission_rules(rule_type, timing immediate|payment|period_end, clawback_policy, priority); tips separat.
Consent & Risk: consents, customer_risk(no_show_count, blacklist_until).
Tenancy (optional): tenant_id überall + RLS.
Idempotency: idempotency_keys(unique(key, tenant_id), status, response_hash, expires_at) + TTL-Job.
Daten-Versionierung: data_versions(entity, tenant_id, version bigint) → versionierte Cache-Keys & ISR-Tagging.
Suche: TRGM/FTS Indizes auf customers(name/email/phone), products(name/sku/ean); ts_rank_cd Ranking.

7) RLS & Edge-Sicherheit

Keine globalen Service-Keys.

User-Flows: Supabase JWT des Users (RLS greift).

Backoffice/Webhooks: SECURITY DEFINER Functions mit expliziten Claims-Checks; dedizierte DB-Rollen je Use-Case.

RLS auf allen Tabellen (auch event_store/audit_log tenant-scoped).

8) Auth & Onboarding Flows (explicit)

Public: Sign-up (Double-Opt-In), Sign-in, Forgot/Reset Password, Email-Change-Confirm, Logout.
Staff/Admin Onboarding: Admin-Invite → E-Mail mit Token → Passwort setzen → MFA erzwingen → Rolle zuweisen.
Session-Mgmt: Cookies Secure; HttpOnly; SameSite=Lax; Refresh-Rotation; Force-Logout pro Gerät; Session-Liste im Portal; Invalidation bei PW-/Rollen-Change.
Social Login (optional per Tenant).
Routes: /auth/sign-up, /auth/sign-in, /auth/forgot, /auth/reset, /auth/invite.

9) Notifications (E-Mail, SMS, Web-Push)

E-Mail: Transaktional (Buchung, Zahlung, Refund, Storno, Erinnerungen).

SMS (Twilio/Schweizer Gateway): Opt-in/Opt-out, Zeitfenster (kein Nacht-Spam), Templates je Sprache, DSG/DSGVO-Konformität.

Web-Push (PWA): Reminders, Status-Änderungen; Permission respektieren.

No-Show-Reduktion: T-24h E-Mail + T-3h SMS (konfigurierbar).

Tenant-Weit toggelbar; Kostenkontrolle.

10) Realtime & Kollaboration

Supabase Realtime (LISTEN/NOTIFY) für: Admin-Kalender, Bookings/Orders-Listen, Lager-Ansichten.
Frontends Live-Aktualisierung ohne Reload; Konflikte visuell markieren; „Someone else is editing…“ Indikator.

11) Suche & Filter (Admin + Public)

Admin: Volltext/Filter für Customers, Bookings, Orders, Products (Status, Zeiträume, Staff, Kategorien).
Public Shop: Suchfeld + Facetten.
FTS/TRGM + geeignete Indizes; Debounce + Cancel; Serverseitiges Ranking.

12) Externe Kalender (2-Way, optional)

Outbound: Staff & Customer ICS-Feeds (tokenisiert, revokabel).
Inbound (optional): Google/Outlook Busy-Slots → staff_time_off Import; Hintergrund-Sync Job; Privacy-Hinweis.
Dokumentiere Limitierungen; MVP nur Outbound.

13) Pricing-Engine (SSOT)

Grundpreis, Staff-Multiplikator, Steps/Add-ons, Peak/Weekend, Last-Minute, Segmente, Voucher, VAT, Stack-Limit=2, minPrice ≥0, maxDiscount ≤90%, keine negativen Preise; CHF/EUR (optional). Property-Tests inkl. 0.01-CHF Edge-Cases.

14) FSM mit DB-Durchsetzung

Appointments, Orders, Segments, Payments – erlaubte Pfade; Trigger ensure_valid_transition.
Commission-Timing via commission_rules (immediate|payment|period_end), Clawback bei Refund/No-Show; Tips separat.

15) Availability & Scheduling

UTC in DB, UI/ICS Europe/Zurich, Slots [start,end).
Mehrschichtig: EXCLUDE, Optimistic Locking (version), pg_advisory_xact_lock (Order: appointment>payment>inventory>commission), SELECT … FOR UPDATE SKIP LOCKED.
Pufferzeiten explizit (Slot-Erweiterung oder Shadow-Resource).
Overbooking & Warteliste (optional): Quote % per Zeit/Staff; Auto-Notify; No-Show-Score beeinflusst Quote/Deposits.
Mitternacht & Reschedule über DST getestet.

16) Event Sourcing & Outbox (Scale)

LISTEN/NOTIFY auf domain_events → Worker sofort; Fallback pg_cron (*/10s).
Snapshots ab 100 Events/Aggregate; Rehydrierung snapshot→tail; Outbox FIFO per aggregate_id; Backoff+Jitter; DLQ+Alarm.

17) Edge Functions — Contracts & Safety

Zod Schemas (Req/Res) → OpenAPI + typed client (Docs unter /api/docs).
RBAC via JWT-Claims; Rate-Limit (Redis), In-Memory Fallback bei Redis-Down; Idempotency-Header + idempotency_keys.
TX: read-lock → write → outbox enqueue → commit.
HTTP: 401/403/409/422/429/5xx; X-Request-ID; keine sensiblen Details.
Endpoints (min.):
bookings.get-availability • bookings.create • bookings.reschedule • bookings.cancel •
orders.create/orders.fulfill • payments.stripe.create-checkout/webhook •
payments.sumup.create/webhook (HMAC, IP, Timestamp ≤5 Min, Server-Verify) •
invoices.generate (ISO 20022 QR) • emails.send • calendar.ics-feed •
outbox.worker (listen + cron fallback) • scheduler.fallback.

18) Zero-Logic-Bugs Hardening

Race-free Booking; DST (Frühjahr 02:00–02:59 keine Slots→422; Herbst doppelte Stunde via UTC); Provisionen net/gross, anteilig; Multi-Step Storno + Refund + Commission-Recalc; Cancellation-Policies (Scope global/service/staff; Kalender/ Werktage; Kantons-Feiertage; Teilstorno; Force-Majeure) – alles mit Tests.

19) Compliance (CH/EU) inkl. Kasse & Arbeitszeit

Impressum/UWG; DSG/DSGVO; ROPA; DPAs (EU/EFTA); sensible Daten zweckgebunden mit kürzeren Fristen; Break-Glass (zeitlich, begründet, audit).
Arbeitszeit (optional): Check-In/Out, Pausen, Überstunden, Export.
Kassenjournal (tamper-evident): Beleg-Hash-Chain; unveränderbares Archiv (Partition); Prüf-Export.
Incident-Response (72h EU, EDÖB bei hohem Risiko); DPIA bei Gesundheitsbezug/Fotos.

20) Observability, KPIs & SLOs

Sentry EU + OTel Tracing (Front & Back).
KPIs: Conversion, Abandonment, Utilization, CLV, No-Show, AHT.
SLOs: Uptime 99.9 %, Booking p95 < 600 ms, Webhook Lag < 30 s.
Third-Party Health: Stripe/SumUp/Mail/Redis Status & Fehlerraten im Admin-Dashboard; Alerts.

21) CI/CD, Safe Migrations, Rollback & DR

CI: ESLint, tsc, Unit/Integration/Contract/E2E, Lighthouse, a11y, SCA, gitleaks.
Safe Migrations: expand→migrate→contract; Feature-Flags; Canary; Rollback-Skripte in /.supabase/migrations/rollback/.
PITR (wenn verfügbar); Geo-Redundanz; Backups verschlüsselt (KMS); wöchentlicher Restore-Drill (DB→Storage→Functions→DNS).

22) Security-Header, CORS, Cookies

CSP minimal-offen (Stripe, SumUp, Supabase, Sentry), HSTS preload, Referrer-Policy, X-Frame-Options DENY, restriktive Permissions-Policy.
CORS: nur Tenant-Hosts; Vary: Origin; Preflight-Cache.
Cookies: Secure; HttpOnly; SameSite=Lax; Refresh-Rotation; Force-Logout/Session-Invalidation.

23) Webhook-Robustheit

Out-of-order tolerant; Replay-Window begrenzt; provider_event_id + Payload-Hash; Version-Mismatch pro Provider; Idempotenz und Sequenzsicherung.

24) Cache-Invalidierung (race-frei)

Versionierte Keys via data_versions: team:${tenantId}:v${dataVersion}.
Jede relevante Änderung bump’t Version (Trigger/Outbox). ISR Tag-Revalidate plus Key-Version → keine Stale-Races.

25) Admin Backoffice – Module

Dashboard • Calendar (DnD, 409 bei Konflikt) • Bookings (Teil-Storno, Fees, Belege) •
Services (Steps, Puffer, Ressourcen, Price-History) • Staff (RBAC, Capabilities, Time-Off, Zertifikate, Commissions, ICS-Token Reset) •
Customers (Consents, Risk, Historie, DSG/DSGVO-Export JSON+PDF, Duplicate-Merge, Anonymisierung) •
Shop (Katalog/Bestand/Promos) • Orders (QR-Rechnung, Teil/Voll-Refunds, Versand/Abholung/Retouren) •
Marketing (Voucher/Promos, Mailchimp Sync, UTM) • Reports (Umsatz/Buchungen/Provisionen/VAT/Fibu-Export) •
CMS (Team, Legal, Statisch, Mediathek) • Settings (Firma/Branding, Sprachen, VAT, Policies, Payments, E-Mail-Templates, Consent-Texte, Cookie-Banner, Feature-Flags, Integrationen, Security (MFA erzwingen)) •
Audit (Audit-Logs, Outbox/DLQ, Webhook-Lag, Third-Party Health, SLO-Dashboards, Sessions, API-Keys nur serverseitig).
Abnahme: Alle Inhalte ohne DB-Zugriff pflegbar; jede Änderung → ISR & data_version++; kritische Aktionen audit-geloggt.

26) Kundenportal – Module

/portal Übersicht • bookings (ICS, Reschedule/Cancel Policy, Fees/Deposits) • payments (Stripe Checkout, QR-Belege) •
orders (Status/Tracking/Retouren) • vouchers • profile (Sprache, Notifications, SMS/Push Opt-in, Consents, Geräte/Sessions, optional 2FA, Datenexport JSON+PDF inkl. Rechtsgrundlagen, Lösch/Anonymisierung) •
history (Behandlungshistorie; sensible Fotos nur mit Zusatz-Consent) • support (Rechtsanfragen mit Frist-Tracking).
Abnahme: 403/422 sauber (kein IDOR), Self-Service vollständig.

27) Shop Admin – Vollumfängliche Pflege

Katalog/Varianten/SEO/Bundles • Preise (Segmente, zeitgesteuert, VAT je Produkt, Snapshots) •
Bestand (Lagerorte, Lots, Mindestbestände, TTL-Reservierungen, atomare stock_movements, Adjustments mit Grund) •
Promotions & Gutscheine (Regeln, Stack-Limit, Prioritäten, Store-Credit) • Fulfillment (CH/EU, Abholung, Etiketten) •
Steuern/Abrechnung (VAT, QR-Rechnung, Fibu-Export).
Abnahme: Lifecycle (Entwurf→Live→Archiv) ohne Dev; auditierbar/versioniert.

28) Kalender & Workforce

Schichten (wiederkehrend), Sperrzeiten, Ressourcenbindung, Kapazitäten, Live-Konflikte, EXCLUDE, Bulk-Templates, CH/Kanton-Feiertage (Quelle+Refresh), ICS-Feeds (Token, revokabel). DST wie §18.

29) Trust & Safety / Abuse

Rate-Limits (login, bookings.create, vouchers.apply) IP+User+Fingerprint; ab Schwelle CAPTCHA (Turnstile/hCaptcha).
Voucher-Bruteforce-Schutz; No-Show-Score → höhere Deposits/Prepayment; Auto-Blacklist bis Datum. Abuse-Melde-Flow.

30) Reviews & Feedback (optional)

Nach completed Appointment: E-Mail/Portal Feedback, Sterne/Kommentar (moderiert), interne Sicht für Qualität.

31) Routen (Mindestsatz)

Öffentlich: /, /booking, /services, /team, /shop, /shop/[slug], /cart, /checkout, /legal/impressum, /legal/agb, /legal/datenschutz
Auth: /auth/sign-up, /auth/sign-in, /auth/forgot, /auth/reset, /auth/invite
Portal: /portal, /portal/bookings, /portal/orders, /portal/payments, /portal/vouchers, /portal/profile, /portal/history, /portal/support
Admin: /admin/dashboard, /admin/calendar, /admin/bookings, /admin/services, /admin/staff, /admin/customers, /admin/shop, /admin/orders, /admin/marketing, /admin/reports, /admin/cms, /admin/settings, /admin/audit

32) Security-Header & netlify.toml

Strikte CSP/Headers, HSTS preload, Referrer-Policy, X-Frame-Options DENY, restriktive Permissions-Policy.
Edge-Mapping; Scheduled Fallback; Redirects/ISR; tenant-scoped Cache-Keys.

33) SEO/OG/PWA

Sitemaps (i18n), robots, hreflang, JSON-LD (Organization, Product, FAQ), Open-Graph-Tags (Bilder pro Seite), Favicon set, PWA manifest + Icons/Splash, Offline-Fallback.
Caching-Strategien: static stale-while-revalidate, APIs network-first mit Offline-Hinweis.

34) Mail-DNS

SPF, DKIM, DMARC (reject, rua). Bounces/Complaints → Suppression; UI-Hinweise bei unzustellbar.

35) JWT & Key-Rotation

Mehrere JWT-Keys mit kid; Zero-Downtime Rotation (Dual-Accept-Window); Secrets im KMS; Notfall-Rotation-Runbook.

36) A11y & Performance-Budgets

a11y ≥95 (axe/Lighthouse), keine Fokusfallen, Kontrast ≥4.5, vollständige ARIA in de-CH.
Budgets: get-availability p95 ≤300 ms, booking.create p95 ≤600 ms, Webhooks p95 ≤300 ms; LCP ≤2.5s, INP ≤200ms, CLS ≤0.1.

37) Redis & Degradation

Upstash EU (Multi-AZ). Namespaces: availability, rate, cache.
Fallback: In-Memory RateLimiter; Lese-Caches ignorieren; kostenintensive Endpunkte 503 statt inkonsistent; Last-Minute-Rabatte aus.

38) LISTEN/NOTIFY & Materialized Views

Outbox: NOTIFY triggert Worker sofort; Fallback Cron.
MVs: Staging→Index→Rename (keine Long-Locks); REFRESH CONCURRENTLY nur im MVP.

39) SumUp & Stripe – Sicherheit

SumUp Webhook: HMAC + IP + Timestamp ≤5 Min + Server-Verify; dedupe via provider_event_id.
Stripe: Signatur-Check, event.id Dedupe, idempotent; out-of-order tolerant.

40) Arbeitszeit-Erfassung (optional)

Check-In/Out, Pausen, Überstunden; RLS per staff_id; Export; Hinweis im Portal (DSG/DSGVO).

41) Kassenjournal (tamper-evident)

Beleg-Hash-Chain; read-only Archiv-Partition; signierter Prüf-Export. QR-Bills aus §17.

42) Break-Glass (sensible Daten)

Zeitlich begrenzte Notfall-Freigabe (Step-Up, Begründung, Dauer), separater Audit-Stream, Auto-Revoke.

43) Telefon/Adresse (CH/EU)

libphonenumber, Kantonsliste, PLZ-Validierung, mehrsprachige Adressformate.

44) Developer-Hygiene

tsconfig strict; ESLint/Prettier; Husky+lint-staged; commitlint (Conventional Commits); pnpm-lock; SQL-Formatter; Renovate/Dependabot; gitleaks.

45) Tracing & Metrics

OTel SDK (Next server + Functions), Trace-IDs in Logs, Sampling; Dashboards für p95-Budgets; Frontend Web-Vitals Reports.

46) Migration Lifecycle

Expand→migrate→contract; Rollback-Skripte; Reindex/Analyze Jobs; Canary-Gate; MVP→Scale Backfill dokumentiert.

47) L10n-QA & Content

i18n-Lint (fehlende Keys → Build-Fail), Screenshot-Diffs pro Sprache; Datums/Zeit/Währung korrekt; E-Mail-Templates in 4 Sprachen (fallback en-CH).

48) Frontend-Details die „schön laufen“

Prefetch on hover; Query-Batching; Error Boundaries + Retry UI; DnD-Kalender mit Live-Regionen; micro-Interactions dezent; konsistente Spacing/Typo.

49) Business-Regeln – Spezialfälle

Overbooking-Quote; Warteliste FIFO; Staff krank → Umbuchungs-Kaskade & Gebührenbefreiung;
Pricing Kollisionen: Stack-Limit, Min-Preis 0, keine negativen Preise;
Voucher+Promo Prioritäten, keine Doppelabzüge.

50) Reviews & Qualität (optional)

Post-Appointment Feedback; Sterne/Kommentar; Moderation; Reporting.

51) Third-Party Monitoring

Stripe/SumUp/Mail/Redis Ping & Fehlerraten; Admin-Badge „degraded“; Alert-Routing (ChatOps → On-Call).

52) API-Dokumentation

OpenAPI aus Zod generiert; /api/docs (Redoc/Swagger); Versionierung; Beispiele; Auth-Hinweise.

53) File-Uploads Sicherheit

MIME-/Magic-Type-Prüfung; AV-Scan (z. B. ClamAV/Service); Quarantäne + freigeben; nur signed Reads; EXIF-Strip für Fotos.

54) GraphQL (optional, später)

Bei API-Konsumenten/Integrationen GraphQL-Gateway mit RBAC; jetzt nicht Teil MVP.

55) Tests (breit & tief)

Unit (Pricing, DST, ICS, Commission, Policies) • Integration (RLS, FSM, EXCLUDE/Race, stock_movements+Trigger, Refunds) •
E2E (Playwright): Booking→Pay→Mail, Reschedule 409, Storno-Fee, SumUp Webhook-Sim, 100 parallele Buchungen •
Load (k6/Artillery): Booking & Event-Processing • Chaos: Stripe/Redis/Supabase down (Degradation) •
Contract: FE↔Functions (OpenAPI pinned), Stripe/SumUp Payload-Versionen •
Property-Based: Rounding, Slot-Kanten, FSM •
Security: OWASP ZAP, Headers, SQLi/XSS/IDOR, ASVS •
A11y: Admin & Portal axe ≥95 + Screenreader-Manuelltests (Kalender/Booking).
Mussfälle: 100× same slot → 1 Erfolg/99×409 • Herbst zwei 02:30 • Partial Refund Step 3 • Webhook Replay idempotent • Redis-Down → In-Memory RateLimit • Cache-Versionen race-frei • Offline/PWA Fallback-Seiten.

56) High-Availability & Offline

DB-Failover (Supabase down): Frontend zeigt freundlichen Read-Only-Hinweis; Admin-kritische Aktionen geblockt; Telemetrie erfasst.
PWA-Offline: Buchungen offline deaktiviert, aber Ansicht von bestehenden Terminen/Bestellungen möglich; Sync bei Reconnect.

57) Content & Legal Pages

content/legal/impressum.{de-ch,fr-ch,it-ch}.md, agb…, datenschutz… – SSR/ISR, versioniert.

58) Abnahme-Gates (harte Blocker)

ENV grün • Migrations-Smoke ok • Build/Tests grün • Stripe/SumUp Flows ok • FSM-Trigger aktiv • Outbox DLQ+Alarme •
N+1 eliminiert • Security-Header live • Admin-MFA/Step-Up enforced • Legal lokalisiert • DR-Drill protokolliert •
SLO-Dashboards live • Web-Vitals im Budget • Third-Party Health sichtbar • OpenAPI /api/docs live.

59) Orchestrierung der Ausgabe (Batches)

1: README.md, .env.example, docs/architecture.mmd, docs/cqrs.mmd, docs/erd.mmd, docs/scale_migration.md
2: SQL: Schema, RLS, Indizes, Partition, Trigger (inkl. stock consistency), Policies, rollback/, pg_cron, Seeds
3: Edge Functions: Endpoints, Outbox Worker (LISTEN/NOTIFY + Fallback), Jobs, Tests
4: Frontend: Pages, Admin Backoffice (Team-Editor), Customer Portal, PWA, i18n, Kalender, Design-Tokens
5: Domain Packages: pricing, availability, commissions, inventory, sagas (DI), UI, Types (Zod/OpenAPI)
6: CI/CD Workflows, netlify.toml, Tests (E2E/Load/Chaos/Contract/A11y), Docs (RUNBOOK, SECURITY, PRIVACY, DEPLOYMENT, SLO/KPIs)

60) Abnahme-Checkliste (Ops/Sec/UX)

 Outbox Runner (NOTIFY + Cron) aktiv; DLQ-Alarme getestet

 Redis Provider & In-Memory Fallback; Redis-Down GameDay bestanden

 Host→Tenant Mapping & tenant-scoped Cache-Keys verifiziert

 Step-Up greift (Refund/PII/API-Keys); Force-Logout funktioniert

 Idempotency-Policy enforced (Server-Validierung)

 VAT/QR-Rechnung Snapshot korrekt; Kassen-Hash-Chain aktiv

 A11y ≥95 & Core Web Vitals eingehalten

 Safe-Migrations + Rollback-Skripte geprüft; PITR/Restore ok

 OpenAPI /api/docs erreichbar & aktuell

 SMS/Push konfigurierbar, rechtlich sauber

 Realtime-Ansichten (Kalender/Listen) aktualisieren ohne Reload

 Offline-Fallback (PWA) & freundliche Read-Only-Fehler bei Ausfällen
