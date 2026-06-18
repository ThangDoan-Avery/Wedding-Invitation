create table if not exists public.wedding_wishes (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 80),
  message text not null check (char_length(trim(message)) between 1 and 500),
  created_at timestamptz not null default now(),
  is_visible boolean not null default true
);

alter table public.wedding_wishes enable row level security;

grant usage on schema public to anon;
grant select, insert on table public.wedding_wishes to anon;

drop policy if exists "Anyone can read visible wedding wishes" on public.wedding_wishes;
create policy "Anyone can read visible wedding wishes"
on public.wedding_wishes
for select
to anon
using (is_visible = true);

drop policy if exists "Anyone can add wedding wishes" on public.wedding_wishes;
create policy "Anyone can add wedding wishes"
on public.wedding_wishes
for insert
to anon
with check (
  char_length(trim(name)) between 1 and 80
  and char_length(trim(message)) between 1 and 500
);

create table if not exists public.wedding_rsvps (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 80),
  attendance text not null check (attendance in ('yes', 'no')),
  attending boolean not null,
  invitation_side text not null default 'Th' check (invitation_side in ('Th', 'Tr')),
  created_at timestamptz not null default now()
);

alter table public.wedding_rsvps
add column if not exists invitation_side text not null default 'Th';

alter table public.wedding_rsvps
drop constraint if exists wedding_rsvps_invitation_side_check;

alter table public.wedding_rsvps
add constraint wedding_rsvps_invitation_side_check
check (invitation_side in ('Th', 'Tr'));

alter table public.wedding_rsvps enable row level security;

grant select, insert on table public.wedding_rsvps to anon;

drop policy if exists "Anyone can add wedding rsvps" on public.wedding_rsvps;
create policy "Anyone can add wedding rsvps"
on public.wedding_rsvps
for insert
to anon
with check (
  char_length(trim(name)) between 1 and 80
  and attendance in ('yes', 'no')
  and invitation_side in ('Th', 'Tr')
);
