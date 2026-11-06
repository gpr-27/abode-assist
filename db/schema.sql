-- Abode Assist schema (PostgreSQL 15+). Idempotent-ish: run on an empty database.
-- All timestamps are timestamptz; the UI renders them in Asia/Kolkata.

-- Requires pgcrypto and pg_trgm (on Supabase both live in the `extensions` schema).
-- Tables live in the `app` schema, owned by the app's own login role, so they are
-- never exposed through Supabase's public REST API.
set search_path = app, extensions;

-- ───────────────────────── users & auth ─────────────────────────
create type user_role as enum ('buyer', 'executive', 'head');

create table users (
  id            uuid primary key default gen_random_uuid(),
  role          user_role not null,
  name          text not null check (length(name) between 1 and 120),
  email         text unique check (email = lower(email)),
  phone         text unique,                       -- E.164, buyers sign in by phone OTP
  password_hash text,                              -- staff only
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  check (role = 'buyer' or (email is not null and password_hash is not null))
);

-- One-time codes for buyer phone login. Only a hash is stored.
create table otp_codes (
  id         uuid primary key default gen_random_uuid(),
  phone      text not null,
  code_hash  text not null,
  attempts   int  not null default 0,
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);
create index on otp_codes (phone, created_at desc);

-- ───────────────────────── projects & fact sheet ─────────────────────────
create table projects (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  name        text not null,
  rera_no     text not null,                      -- shown on every promotional message
  locality    text not null,
  address     text not null,
  map_url     text not null,
  hero_note   text not null default '',
  created_at  timestamptz not null default now()
);

-- The sales head's fact sheet. The assistant may only state what is in here.
create table facts (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid references projects(id) on delete cascade,  -- null = applies to all projects
  topic       text not null check (length(topic) between 2 and 80),
  answer      text not null check (length(answer) between 2 and 1200),
  updated_by  uuid references users(id),
  updated_at  timestamptz not null default now()
);
create index on facts (project_id);

-- Which executives sell which project (used for handoff assignment).
create table project_executives (
  project_id uuid references projects(id) on delete cascade,
  user_id    uuid references users(id) on delete cascade,
  primary key (project_id, user_id)
);

-- ───────────────────────── leads ─────────────────────────
create type lead_source as enum ('portal', 'social', 'website', 'hoarding', 'chat');
create type lead_status as enum ('new', 'engaged', 'handed_off', 'visit_booked', 'visited', 'lost');

create sequence lead_code_seq start 58230;

create table leads (
  id                uuid primary key default gen_random_uuid(),
  code              text unique not null default 'LD-' || nextval('lead_code_seq'),
  name              text not null check (length(name) between 1 and 120),
  phone             text,                          -- E.164
  email             text check (email = lower(email)),
  project_id        uuid references projects(id),
  wants             text,                          -- '2 BHK' / '3 BHK'
  budget            text,
  timeline          text,
  language          text not null default 'en' check (language in ('en', 'hi', 'gu')),
  status            lead_status not null default 'new',
  assigned_to       uuid references users(id),
  buyer_user_id     uuid references users(id),
  consent_at        timestamptz,                   -- DPDP: contact only with consent
  opted_out_at      timestamptz,                   -- DPDP: honour opt-outs
  optout_token      text unique not null default encode(gen_random_bytes(12), 'hex'),
  first_response_at timestamptz,
  summary           text,                          -- AI handoff summary
  duplicate_hint    uuid references leads(id),     -- possible duplicate, needs a human
  created_at        timestamptz not null default now(),
  check (phone is not null or email is not null)
);
-- Exact duplicates are impossible: one lead per phone, one per email.
create unique index leads_phone_uniq on leads (phone) where phone is not null;
create unique index leads_email_uniq on leads (email) where email is not null;
create index leads_name_trgm on leads using gin (name gin_trgm_ops);
create index on leads (assigned_to);
create index on leads (created_at desc);

-- Every time a lead reaches us from a source. One lead, many source tags.
create table lead_touches (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references leads(id) on delete cascade,
  source     lead_source not null,
  note       text,
  created_at timestamptz not null default now()
);
create index on lead_touches (lead_id);
create index on lead_touches (source, created_at);

-- Monthly spend per source, for cost per lead / cost per visit.
create table source_spend (
  source lead_source not null,
  month  date not null check (extract(day from month) = 1),
  amount_inr numeric(12,2) not null check (amount_inr >= 0),
  primary key (source, month)
);

