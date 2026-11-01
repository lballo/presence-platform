-- Formations à trois niveaux : Formation → Section → Leçon, comme dans Notion.
-- Cette migration ne retire rien : course_modules et module_progress restent en place, le temps que la reprise
-- de la progression soit vérifiée (server/lib/courseResume.ts). L'ancien code continue de fonctionner jusqu'au déploiement.

create type presence.lesson_type as enum ('contenu', 'video', 'exercice', 'test', 'defi');

-- ─── Copie de Notion ─────────────────────────────────────────
create table presence.course_sections (
  id serial primary key,
  course_id integer not null references presence.courses (id) on delete cascade,
  notion_page_id varchar(64) not null unique,
  title varchar(200) not null,
  position integer not null default 0, -- « Ordre » dans Notion : fixe la semaine d'ouverture
  status presence.content_status not null default 'brouillon',
  intention text not null default '',
  content jsonb not null default '{}'::jsonb,
  issues jsonb not null default '[]'::jsonb,
  notion_edited_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index course_sections_course_idx on presence.course_sections (course_id, position);

create table presence.course_lessons (
  id serial primary key,
  section_id integer not null references presence.course_sections (id) on delete cascade,
  notion_page_id varchar(64) not null unique,
  title varchar(200) not null,
  position integer not null default 0, -- « Ordre » dans Notion : place dans la section
  type presence.lesson_type not null default 'contenu',
  status presence.content_status not null default 'brouillon',
  intention text not null default '',
  duration_min integer,
  video_url text not null default '',
  test_url text not null default '',
  content jsonb not null default '{}'::jsonb,
  issues jsonb not null default '[]'::jsonb,
  legacy_module_id integer unique, -- l'ancien module repris sur cette leçon : garde les anciennes adresses valables
  notion_edited_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index course_lessons_section_idx on presence.course_lessons (section_id, position);

create table presence.course_section_hashtags (
  section_id integer not null references presence.course_sections (id) on delete cascade,
  hashtag_id integer not null references presence.hashtags (id) on delete cascade,
  primary key (section_id, hashtag_id)
);
create index course_section_hashtags_tag_idx on presence.course_section_hashtags (hashtag_id);

create table presence.course_lesson_hashtags (
  lesson_id integer not null references presence.course_lessons (id) on delete cascade,
  hashtag_id integer not null references presence.hashtags (id) on delete cascade,
  primary key (lesson_id, hashtag_id)
);
create index course_lesson_hashtags_tag_idx on presence.course_lesson_hashtags (hashtag_id);

-- ─── Suivi du membre ─────────────────────────────────────────
create table presence.section_progress (
  member_id integer not null references presence.members (id) on delete cascade,
  section_id integer not null references presence.course_sections (id) on delete cascade,
  opened_at timestamptz,
  opened_via_full_access boolean not null default false, -- ouverte avant sa date : se referme si l'accès complet est retiré
  completed_at timestamptz,
  challenge_done_at timestamptz,
  challenge_note_enc text not null default '',
  primary key (member_id, section_id)
);
create index section_progress_section_idx on presence.section_progress (section_id);

create table presence.lesson_progress (
  member_id integer not null references presence.members (id) on delete cascade,
  lesson_id integer not null references presence.course_lessons (id) on delete cascade,
  opened_at timestamptz,
  completed_at timestamptz,
  challenge_done_at timestamptz,
  challenge_note_enc text not null default '',
  primary key (member_id, lesson_id)
);
create index lesson_progress_lesson_idx on presence.lesson_progress (lesson_id);

-- ─── Données privées : rattachées à la leçon, avec une copie du titre ─
alter table presence.journal_entries
  add column lesson_id integer references presence.course_lessons (id) on delete set null,
  add column lesson_title varchar(200) not null default '';
update presence.journal_entries set lesson_title = module_title;
create unique index journal_entries_member_lesson_question_key on presence.journal_entries (member_id, lesson_id, question_id);

alter table presence.test_results
  add column lesson_id integer references presence.course_lessons (id) on delete set null,
  add column lesson_title varchar(200) not null default '';
update presence.test_results set lesson_title = module_title;

-- Chaque souvenir vient d'une entrée précise (origin) : modifier l'entrée le met à jour, sans jamais toucher
-- à ce que le membre a corrigé. Un souvenir effacé ne garde que son origine, pour ne pas revenir tout seul.
alter table presence.coach_memory
  add column section_id integer references presence.course_sections (id) on delete set null,
  add column lesson_id integer references presence.course_lessons (id) on delete set null,
  add column origin varchar(60),
  add column erased_at timestamptz;
create unique index coach_memory_member_origin_key on presence.coach_memory (member_id, origin);

alter table presence.member_activity
  add column section_id integer,
  add column lesson_id integer;

alter table presence.email_sends
  add column section_id integer,
  add column lesson_id integer;

-- ─── Relances : « nouveau module » devient « nouvelle section », e-mail automatique coupé ─
insert into presence.workflows (key, name, description, active, title, body, delay_days, email_enabled, email_subject, email_body)
select 'nouvelle_section', 'Nouvelle section disponible', 'Prévient le membre le jour où sa section de la semaine s’ouvre.', active,
  'Votre section de la semaine est ouverte : {{section}}', 'Elle vous attend dans la formation « {{formation}} ».', 0, false,
  'Votre section de la semaine est ouverte : {{section}}',
  E'Bonjour {{prenom}},\n\nVotre nouvelle section, « {{section}} », vous attend dans la formation « {{formation}} ».\n\nPrenez le temps qu’il vous faut : elle reste ouverte.\n\nÀ très vite,\nLaura'
from presence.workflows where key = 'nouveau_module';
update presence.workflow_runs set workflow_key = 'nouvelle_section' where workflow_key = 'nouveau_module';
delete from presence.workflows where key = 'nouveau_module';

update presence.workflows set email_body = E'Bonjour {{prenom}},\n\nVotre formation « {{formation}} » vous attend là où vous l’aviez laissée.\n\nReprenez à votre rythme : une leçon à la fois suffit.\n\nÀ très vite,\nLaura'
where key = 'formation_pause' and email_body like '%un module à la fois suffit%';

-- ─── RLS : tout passe par le serveur, rien en accès direct ───
alter table presence.course_sections enable row level security;
alter table presence.course_lessons enable row level security;
alter table presence.course_section_hashtags enable row level security;
alter table presence.course_lesson_hashtags enable row level security;
alter table presence.section_progress enable row level security;
alter table presence.lesson_progress enable row level security;
revoke all on presence.course_sections, presence.course_lessons, presence.course_section_hashtags, presence.course_lesson_hashtags,
  presence.section_progress, presence.lesson_progress
  from anon, authenticated;
