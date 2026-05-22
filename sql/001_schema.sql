-- DigiDay Dashboard schema (dashboard_* prefix to keep isolated from AKV wall tables)
-- Run in Supabase SQL Editor: https://supabase.com/dashboard/project/pkkjenyheauoczvwnzwi/sql/new

create table if not exists dashboard_teams (
  id          text primary key,
  name        text not null,
  color       text default '#FF009E',
  position    int  default 0,
  updated_at  timestamptz not null default now()
);

create table if not exists dashboard_operators (
  pd_user_id    bigint primary key,
  pd_user_name  text   not null,
  team_id       text   references dashboard_teams(id) on delete set null,
  position      text   not null default 'junior1',  -- junior1 | junior2 | senior | novacek
  plan_monthly  int    not null default 0,
  plan_daily    int    not null default 0,
  active        boolean not null default true,
  updated_at    timestamptz not null default now()
);

create index if not exists dashboard_operators_team_idx   on dashboard_operators(team_id);
create index if not exists dashboard_operators_active_idx on dashboard_operators(active);

-- Defaultné tímy (môžeš preskočiť / upraviť cez admin UI neskôr)
insert into dashboard_teams (id, name, color, position) values
  ('cc-tym-a', 'Tým A', '#FF009E', 1),
  ('cc-tym-b', 'Tým B', '#40C4FF', 2)
on conflict (id) do nothing;