-- ───────────────────────── chat ─────────────────────────
create table conversations (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid references leads(id) on delete set null,
  visitor_key   text not null,                     -- random id in the buyer's cookie
  project_id    uuid references projects(id),
  language      text not null default 'en',
  handoff_at    timestamptz,
  handoff_reason text,
  flagged       boolean not null default false,
  flag_reasons  text[] not null default '{}',
  reviewed_at   timestamptz,
  reviewed_by   uuid references users(id),
  review_note   text,
  pending_slot_id uuid,                            -- slot the buyer picked before giving contact details
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on conversations (visitor_key);
create index on conversations (lead_id);

create type msg_role as enum ('buyer', 'assistant', 'executive', 'system');

create table messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  role            msg_role not null,
  content         text not null,
  cards           jsonb not null default '[]',     -- slot pickers, confirmations rendered in the UI
  meta            jsonb not null default '{}',     -- model, guard hits, tool calls
  author_id       uuid references users(id),
  created_at      timestamptz not null default now()
);
create index on messages (conversation_id, created_at);

-- ───────────────────────── site visits ─────────────────────────
create table visit_slots (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  capacity   int not null default 2 check (capacity between 1 and 20),
  active     boolean not null default true,
  unique (project_id, starts_at),
  check (ends_at > starts_at)
);

create type visit_status as enum ('booked', 'cancelled', 'visited', 'no_show');

create table visits (
  id           uuid primary key default gen_random_uuid(),
  lead_id      uuid not null references leads(id) on delete cascade,
  slot_id      uuid not null references visit_slots(id),
  status       visit_status not null default 'booked',
  booked_via   text not null check (booked_via in ('assistant', 'executive', 'buyer')),
  party_size   int not null default 1 check (party_size between 1 and 8),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
-- A lead holds at most one upcoming booking at a time.
create unique index visits_one_active_per_lead on visits (lead_id) where status = 'booked';
create index on visits (slot_id) where status in ('booked', 'visited', 'no_show');

-- The database, not the app, is the last line of defence against double booking:
-- lock the slot row, then count what is already held in it.
create or replace function enforce_slot_capacity() returns trigger as $$
declare
  cap int; held int; is_active boolean; starts timestamptz;
begin
  if new.status <> 'booked' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'booked' and old.slot_id = new.slot_id then return new; end if;

  select capacity, active, starts_at into cap, is_active, starts
    from visit_slots where id = new.slot_id for update;
  if not found then raise exception 'SLOT_NOT_FOUND' using errcode = 'P0001'; end if;
  if not is_active then raise exception 'SLOT_INACTIVE' using errcode = 'P0001'; end if;
  if starts <= now() then raise exception 'SLOT_IN_PAST' using errcode = 'P0001'; end if;

  select count(*) into held from visits
   where slot_id = new.slot_id and status = 'booked' and id <> new.id;
  if held >= cap then raise exception 'SLOT_FULL' using errcode = 'P0001'; end if;
  return new;
end $$ language plpgsql;

create trigger visits_capacity
  before insert or update of status, slot_id on visits
  for each row execute function enforce_slot_capacity();

-- ───────────────────────── outbound messages (mocked WhatsApp/SMS) ─────────────────────────
create type outbox_status as enum ('scheduled', 'sent', 'cancelled', 'skipped');

create table outbox (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references leads(id) on delete cascade,
  visit_id    uuid references visits(id) on delete cascade,
  kind        text not null check (kind in ('ack', 'confirmation', 'reminder_1d', 'reminder_2h', 'handoff')),
  channel     text not null default 'whatsapp' check (channel in ('whatsapp', 'sms')),
  template    text not null,                       -- approved opt-in template name
  body        text not null,
  send_at     timestamptz not null,
  status      outbox_status not null default 'scheduled',
  status_note text,
  sent_at     timestamptz,
  created_at  timestamptz not null default now(),
  unique (visit_id, kind)
);
create index on outbox (status, send_at);

-- ───────────────────────── audit ─────────────────────────
create table audit_log (
  id         bigserial primary key,
  actor_id   uuid references users(id),
  action     text not null,
  entity     text not null,
  entity_id  text,
  detail     jsonb not null default '{}',
  created_at timestamptz not null default now()
);
