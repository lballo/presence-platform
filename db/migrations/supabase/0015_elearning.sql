-- Formations connectées à Notion : Notion fait foi pour les contenus, ces tables en gardent une copie
-- et enregistrent ce qui appartient aux membres (progression, journal, tests, mémoire du coach).
-- Journal, résultats de tests et mémoire sont chiffrés par le serveur (colonnes *_enc) et jamais écrits dans Notion.

create type presence.course_public as enum ('tous', 'attribution');
create type presence.course_rhythm as enum ('hebdo', 'complet');
create type presence.content_status as enum ('brouillon', 'relecture', 'publie');

-- ─── Copie de Notion ─────────────────────────────────────────
create table presence.courses (
  id serial primary key,
  notion_page_id varchar(64) not null unique,
  title varchar(200) not null,
  tagline text not null default '',
  emoji varchar(16) not null default '',
  cover_url text not null default '',
  cover_key text not null default '', -- identifie le fichier Notion déjà recopié dans notre stockage
  public presence.course_public not null default 'tous',
  rhythm presence.course_rhythm not null default 'hebdo',
  status presence.content_status not null default 'brouillon',
  position integer not null default 0,
  content jsonb not null default '{}'::jsonb,
  issues jsonb not null default '[]'::jsonb, -- ce que l'onglet Construire signale
  notion_edited_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table presence.course_modules (
  id serial primary key,
  course_id integer not null references presence.courses (id) on delete cascade,
  notion_page_id varchar(64) not null unique,
  title varchar(200) not null,
  position integer not null default 0, -- « Ordre » dans Notion : fixe la semaine d'ouverture
  status presence.content_status not null default 'brouillon',
  intention text not null default '',
  duration_min integer,
  video_url text not null default '',
  test_url text not null default '',
  coach_brief text not null default '', -- « Ce que le coach IA retient » : jamais envoyé aux membres
  content jsonb not null default '{}'::jsonb,
  issues jsonb not null default '[]'::jsonb,
  notion_edited_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index course_modules_course_idx on presence.course_modules (course_id, position);

create table presence.course_hashtags (
  course_id integer not null references presence.courses (id) on delete cascade,
  hashtag_id integer not null references presence.hashtags (id) on delete cascade,
  primary key (course_id, hashtag_id)
);
create table presence.course_module_hashtags (
  module_id integer not null references presence.course_modules (id) on delete cascade,
  hashtag_id integer not null references presence.hashtags (id) on delete cascade,
  primary key (module_id, hashtag_id)
);
create index course_module_hashtags_tag_idx on presence.course_module_hashtags (hashtag_id);

-- ─── Accès ───────────────────────────────────────────────────
create table presence.member_tags (
  id serial primary key,
  name varchar(60) not null,
  created_at timestamptz not null default now()
);
create unique index member_tags_name_unique on presence.member_tags (lower(name));
create table presence.member_tag_links (
  member_id integer not null references presence.members (id) on delete cascade,
  tag_id integer not null references presence.member_tags (id) on delete cascade,
  primary key (member_id, tag_id)
);

-- Une formation « sur attribution » : à un membre, à un type d'accès ou à une étiquette.
create table presence.course_assignments (
  id serial primary key,
  course_id integer not null references presence.courses (id) on delete cascade,
  member_id integer references presence.members (id) on delete cascade,
  access_type presence.access_type,
  tag_id integer references presence.member_tags (id) on delete cascade,
  created_by integer,
  created_at timestamptz not null default now(),
  check (num_nonnulls(member_id, access_type, tag_id) = 1)
);
create unique index course_assignments_member_uniq on presence.course_assignments (course_id, member_id) where member_id is not null;
create unique index course_assignments_access_uniq on presence.course_assignments (course_id, access_type) where access_type is not null;
create unique index course_assignments_tag_uniq on presence.course_assignments (course_id, tag_id) where tag_id is not null;

-- ─── Suivi du membre ─────────────────────────────────────────
create table presence.course_enrollments (
  id serial primary key,
  course_id integer not null references presence.courses (id) on delete cascade,
  member_id integer not null references presence.members (id) on delete cascade,
  started_at timestamptz not null default now(),
  full_access_at timestamptz, -- accès complet donné par l'administration, réversible
  full_access_by integer,
  last_activity_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (course_id, member_id)
);
create index course_enrollments_member_idx on presence.course_enrollments (member_id);

create table presence.module_progress (
  member_id integer not null references presence.members (id) on delete cascade,
  module_id integer not null references presence.course_modules (id) on delete cascade,
  opened_at timestamptz,
  opened_via_full_access boolean not null default false, -- ouvert avant sa date : se referme si l'accès complet est retiré
  completed_at timestamptz,
  challenge_done_at timestamptz,
  challenge_note_enc text not null default '',
  memory_status varchar(12) not null default '', -- '' | en_attente | fait | echec
  primary key (member_id, module_id)
);
create index module_progress_module_idx on presence.module_progress (module_id);
create index module_progress_memory_idx on presence.module_progress (memory_status);

-- ─── Données privées : visibles du seul membre, sauf ce qu'il partage ─
create table presence.journal_entries (
  id serial primary key,
  member_id integer not null references presence.members (id) on delete cascade,
  module_id integer references presence.course_modules (id) on delete set null,
  course_title varchar(200) not null default '',
  module_title varchar(200) not null default '',
  question_id varchar(64) not null, -- identifiant du bloc Notion, ou « note » pour une réflexion libre
  question_text text not null default '', -- copie : la question peut changer dans Notion
  answer_enc text not null,
  shared_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id, module_id, question_id)
);
create index journal_entries_shared_idx on presence.journal_entries (member_id, shared_at);

create table presence.test_results (
  id serial primary key,
  member_id integer not null references presence.members (id) on delete cascade,
  module_id integer references presence.course_modules (id) on delete set null,
  course_title varchar(200) not null default '',
  module_title varchar(200) not null default '',
  result_enc text not null,
  shared_at timestamptz,
  passed_at timestamptz not null default now()
);
create index test_results_member_idx on presence.test_results (member_id, passed_at desc);

create table presence.coach_memory (
  id serial primary key,
  member_id integer not null references presence.members (id) on delete cascade,
  source varchar(20) not null, -- module | test | defi
  source_label varchar(240) not null default '', -- « Module 1 · Faire le point »
  course_id integer references presence.courses (id) on delete set null,
  module_id integer references presence.course_modules (id) on delete set null,
  content_enc text not null,
  corrected_at timestamptz,
  shared_at timestamptz,
  created_at timestamptz not null default now()
);
create index coach_memory_member_idx on presence.coach_memory (member_id, created_at);

create table presence.coach_settings (
  member_id integer primary key references presence.members (id) on delete cascade,
  consent_at timestamptz,
  consent_version varchar(20) not null default '',
  refused_at timestamptz,
  paused_at timestamptz,
  updated_at timestamptz not null default now()
);

-- ─── Suivi technique ─────────────────────────────────────────
create table presence.notion_sync_runs (
  id serial primary key,
  trigger varchar(20) not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status varchar(12) not null default 'en_cours', -- en_cours | ok | erreur
  pages_changed integer not null default 0,
  detail text not null default ''
);
create index notion_sync_runs_started_idx on presence.notion_sync_runs (started_at desc);

-- Ce que fait un membre, sans jamais aucun contenu privé.
create table presence.member_activity (
  id serial primary key,
  member_id integer not null references presence.members (id) on delete cascade,
  type varchar(40) not null,
  course_id integer,
  module_id integer,
  label text not null default '',
  created_at timestamptz not null default now()
);
create index member_activity_member_idx on presence.member_activity (member_id, created_at desc);
create index member_activity_type_idx on presence.member_activity (type, created_at desc);

-- Relances automatiques : des modèles que l'administration active et dont elle règle le texte.
create table presence.workflows (
  key varchar(60) primary key,
  name varchar(120) not null,
  description text not null default '',
  active boolean not null default true,
  title text not null,
  body text not null default '',
  delay_days integer not null default 0,
  updated_at timestamptz not null default now()
);
insert into presence.workflows (key, name, description, title, body, delay_days) values
  ('nouveau_module', 'Nouveau module disponible', 'Prévient le membre le jour où son module de la semaine s’ouvre.', 'Votre module de la semaine est ouvert : {{module}}', 'Il vous attend dans la formation « {{formation}} ».', 0),
  ('formation_pause', 'Formation en pause depuis 14 jours', 'Invite à reprendre un membre qui n’a rien fait dans sa formation depuis 14 jours.', 'Votre formation vous attend : {{formation}}', 'Reprenez à votre rythme, là où vous vous étiez arrêté·e.', 14);

create table presence.workflow_runs (
  id serial primary key,
  workflow_key varchar(60) not null references presence.workflows (key) on delete cascade,
  member_id integer not null references presence.members (id) on delete cascade,
  ref varchar(80) not null, -- une relance ne part qu'une fois pour un même objet
  created_at timestamptz not null default now(),
  unique (workflow_key, member_id, ref)
);

-- Médias des formations : ajoutés depuis Construire, ou recopiés depuis Notion (ses liens expirent).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('course-images', 'course-images', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  ('course-videos', 'course-videos', true, 524288000, array['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v']),
  ('course-files', 'course-files', true, 52428800, null)
on conflict (id) do nothing;

-- ─── RLS : tout passe par le serveur, rien en accès direct ───
alter table presence.courses enable row level security;
alter table presence.course_modules enable row level security;
alter table presence.course_hashtags enable row level security;
alter table presence.course_module_hashtags enable row level security;
alter table presence.member_tags enable row level security;
alter table presence.member_tag_links enable row level security;
alter table presence.course_assignments enable row level security;
alter table presence.course_enrollments enable row level security;
alter table presence.module_progress enable row level security;
alter table presence.journal_entries enable row level security;
alter table presence.test_results enable row level security;
alter table presence.coach_memory enable row level security;
alter table presence.coach_settings enable row level security;
alter table presence.notion_sync_runs enable row level security;
alter table presence.member_activity enable row level security;
alter table presence.workflows enable row level security;
alter table presence.workflow_runs enable row level security;
revoke all on presence.courses, presence.course_modules, presence.course_hashtags, presence.course_module_hashtags,
  presence.member_tags, presence.member_tag_links, presence.course_assignments, presence.course_enrollments, presence.module_progress,
  presence.journal_entries, presence.test_results, presence.coach_memory, presence.coach_settings,
  presence.notion_sync_runs, presence.member_activity, presence.workflows, presence.workflow_runs
  from anon, authenticated;
