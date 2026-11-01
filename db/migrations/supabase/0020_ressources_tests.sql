-- Mon parcours › Mes ressources : le catalogue de tests, copie de Notion (Notion fait foi), et les résultats des membres.
-- Mon journal personnel : une réponse peut être marquée « À travailler en coaching ».
-- Cette migration ne retire rien : l'ancien code continue de fonctionner jusqu'au déploiement.

-- ─── Copie de Notion ─────────────────────────────────────────
create table presence.test_themes (
  id serial primary key,
  notion_page_id varchar(64) not null unique,
  name varchar(120) not null, -- « Thème » : Personnalité, Drivers, Stress…
  title varchar(200) not null default '', -- « Titre dans l'app »
  profile_label varchar(120) not null default '', -- « Dans le profil »
  emoji varchar(16) not null default '',
  position integer not null default 0,
  status presence.content_status not null default 'brouillon',
  intro jsonb not null default '[]'::jsonb, -- l'introduction, écrite dans la page Notion
  notion_edited_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table presence.tests (
  id serial primary key,
  notion_page_id varchar(64) not null unique,
  title varchar(200) not null,
  description text not null default '',
  duration_min integer,
  result_type varchar(40) not null default '',
  can_retake boolean not null default false,
  saves_result boolean not null default false, -- « Résultat enregistré » : coché dans Notion quand le fichier envoie son résultat
  link_url text not null default '', -- « Lien » : un test déjà en ligne ailleurs
  status presence.content_status not null default 'brouillon',
  html_path text not null default '', -- le fichier, dans le bucket privé test-files
  html_name varchar(200) not null default '',
  html_updated_at timestamptz,
  html_has_result_block boolean not null default false, -- le fichier contient le bloc qui envoie le résultat
  notion_file_key text not null default '', -- le fichier de Notion déjà recopié
  issues jsonb not null default '[]'::jsonb,
  notion_edited_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table presence.test_theme_links (
  test_id integer not null references presence.tests (id) on delete cascade,
  theme_id integer not null references presence.test_themes (id) on delete cascade,
  primary key (test_id, theme_id)
);
create index test_theme_links_theme_idx on presence.test_theme_links (theme_id);

create table presence.test_lesson_links (
  test_id integer not null references presence.tests (id) on delete cascade,
  lesson_id integer not null references presence.course_lessons (id) on delete cascade,
  primary key (test_id, lesson_id)
);
create index test_lesson_links_lesson_idx on presence.test_lesson_links (lesson_id);

create table presence.test_hashtags (
  test_id integer not null references presence.tests (id) on delete cascade,
  hashtag_id integer not null references presence.hashtags (id) on delete cascade,
  primary key (test_id, hashtag_id)
);
create index test_hashtags_tag_idx on presence.test_hashtags (hashtag_id);

-- ─── Suivi du membre ─────────────────────────────────────────
-- Les passages rejoignent les résultats existants, chiffrés. Sans résultat renvoyé par le test, result_enc reste vide.
alter table presence.test_results add column test_id integer references presence.tests (id) on delete set null;
create index test_results_member_test_idx on presence.test_results (member_id, test_id, passed_at desc);
create index test_results_test_idx on presence.test_results (test_id);

-- Une ligne : le membre montre ce thème de son profil aux autres membres. Sans ligne, c'est privé.
create table presence.profile_theme_shares (
  member_id integer not null references presence.members (id) on delete cascade,
  theme_id integer not null references presence.test_themes (id) on delete cascade,
  shared_at timestamptz not null default now(),
  primary key (member_id, theme_id)
);
create index profile_theme_shares_theme_idx on presence.profile_theme_shares (theme_id);

-- ─── Journal ─────────────────────────────────────────────────
-- kind prépare les entrées libres et les questions du jour : elles n'auront ni leçon, ni question de leçon.
-- shared_at existe déjà : c'est l'option « À travailler en coaching avec Laura ».
alter table presence.journal_entries
  add column kind varchar(20) not null default 'exercice',
  add column coaching_discussed_at timestamptz;
update presence.journal_entries set kind = 'reflexion' where question_id = 'note';

-- ─── Fichiers des tests : privés, servis un à un par l'application ─
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('test-files', 'test-files', false, 15728640, array['text/html'])
on conflict (id) do nothing;

-- ─── RLS : tout passe par le serveur, rien en accès direct ───
alter table presence.test_themes enable row level security;
alter table presence.tests enable row level security;
alter table presence.test_theme_links enable row level security;
alter table presence.test_lesson_links enable row level security;
alter table presence.test_hashtags enable row level security;
alter table presence.profile_theme_shares enable row level security;
revoke all on presence.test_themes, presence.tests, presence.test_theme_links, presence.test_lesson_links, presence.test_hashtags, presence.profile_theme_shares
  from anon, authenticated;
