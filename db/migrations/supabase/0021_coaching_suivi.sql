-- Suivi du coaching individuel. Copie des bases Notion de Laura (Offres Accompagnements, CRM People,
-- Inscriptions, Sessions : Notion fait foi), et ce que Laura et ses clients écrivent dans Présence.
-- Les textes sont chiffrés par le serveur (server/lib/privateBox.ts) : la base est partagée avec une autre application.
-- Cette migration ne retire rien : l'ancienne table coaching_sessions reste jusqu'au nettoyage.

create table presence.coaching_offers (
  id serial primary key,
  notion_page_id varchar(64) not null unique,
  title varchar(300) not null default '',
  sessions integer, -- « Nombre de sessions »
  individual boolean not null default true, -- « format » contient « individuel »
  presence_access boolean not null default false, -- « Accès Présence inclus » : accès au réseau pendant le coaching, puis 6 mois
  archived_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Une inscription : un client, un programme
create table presence.coaching_engagements (
  id serial primary key,
  notion_page_id varchar(64) not null unique,
  member_id integer references presence.members(id) on delete set null, -- relié par l'adresse e-mail du CRM
  client_page_id varchar(64) not null default '',
  client_name varchar(200) not null default '',
  client_email varchar(255) not null default '',
  offer_id integer references presence.coaching_offers(id) on delete set null,
  title varchar(300) not null default '',
  status varchar(20) not null default '', -- En attente | En cours | Terminé | Abandonné
  starts_on date,
  planned_end_on date,
  sessions_planned integer, -- « Séances prévues »
  access_ends_at timestamptz, -- 6 mois après la fin de l'accompagnement
  access_applied_at timestamptz, -- la fin d'accès a été reportée sur la fiche du membre
  midpoint_email_at timestamptz, -- l'invitation de mi-parcours est partie
  inspiration_enc text not null default '', -- une inspiration, pour le client
  exercise_enc text not null default '', -- un exercice ou un défi, pour le client
  notion_edited_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index coaching_engagements_member_idx on presence.coaching_engagements (member_id);

-- Une séance (base Sessions)
create table presence.coaching_meetings (
  id serial primary key,
  notion_page_id varchar(64) not null unique,
  engagement_id integer references presence.coaching_engagements(id) on delete cascade,
  number integer,
  kind varchar(40) not null default '', -- Diagnostic | Séance | Mi-parcours | Fin de parcours | Suivi après accompagnement
  state varchar(20) not null default 'Non planifié', -- Non planifié | Reportée | Planifié | Terminé | Absence | Annulée
  starts_at timestamptz,
  ends_at timestamptz,
  key_points_enc text not null default '', -- « Points clés travaillés »
  actions_enc text not null default '', -- « Actions pour le client »
  report_shared boolean not null default false, -- « Compte rendu validé » : visible du client
  notion_edited_at timestamptz,
  archived_at timestamptz,
  updated_at timestamptz not null default now()
);
create index coaching_meetings_engagement_idx on presence.coaching_meetings (engagement_id);

-- Les objectifs de l'accompagnement, visibles du client
create table presence.coaching_goals (
  id serial primary key,
  engagement_id integer not null references presence.coaching_engagements(id) on delete cascade,
  text_enc text not null,
  done_at timestamptz,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Les notes privées de Laura : jamais visibles du client
create table presence.coaching_notes (
  id serial primary key,
  engagement_id integer not null references presence.coaching_engagements(id) on delete cascade,
  meeting_id integer references presence.coaching_meetings(id) on delete set null,
  text_enc text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Le carnet d'introspection du client, partagé avec Laura
create table presence.coaching_journal (
  id serial primary key,
  engagement_id integer not null references presence.coaching_engagements(id) on delete cascade,
  member_id integer not null references presence.members(id) on delete cascade,
  text_enc text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- La dernière lecture des bases du coaching
create table presence.coaching_sync_runs (
  id serial primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status varchar(12) not null default 'en_cours', -- en_cours | ok | erreur
  detail text not null default ''
);

-- Le serveur passe par la connexion directe ; personne d'autre n'y accède
alter table presence.coaching_offers enable row level security;
alter table presence.coaching_engagements enable row level security;
alter table presence.coaching_meetings enable row level security;
alter table presence.coaching_goals enable row level security;
alter table presence.coaching_notes enable row level security;
alter table presence.coaching_journal enable row level security;
alter table presence.coaching_sync_runs enable row level security;

-- L'invitation à la séance de mi-parcours : automatique (cloche et e-mail), Laura peut la couper
insert into presence.workflows (key, name, description, active, title, body, delay_days, email_enabled, email_subject, email_body) values (
  'coaching_mi_parcours',
  'Séance de mi-parcours',
  'Quand la moitié des séances prévues est faite, le client est invité à réserver sa séance de mi-parcours. Une seule fois par accompagnement.',
  true,
  'Vous êtes à mi-parcours : réservez votre séance avec Laura',
  'La moitié de votre accompagnement est derrière vous. Prenons le temps d’un bilan de mi-parcours.',
  0,
  true,
  'Votre séance de mi-parcours avec Laura',
  'Bonjour {{prenom}},

Vous avez fait la moitié de votre accompagnement « {{programme}} ». C’est le bon moment pour un bilan de mi-parcours : ce qui a bougé, ce qui reste à travailler, et la suite.

Réservez votre séance quand cela vous convient.'
) on conflict (key) do nothing;
