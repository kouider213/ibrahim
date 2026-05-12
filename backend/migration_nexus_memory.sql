-- ============================================================
-- NEXUS MEMORY — Run in Supabase SQL Editor
-- ============================================================

create table if not exists nexus_tasks (
  id           uuid primary key default gen_random_uuid(),
  task_id      text not null unique,
  objective    text not null,
  status       text not null,
  steps        int  default 0,
  screenshots  int  default 0,
  provider     text,
  duration_ms  int  default 0,
  error        text,
  action_log   jsonb default '[]',
  created_at   timestamptz default now()
);

create table if not exists nexus_task_steps (
  id           uuid primary key default gen_random_uuid(),
  task_id      text not null,
  step         int  not null,
  action       text not null,
  payload      jsonb default '{}',
  success      boolean default true,
  error        text,
  screen_hash  text,
  provider     text,
  latency_ms   int  default 0,
  confidence   float default 0,
  created_at   timestamptz default now()
);

create table if not exists nexus_workflows (
  id               uuid primary key default gen_random_uuid(),
  objective_hash   text not null unique,
  objective        text not null,
  action_sequence  jsonb default '[]',
  success_count    int  default 0,
  fail_count       int  default 0,
  avg_steps        float default 0,
  avg_duration_ms  float default 0,
  last_used_at     timestamptz default now(),
  created_at       timestamptz default now()
);

create table if not exists nexus_provider_stats (
  id             uuid primary key default gen_random_uuid(),
  provider       text not null unique,
  success_count  int   default 0,
  fail_count     int   default 0,
  avg_latency_ms float default 0,
  last_error     text,
  last_error_at  timestamptz,
  last_used_at   timestamptz,
  cooldown_until timestamptz
);

create table if not exists nexus_ui_patterns (
  id            uuid primary key default gen_random_uuid(),
  window_title  text not null unique,
  app_name      text not null,
  seen_count    int  default 1,
  last_seen_at  timestamptz default now()
);

create table if not exists nexus_failures (
  id           uuid primary key default gen_random_uuid(),
  pattern      text not null unique,
  context      text,
  count        int  default 1,
  last_seen_at timestamptz default now()
);

create table if not exists nexus_screenshots_meta (
  id           uuid primary key default gen_random_uuid(),
  task_id      text,
  step         int,
  screen_hash  text not null,
  size_kb      float,
  ui_elements  jsonb default '[]',
  created_at   timestamptz default now()
);

-- Indexes for performance
create index if not exists idx_nexus_tasks_created  on nexus_tasks (created_at desc);
create index if not exists idx_nexus_steps_task     on nexus_task_steps (task_id);
create index if not exists idx_nexus_wf_hash        on nexus_workflows (objective_hash);
create index if not exists idx_nexus_prov_provider  on nexus_provider_stats (provider);
create index if not exists idx_nexus_fails_count    on nexus_failures (count desc);
