-- Pages de destination des événements (/e/{slug}), visibilité, intervenants, présences et notifications.
-- Migration additive : à appliquer juste avant de déployer le code correspondant.

create type presence.event_visibility as enum ('membres', 'public');
create type presence.event_type as enum ('standard', 'bienvenue');

alter table presence.events
  add column slug varchar(100),
  add column visibility presence.event_visibility not null default 'membres',
  add column type presence.event_type not null default 'standard',
  add column tagline text not null default '',
  add column program text not null default '',
  add column takeaways jsonb not null default '[]'::jsonb,
  add column faq jsonb not null default '[]'::jsonb,
  add column views integer not null default 0,
  add column guests_allowed boolean not null default false, -- prévu pour ouvrir plus tard certains événements à des invités
  add column cancelled_at timestamptz;

-- Adresse lisible pour les événements existants, unique : un même titre reçoit -2, -3…
with base as (
  select id, coalesce(nullif(left(trim(both '-' from regexp_replace(
    translate(lower(title), 'àâäáãéèêëíîïìóôöòõúûüùçñœ’''', 'aaaaaeeeeiiiiooooouuuucno--'), '[^a-z0-9]+', '-', 'g')), 80), ''), 'evenement') as slug
  from presence.events
), numbered as (
  select id, slug, row_number() over (partition by slug order by id) as n from base
)
update presence.events e
set slug = case when n.n = 1 then n.slug else n.slug || '-' || n.n end
from numbered n
where e.id = n.id;

alter table presence.events alter column slug set not null;
create unique index events_slug_unique on presence.events (slug);

alter table presence.event_registrations
  add column created_at timestamptz not null default now(),
  add column attended_at timestamptz;

create table presence.event_speakers (
  event_id integer not null references presence.events (id) on delete cascade,
  member_id integer not null references presence.members (id) on delete cascade,
  position integer not null default 0,
  primary key (event_id, member_id)
);

-- Inscriptions d'invités extérieurs : la structure est prête, rien ne l'utilise encore.
create table presence.event_guests (
  id serial primary key,
  event_id integer not null references presence.events (id) on delete cascade,
  name varchar(160) not null,
  email varchar(255) not null,
  created_at timestamptz not null default now()
);
create unique index event_guests_uniq on presence.event_guests (event_id, lower(email));

-- Notifications dans l'application (cloche) : annulation, place libérée, décision de l'équipe…
create table presence.notifications (
  id serial primary key,
  member_id integer not null references presence.members (id) on delete cascade,
  title varchar(200) not null,
  body text not null default '',
  href text not null default '',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_member_idx on presence.notifications (member_id, created_at desc);

-- Photos de couverture importées par les organisateurs ; photos de profil.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('event-images', 'event-images', true, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- ─── RLS : second rempart, alignée sur server/lib/eventAccess.ts ─────────────
alter table presence.event_speakers enable row level security;
alter table presence.event_guests enable row level security;
alter table presence.notifications enable row level security;
revoke all on presence.event_speakers, presence.event_guests, presence.notifications from anon, authenticated;
grant select on presence.event_speakers, presence.notifications to authenticated;
-- presence.event_guests : aucun droit.

-- Créer, modifier ou s'inscrire passe uniquement par le serveur : places, adresses et photo y sont contrôlées.
revoke insert, update, delete on presence.events from authenticated;
revoke insert, update, delete on presence.event_registrations from authenticated;
drop policy events_propose on presence.events;
drop policy events_update on presence.events;
drop policy events_delete on presence.events;
drop policy registrations_own_insert on presence.event_registrations;
drop policy registrations_own_delete on presence.event_registrations;

-- L'adresse et le lien de visio restent exclus des colonnes accordées (0008).
grant select (slug, visibility, type, tagline, program, takeaways, faq, cancelled_at) on presence.events to authenticated;
drop policy events_read on presence.events;
create policy events_read on presence.events for select to authenticated using (
  presence.current_member_id() is not null and (
    host_id = presence.current_member_id() or presence.is_admin()
    or (status = 'published' and (hive_id is null or presence.inside_hive(hive_id)))
  ));
drop policy registrations_read on presence.event_registrations;
create policy registrations_read on presence.event_registrations for select to authenticated using (
  member_id = presence.current_member_id() or exists (select 1 from presence.events e where e.id = event_id));
create policy event_speakers_read on presence.event_speakers for select to authenticated using (
  exists (select 1 from presence.events e where e.id = event_id));
create policy notifications_own on presence.notifications for select to authenticated using (member_id = presence.current_member_id());
