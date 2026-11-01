-- Cadrage de la photo d'un événement, et événements récurrents.
-- Chaque date d'une série reste un événement ordinaire, avec sa page et ses inscrits : rien ne change pour ce qui existe déjà.
create table presence.event_series (
  id serial primary key,
  every varchar(20) not null, -- semaine | deux_semaines | mois
  anchor_at timestamptz not null, -- la date dont partent les suivantes
  until_at timestamptz, -- vide : la série continue tant qu'elle n'est pas arrêtée
  stopped_at timestamptz,
  created_at timestamptz not null default now()
);

alter table presence.events
  add column photo_position varchar(20) not null default '50% 50%',
  add column series_id integer references presence.event_series (id) on delete set null;
create index events_series_idx on presence.events (series_id, starts_at);

alter table presence.event_series enable row level security;
revoke all on presence.event_series from anon, authenticated;
