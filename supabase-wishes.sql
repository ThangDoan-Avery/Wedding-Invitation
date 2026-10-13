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
  guest_count integer not null default 1 check (guest_count between 0 and 10),
  invitation_side text check (invitation_side is null or invitation_side in ('Th', 'Tr')),
  created_at timestamptz not null default now()
);

-- Run this script again to add the quantity field to an existing RSVP table.
alter table public.wedding_rsvps
add column if not exists guest_count integer not null default 1
check (guest_count between 0 and 10);

update public.wedding_rsvps
set guest_count = 0
where attendance = 'no' and guest_count <> 0;

-- Preserve historical side values; the common RSVP form no longer asks for a side.
alter table public.wedding_rsvps
add column if not exists invitation_side text;

alter table public.wedding_rsvps
alter column invitation_side drop not null,
alter column invitation_side drop default;

alter table public.wedding_rsvps
drop constraint if exists wedding_rsvps_invitation_side_check;

alter table public.wedding_rsvps
add constraint wedding_rsvps_invitation_side_check
check (invitation_side is null or invitation_side in ('Th', 'Tr'));

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
  and (invitation_side is null or invitation_side in ('Th', 'Tr'))
  and (
    (attendance = 'yes' and attending = true and guest_count between 1 and 10)
    or (attendance = 'no' and attending = false and guest_count = 0)
  )
);
