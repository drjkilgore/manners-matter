-- ============================================================
-- Poise & Purpose Academy — Supabase / Postgres schema (v1)
-- Multi-tenant SaaS. Child-safety first: minimal PII, RLS everywhere,
-- consent + audit logging. Run in the Supabase SQL editor.
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- Tenancy ----------
create table organizations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          text unique not null,
  type          text not null default 'family'
                  check (type in ('family','school','church','nonprofit','academy','youth_org')),
  brand         jsonb not null default '{}'::jsonb,   -- {logo_url, primary_color, initial}
  plan          text not null default 'free'
                  check (plan in ('free','premium_family','school','church','nonprofit','youth_org','instructor','white_label')),
  created_at    timestamptz not null default now()
);

-- ---------- People ----------
-- Adult accounts map to Supabase auth.users. Children do NOT get auth accounts;
-- they are profiles owned by a guardian/org (COPPA-minded).
create table users (
  id            uuid primary key references auth.users(id) on delete cascade,
  org_id        uuid not null references organizations(id) on delete cascade,
  role          text not null default 'guardian'
                  check (role in ('super_admin','org_admin','instructor','guardian')),
  display_name  text,
  email         text,
  created_at    timestamptz not null default now()
);

create table student_profiles (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  guardian_id   uuid references users(id) on delete set null,  -- null for org-managed cohorts
  first_name    text not null,                 -- first name / nickname only (minimize PII)
  age_band      text not null check (age_band in ('k1','k2','t1','t2','ya')),
  avatar        text,
  created_at    timestamptz not null default now()
);

-- ---------- Curriculum (content is data-driven) ----------
create table courses (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid references organizations(id) on delete cascade,  -- null = global catalog
  key           text not null,                 -- e.g. 'communicator'
  title         text not null,
  cert_title    text,
  age_bands     text[] not null default '{k1,k2,t1,t2,ya}',
  sort          int not null default 0
);

create table modules (
  id            uuid primary key default gen_random_uuid(),
  course_id     uuid not null references courses(id) on delete cascade,
  key           text not null,
  title         text not null,
  emoji         text,
  blurb         text,
  age_bands     text[] not null default '{k1,k2,t1,t2,ya}',
  sort          int not null default 0
);

create table lessons (
  id            uuid primary key default gen_random_uuid(),
  module_id     uuid not null references modules(id) on delete cascade,
  key           text not null,
  title         text not null,
  objective     text,
  minutes       int default 8,
  age_bands     text[] not null default '{k1,k2,t1,t2,ya}',
  body          jsonb not null default '{}'::jsonb, -- {teach:{young,mid,old}, vocab, scenario, choose, reflect, challenge, ext, game, builder}
  sort          int not null default 0
);

create table quiz_questions (
  id            uuid primary key default gen_random_uuid(),
  lesson_id     uuid not null references lessons(id) on delete cascade,
  prompt        text not null,
  options       jsonb not null,                -- ["a","b","c"]
  answer_index  int not null,
  rationale     text,
  sort          int not null default 0
);

-- ---------- Progress & gamification ----------
create table progress (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references student_profiles(id) on delete cascade,
  lesson_id     uuid not null references lessons(id) on delete cascade,
  completed_at  timestamptz,
  quiz_score    int default 0,
  quiz_total    int default 0,
  choice_ok     boolean default false,
  reflection    text,
  unique (student_id, lesson_id)
);

create table student_stats (
  student_id    uuid primary key references student_profiles(id) on delete cascade,
  points        int not null default 0,
  streak        int not null default 0,
  last_active   date
);

create table badges (
  id uuid primary key default gen_random_uuid(),
  key text unique not null, name text not null, emoji text, description text
);
create table student_badges (
  student_id uuid references student_profiles(id) on delete cascade,
  badge_id   uuid references badges(id) on delete cascade,
  earned_at  timestamptz not null default now(),
  primary key (student_id, badge_id)
);

create table certificates (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references student_profiles(id) on delete cascade,
  course_id     uuid not null references courses(id) on delete cascade,
  org_id        uuid not null references organizations(id) on delete cascade,
  instructor    text,
  verify_code   text unique not null default ('PPA-' || upper(substr(md5(random()::text),1,6))),
  issued_on     date not null default current_date
);

