-- ════════════════════════════════════════════════════════════════
-- SIMUSID — Esquema de base de datos para Supabase
-- Ejecutar COMPLETO en: Supabase Dashboard → SQL Editor → New query
-- ════════════════════════════════════════════════════════════════

-- ── 1. PERFILES (vinculados a Supabase Auth) ─────────────────────
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','docente','estudiante')),
  nombre text not null default '',
  apellido text not null default '',
  cedula text unique,                  -- solo estudiantes
  username text unique,                -- nombre de usuario para iniciar sesión
  must_change_password boolean not null default false,
  created_at timestamptz not null default now()
);

-- Helper: rol del usuario autenticado (para políticas RLS)
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as
$$ select role from public.profiles where id = auth.uid() $$;

-- ── 2. IMÁGENES (metadatos; el archivo vive en Storage) ─────────
create table public.imagenes (
  id text primary key,
  owner uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name text not null,
  url text not null,
  path text not null,                  -- ruta dentro del bucket (para borrar)
  created_at timestamptz not null default now()
);

-- ── 3. COTEJOS (el contenido completo va en data jsonb) ─────────
create table public.cotejos (
  id text primary key,
  owner uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  owner_role text not null default 'docente',     -- 'docente' | 'estudiante'
  student_cedula text,                            -- cédula del estudiante dueño (copias)
  parent_id text,                                 -- cotejo modelo del que se copió
  name text not null default '',
  status text not null default 'modelo',          -- modelo|en_progreso|entregado|calificado
  published boolean not null default false,
  finalizado boolean not null default false,
  deadline text,
  deadline_strict boolean not null default false,
  grade int,
  data jsonb not null default '{}'::jsonb,        -- TODO el objeto del cotejo (shapes, fichas, notas...)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
create trigger cotejos_touch before update on public.cotejos
  for each row execute function public.touch_updated_at();

-- ── 4. EVENTOS (historial del sistema) ──────────────────────────
create table public.eventos (
  id text primary key,
  ts timestamptz not null default now(),
  category text not null,
  action text not null,
  detail text not null default '',
  actor text not null default 'sistema'
);

-- ── 5. ROW LEVEL SECURITY ────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.imagenes enable row level security;
alter table public.cotejos  enable row level security;
alter table public.eventos  enable row level security;

-- PROFILES: cada quien ve el suyo; docente/admin ven todos
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.my_role() in ('admin','docente'));
create policy profiles_update_own on public.profiles for update
  using (id = auth.uid() or public.my_role() = 'admin');
-- (los INSERT/DELETE de perfiles los hace la Edge Function con service_role, que omite RLS)

-- IMAGENES: todos los autenticados leen; solo docente/admin suben; dueño/admin borra
create policy imagenes_select on public.imagenes for select
  using (auth.uid() is not null);
create policy imagenes_insert on public.imagenes for insert
  with check (public.my_role() in ('docente','admin') and owner = auth.uid());
create policy imagenes_delete on public.imagenes for delete
  using (owner = auth.uid() or public.my_role() = 'admin');

-- COTEJOS: dueño total; docente/admin todo; estudiantes leen publicados
create policy cotejos_select on public.cotejos for select
  using (
    owner = auth.uid()
    or public.my_role() in ('admin','docente')
    or (owner_role = 'docente' and published = true)
  );
create policy cotejos_insert on public.cotejos for insert
  with check (auth.uid() is not null and owner = auth.uid());
create policy cotejos_update on public.cotejos for update
  using (owner = auth.uid() or public.my_role() in ('admin','docente'));
create policy cotejos_delete on public.cotejos for delete
  using (owner = auth.uid() or public.my_role() in ('admin','docente'));

-- EVENTOS: cualquiera autenticado registra; admin/docente leen
create policy eventos_insert on public.eventos for insert
  with check (auth.uid() is not null);
create policy eventos_select on public.eventos for select
  using (public.my_role() in ('admin','docente'));

-- ── 6. STORAGE: bucket de huellas (público para lectura) ────────
insert into storage.buckets (id, name, public) values ('huellas','huellas', true)
on conflict (id) do nothing;

create policy huellas_read on storage.objects for select
  using (bucket_id = 'huellas');
create policy huellas_upload on storage.objects for insert
  with check (bucket_id = 'huellas' and public.my_role() in ('docente','admin'));
create policy huellas_delete on storage.objects for delete
  using (bucket_id = 'huellas' and (owner = auth.uid() or public.my_role() = 'admin'));

-- ════════════════════════════════════════════════════════════════
-- 7. CREAR EL PRIMER ADMIN (hágalo DESPUÉS de crear el usuario en
--    Authentication → Users → Add user, con email y contraseña).
--    Reemplace el email por el suyo:
-- ════════════════════════════════════════════════════════════════
-- Cree primero el usuario en Authentication → Add user con el email sintético
-- 'SU_USUARIO@usr.simusid.app' (ej: simusid1@usr.simusid.app) + Auto Confirm.
-- Luego ejecute (cambiando 'simusid1' por su usuario):
-- insert into public.profiles (id, role, nombre, username)
-- select id, 'admin', 'Administrador', 'simusid1' from auth.users
-- where email = 'simusid1@usr.simusid.app';
