-- ============================================================
-- ReservaQuadras — schema Supabase (Postgres)
--
-- Como aplicar:
--   1. Crie um projeto em https://supabase.com
--   2. Abra SQL Editor no painel do projeto
--   3. Cole este arquivo inteiro e execute (Run)
--   4. Crie as duas contas de staff em Authentication → Users
--      (ex.: esportes@seuclube.com.br, diretora@seuclube.com.br)
--   5. Para cada conta criada, copie o "User UID" e rode (ajustando
--      role para 'esportes' ou 'diretora'):
--        insert into profiles (id, role) values ('<uid-aqui>', 'esportes');
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- profiles: liga cada conta do Supabase Auth a um papel do app
-- ------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('esportes', 'diretora')),
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "profiles: self read" on profiles
  for select using (auth.uid() = id);

-- helpers usados pelas policies das tabelas de negócio
create or replace function is_staff() returns boolean
  language sql stable as $$
    select exists (select 1 from profiles where id = auth.uid());
  $$;

create or replace function is_esportes() returns boolean
  language sql stable as $$
    select exists (select 1 from profiles where id = auth.uid() and role = 'esportes');
  $$;

create or replace function set_updated_at() returns trigger
  language plpgsql as $$
  begin
    new.updated_at = now();
    return new;
  end;
  $$;

-- ------------------------------------------------------------
-- courts
-- ------------------------------------------------------------
create table courts (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order int not null default 0
);

alter table courts enable row level security;
create policy "courts: staff read" on courts for select using (is_staff());
create policy "courts: esportes write" on courts for all using (is_esportes()) with check (is_esportes());

-- ------------------------------------------------------------
-- members: título → nomes (um título pode ter várias pessoas)
-- ------------------------------------------------------------
create table members (
  id uuid primary key default gen_random_uuid(),
  membership_number text not null unique,
  created_at timestamptz not null default now()
);

create table member_names (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  name text not null
);
create index member_names_member_idx on member_names(member_id);

alter table members enable row level security;
alter table member_names enable row level security;
create policy "members: staff read" on members for select using (is_staff());
create policy "members: esportes write" on members for all using (is_esportes()) with check (is_esportes());
create policy "member_names: staff read" on member_names for select using (is_staff());
create policy "member_names: esportes write" on member_names for all using (is_esportes()) with check (is_esportes());

-- ------------------------------------------------------------
-- sessions: unifica bookings/waitlist/withdrawals/history —
-- promover ou arquivar passa a ser um UPDATE de status, não uma
-- movimentação entre 4 estruturas separadas.
-- ------------------------------------------------------------
create table sessions (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('court', 'waitlist', 'withdrawn', 'history')),
  court_id uuid references courts(id),
  type text,                 -- blocked | rain | tournament | lesson | null (jogo normal)
  activity text,
  start_time text,
  end_time text,
  registration_time text,
  registration_date date,
  observation text,
  repeat boolean not null default false,
  promoted_from text,
  queue_position int,         -- ordem manual da fila de espera (arrastar-e-soltar)
  withdrawn_at text,
  withdrawn_date date,
  history_date date,
  weekday text,
  play_duration_min int,
  wait_duration_min int,
  encerrado_por text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index sessions_status_idx on sessions(status);
create index sessions_court_idx on sessions(court_id);

create trigger sessions_set_updated_at
  before update on sessions
  for each row execute function set_updated_at();

alter table sessions enable row level security;
create policy "sessions: staff read" on sessions for select using (is_staff());
create policy "sessions: esportes write" on sessions for all using (is_esportes()) with check (is_esportes());

create table session_players (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  member_id uuid references members(id),
  name_snapshot text not null,
  title_snapshot text,
  position int not null default 0
);
create index session_players_session_idx on session_players(session_id);

alter table session_players enable row level security;
create policy "session_players: staff read" on session_players for select using (is_staff());
create policy "session_players: esportes write" on session_players for all using (is_esportes()) with check (is_esportes());

-- ------------------------------------------------------------
-- club_settings: linha única (singleton)
-- ------------------------------------------------------------
create table club_settings (
  id int primary key default 1 check (id = 1),
  club_name text not null default 'ReservaQuadras',
  primary_color text not null default '#6366f1',
  theme text not null default 'dark',
  performance_mode boolean not null default true,
  manually_released_lessons jsonb not null default '[]'::jsonb,
  -- null = usar a grade padrão embutida no cliente (js/config.js); um objeto
  -- aqui é a grade personalizada salva pelo editor de horários de aula.
  fixed_schedules jsonb
);
insert into club_settings (id) values (1);

alter table club_settings enable row level security;
create policy "club_settings: staff read" on club_settings for select using (is_staff());
create policy "club_settings: esportes write" on club_settings for update using (is_esportes()) with check (is_esportes());

-- ------------------------------------------------------------
-- Views públicas — o que a tela "TV do saguão" (perfil publico,
-- sem login) pode ver. Nunca expõem nome/título de sócio.
-- ------------------------------------------------------------
create view v_public_courts as
select
  c.id as court_id,
  c.name as court_name,
  c.sort_order,
  s.id as session_id,
  s.status,
  s.type,
  s.activity,
  s.start_time,
  s.end_time,
  s.observation
from courts c
left join sessions s on s.court_id = c.id and s.status = 'court'
order by c.sort_order;

create view v_public_waitlist as
select
  s.id as session_id,
  s.registration_time,
  s.activity,
  (select count(*) from session_players sp where sp.session_id = s.id) as player_count
from sessions s
where s.status = 'waitlist'
order by coalesce(s.queue_position, 999999), s.registration_time;

-- ------------------------------------------------------------
-- Grants (as policies de RLS acima ainda se aplicam por cima)
-- ------------------------------------------------------------
grant usage on schema public to anon, authenticated;

grant select on v_public_courts to anon;
grant select on v_public_waitlist to anon;

grant select on courts, sessions, session_players, members, member_names, club_settings, profiles to authenticated;
grant insert, update, delete on courts, sessions, session_players, members, member_names to authenticated;
grant update on club_settings to authenticated;

-- ------------------------------------------------------------
-- Realtime: front-end escuta essas tabelas via
-- supabase.channel(...).on('postgres_changes', ...)
-- ------------------------------------------------------------
alter publication supabase_realtime add table sessions, session_players, courts, members, member_names, club_settings;

-- ------------------------------------------------------------
-- Depois de criar as contas em Authentication → Users, rode
-- (substituindo os UIDs reais):
--
-- insert into profiles (id, role) values ('<uid-esportes>', 'esportes');
-- insert into profiles (id, role) values ('<uid-diretora>', 'diretora');
--
-- Semente inicial de quadras (ajuste os nomes conforme o clube):
--
-- insert into courts (name, sort_order) values
--   ('Quadra 1', 1), ('Quadra 2', 2), ('Quadra Rápida', 3);
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- MIGRAÇÃO — projeto já existente (rode uma vez no SQL Editor):
-- adiciona a coluna que passou a sincronizar a grade de horários
-- de aula entre dispositivos (antes só ficava no localStorage).
--
-- alter table club_settings add column if not exists fixed_schedules jsonb;
-- ------------------------------------------------------------
