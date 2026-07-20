-- NIBBS Settlement Auditor schema (Neon / Postgres).
-- Shared `neondb` instance; all tables are prefixed `nibbs_` to avoid colliding
-- with other apps on the same database. Apply with:  npm run db:push
--
-- Idempotent: every statement is `if not exists` / `on conflict do nothing`, so
-- re-running is safe. gen_random_uuid() needs pgcrypto (built in on Neon).

-- Analyst / admin accounts.
create table if not exists nibbs_users (
  id                    uuid primary key default gen_random_uuid(),
  first_name            text not null,
  last_name             text not null,
  email                 text not null unique,        -- stored lower-cased
  password_hash         text not null,
  role                  text not null default 'analyst'
                        check (role in ('admin', 'analyst')),
  must_change_password  boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Server-side sessions. The cookie carries a raw random token; only its
-- SHA-256 is stored here, so a DB leak cannot be replayed as a live session.
create table if not exists nibbs_sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references nibbs_users(id) on delete cascade,
  token_hash  text not null unique,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);

create index if not exists nibbs_sessions_token_idx on nibbs_sessions (token_hash);
create index if not exists nibbs_sessions_expiry_idx on nibbs_sessions (expires_at);

-- Master bank list + posted collateral (the reference data the uploaded
-- HTML/TXT files do not carry). `code` is the 10-digit NIBBS settlement code.
create table if not exists nibbs_banks (
  code        text primary key,
  name        text not null,
  collateral  bigint not null default 0,
  updated_at  timestamptz not null default now()
);

-- Seed the 24 defaults so a fresh database matches the app's built-in list.
-- `on conflict do nothing` keeps any operator edits intact on re-run.
insert into nibbs_banks (code, name, collateral) values
  ('4000470158', 'Access Bank plc', 11950000000),
  ('4000460155', 'ECOBANK', 1000000000),
  ('4010160155', 'Fidelity Bank', 1200000000),
  ('4010100137', 'First City Monument Bank Plc', 1220000000),
  ('4000070135', 'FIRSTBANK', 2000000000),
  ('4000015103', 'GLOBUS BANK LIMITED', 0),
  ('4000560185', 'Guaranty Trust Bank PLC', 0),
  ('4000015301', 'Jaiz Bank', 600000000),
  ('4010270188', 'Keystone Bank', 0),
  ('4000015804', 'MoMo PSB', 1000000000),
  ('4000015104', 'Parallex Bank Limited', 0),
  ('4010350115', 'POLARIS BANK LIMITED', 5001000000),
  ('4000015105', 'Premium Trust Bank Ltd', 0),
  ('4000015101', 'PROVIDUS Bank', 1500000000),
  ('4000008106', 'Signature Bank Limited', 0),
  ('4010250182', 'STANBIC IBTC Bank', 94000000),
  ('4010030116', 'Sterling Bank', 0),
  ('4000015100', 'SUNTRUST BANK NIGERIA LIMITED', 0),
  ('4000008302', 'TAJ BANK LIMITED', 0),
  ('4000090141', 'Union Bank of Nigeria', 0),
  ('4000120150', 'United Bank for Africa', 1000000000),
  ('4000410140', 'Unity Bank PLC', 3000000000),
  ('4000020120', 'WEMA', 25000000),
  ('4000540179', 'Zenith Bank Plc.', 50000000)
on conflict (code) do nothing;
