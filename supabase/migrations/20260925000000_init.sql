-- Game Night schema.
--
-- Security model: every table has Row Level Security enabled and NO policies
-- for the `anon` or `authenticated` roles. Browsers therefore cannot read or
-- write any game data through the Supabase Data API. All access goes through
-- the Next.js server (service role / direct connection), which filters each
-- player's view so private hands never leave the server for anyone else.

create table if not exists gn_rooms (
  id          uuid primary key,
  code        text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  doc         jsonb not null,
  version     integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  active_at   timestamptz not null default now()
);
create index if not exists gn_rooms_active_at_idx on gn_rooms (active_at);

-- Guest sessions: only a SHA-256 hash of each bearer token is stored.
create table if not exists gn_sessions (
  token_hash  text primary key check (length(token_hash) = 64),
  room_id     uuid not null references gn_rooms(id) on delete cascade,
  player_id   text not null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);
create index if not exists gn_sessions_room_player_idx on gn_sessions (room_id, player_id);
create index if not exists gn_sessions_expires_idx on gn_sessions (expires_at);

-- Completed round summaries (public information only).
create table if not exists gn_round_summaries (
  id          bigserial primary key,
  room_id     uuid not null references gn_rooms(id) on delete cascade,
  game_id     text not null,
  round       integer not null,
  summary     jsonb not null,
  created_at  timestamptz not null default now()
);
create index if not exists gn_round_summaries_room_idx on gn_round_summaries (room_id);

alter table gn_rooms enable row level security;
alter table gn_sessions enable row level security;
alter table gn_round_summaries enable row level security;

-- Belt and braces on Supabase: remove default grants from the API roles.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on gn_rooms, gn_sessions, gn_round_summaries from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on gn_rooms, gn_sessions, gn_round_summaries from authenticated;
  end if;
end $$;

-- Idle-room cleanup helper (can be scheduled with pg_cron on Supabase).
create or replace function gn_cleanup_idle_rooms(idle interval default interval '3 hours')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare removed integer;
begin
  delete from gn_rooms where active_at < now() - idle;
  get diagnostics removed = row_count;
  delete from gn_sessions where expires_at < now();
  return removed;
end $$;
revoke all on function gn_cleanup_idle_rooms(interval) from public;
