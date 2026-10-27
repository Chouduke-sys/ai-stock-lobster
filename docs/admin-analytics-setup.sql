-- Run in your Supabase SQL editor. Server service-role key only; no public table access.
create table if not exists public.analytics_events (
 id bigint generated always as identity primary key,
 event_name text not null check(event_name in ('page_view','morning_brief_view')),
 visitor_hash text not null,
 user_hash text,
 provider text,
 created_at timestamptz not null default now()
);
create index if not exists analytics_events_created_at_idx on public.analytics_events(created_at desc);
alter table public.analytics_events enable row level security;
-- No anon/authenticated policies. Service role bypasses RLS on the server.