-- ---------- Org / school features ----------
create table cohorts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null, age_band text, created_at timestamptz default now()
);
create table cohort_members (
  cohort_id uuid references cohorts(id) on delete cascade,
  student_id uuid references student_profiles(id) on delete cascade,
  primary key (cohort_id, student_id)
);
create table assignments (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid references cohorts(id) on delete cascade,
  lesson_id uuid references lessons(id) on delete cascade,
  due_on date, created_at timestamptz default now()
);
create table events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  title text, starts_at timestamptz, kind text
);

-- ---------- Safety, consent, audit, billing ----------
create table consent_records (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid references organizations(id) on delete cascade,
  guardian_id   uuid references users(id) on delete set null,
  student_id    uuid references student_profiles(id) on delete cascade,
  consent_type  text not null,                 -- 'coppa_parental','data_processing','community_features'
  granted       boolean not null default false,
  granted_at    timestamptz,
  ip_hash       text                           -- hashed, not raw IP
);

create table messages (                        -- moderated; no unrestricted adult->child DMs
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  from_user uuid references users(id) on delete set null,
  to_student uuid references student_profiles(id) on delete cascade,
  body text, status text default 'pending_review'
    check (status in ('pending_review','approved','blocked')),
  created_at timestamptz default now()
);

create table audit_logs (
  id bigserial primary key,
  org_id uuid, actor uuid, action text, target text,
  meta jsonb default '{}'::jsonb, created_at timestamptz default now()
);

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  stripe_customer_id text, stripe_subscription_id text,
  status text, plan text, current_period_end timestamptz
);
create table payments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  stripe_payment_intent text, amount_cents int, currency text default 'usd',
  status text, created_at timestamptz default now()
);

-- ============================================================
-- Row-Level Security (enable + representative policies)
-- ============================================================
alter table organizations   enable row level security;
alter table users           enable row level security;
alter table student_profiles enable row level security;
alter table progress        enable row level security;
alter table certificates    enable row level security;
alter table consent_records enable row level security;

-- helper: the caller's org
create or replace function auth_org() returns uuid language sql stable as $$
  select org_id from users where id = auth.uid()
$$;

-- Users see their own org.
create policy org_read on organizations for select using (id = auth_org());

-- Guardians see only their own children; org admins/instructors see their org's students.
create policy students_read on student_profiles for select using (
  org_id = auth_org() and (
    guardian_id = auth.uid()
    or exists (select 1 from users u where u.id = auth.uid()
               and u.role in ('org_admin','instructor','super_admin'))
  )
);
create policy students_write on student_profiles for all using (
  guardian_id = auth.uid()
  or exists (select 1 from users u where u.id = auth.uid() and u.role in ('org_admin','super_admin'))
) with check (org_id = auth_org());

-- Progress readable by the student's guardian or org staff.
create policy progress_rw on progress for all using (
  exists (select 1 from student_profiles s where s.id = progress.student_id
          and (s.guardian_id = auth.uid()
               or exists (select 1 from users u where u.id=auth.uid()
                          and u.org_id=s.org_id and u.role in ('org_admin','instructor','super_admin'))))
);

create policy certs_read on certificates for select using (org_id = auth_org());
create policy consent_rw  on consent_records for all using (org_id = auth_org());

-- Public certificate verification (code only, no PII) is served through a
-- SECURITY DEFINER view or an edge function — do not expose the table directly.
create or replace view public_certificate_verify as
  select verify_code, issued_on,
         (select title from courses c where c.id = certificates.course_id) as course,
         (select name  from organizations o where o.id = certificates.org_id) as organization
  from certificates;

-- ============================================================
-- Seed the eight starter badges to match the app.
-- ============================================================
insert into badges (key,name,emoji,description) values
 ('first','First Steps','🌱','Finish your first lesson.'),
 ('kind','Kind Heart','💛','Complete Respect & Character.'),
 ('table','Table Master','🍽️','Set the table perfectly.'),
 ('digital','Digital Citizen','🛡️','Finish Digital Life & Safety.'),
 ('streak3','On a Roll','🔥','A 3-day streak.'),
 ('streak7','Steady Star','⭐','A 7-day streak.'),
 ('coach','Curious Coach','🧭','Ask the coach 3 questions.'),
 ('ambassador','Etiquette Ambassador','🏅','Complete any full learning path.')
on conflict (key) do nothing;
