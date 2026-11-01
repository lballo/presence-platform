-- Forum en espaces : espaces, annonces, hashtags, brouillons et lectures.
-- Migration additive : le site déjà en ligne continue de fonctionner tant que le nouveau code n'est pas déployé.
-- Les publications existantes sont rangées ensuite par 0010_forum_ranger_publications.sql.

create type presence.forum_space_kind as enum ('libre', 'annonces', 'video', 'opportunites');
create type presence.forum_post_status as enum ('published', 'pending', 'rejected');
create type presence.forum_audience as enum ('tous', 'collectif', 'accompagnement');

-- Le « slug » reste stable (il sert d'adresse) : nom, emoji et ordre sont modifiables par l'administratrice.
create table presence.forum_spaces (
  id serial primary key,
  slug varchar(60) not null unique,
  name varchar(80) not null,
  emoji varchar(16) not null default '',
  description text not null default '',
  group_key varchar(20) not null,
  position integer not null default 0,
  kind presence.forum_space_kind not null default 'libre',
  admin_only boolean not null default false,
  created_at timestamptz not null default now()
);

insert into presence.forum_spaces (slug, name, emoji, description, group_key, position, kind, admin_only) values
  ('bienvenue', 'Bienvenue', '🌿', 'L’esprit et les règles du réseau : bienveillance, courtoisie et confidentialité.', 'arriver', 1, 'libre', true),
  ('presentations', 'Présentations', '👋', 'Chaque membre se présente au réseau. Une courte vidéo est la bienvenue.', 'arriver', 2, 'libre', false),
  ('annonces', 'Annonces', '📣', 'Les nouvelles importantes du réseau.', 'arriver', 3, 'annonces', true),
  ('conversations', 'Conversations', '💬', 'La discussion libre entre membres.', 'echanger', 1, 'libre', false),
  ('victoires', 'Victoires', '🏆', 'Racontez vos victoires, grandes ou discrètes.', 'echanger', 2, 'libre', false),
  ('retours-video', 'Retours vidéo', '🎥', 'Partagez une vidéo et recevez des retours courtois et constructifs.', 'echanger', 3, 'video', false),
  ('entraide', 'Entraide', '🤝', 'Sollicitez l’entraide du cercle.', 'echanger', 4, 'libre', false),
  ('opportunites', 'Opportunités', '💼', 'Recrutement, financement, recherche d’associé. Chaque annonce est relue par l’équipe Présence avant d’être publiée, et la prospection commerciale n’y a pas sa place.', 'echanger', 5, 'opportunites', false);

-- Une publication appartient à un espace du réseau ou, pour une annonce de ruche, à une ruche.
-- « kind » devient facultatif : il n'est conservé que pour les publications d'avant les espaces.
alter table presence.forum_posts
  alter column kind drop not null,
  add column space_id integer references presence.forum_spaces (id),
  add column hive_id integer references presence.hives (id) on delete cascade,
  add column title varchar(200) not null default '',
  add column html text not null default '',
  add column cover_url text not null default '',
  add column attachments jsonb not null default '[]'::jsonb,
  add column status presence.forum_post_status not null default 'published',
  add column pinned_at timestamptz,
  add column audience presence.forum_audience not null default 'tous',
  add column published_at timestamptz not null default now(),
  add column ends_at timestamptz,
  add column opp_type presence.opportunity_type,
  add column facts jsonb not null default '[]'::jsonb;

-- created_at est enregistré en UTC sans fuseau.
update presence.forum_posts set published_at = created_at at time zone 'UTC';

create index forum_posts_space_idx on presence.forum_posts (space_id, published_at desc);
create index forum_posts_hive_idx on presence.forum_posts (hive_id, published_at desc);
create index forum_posts_status_idx on presence.forum_posts (status);

-- Liste partagée de hashtags, définie par l'administratrice. Elle n'est pas propre au forum :
-- les contenus de formation auront leur propre table de liaison vers cette même liste.
create table presence.hashtags (
  id serial primary key,
  name varchar(40) not null,
  color varchar(7),
  created_at timestamptz not null default now()
);
create unique index hashtags_name_unique on presence.hashtags (lower(name));

create table presence.forum_post_hashtags (
  post_id integer not null references presence.forum_posts (id) on delete cascade,
  hashtag_id integer not null references presence.hashtags (id) on delete cascade,
  primary key (post_id, hashtag_id)
);
create index forum_post_hashtags_tag_idx on presence.forum_post_hashtags (hashtag_id);

-- Lecture d'une annonce : read_at pour le point de couleur et le nombre de lectures,
-- dismissed_at quand la personne ferme l'annonce épinglée de son tableau de bord.
create table presence.forum_post_reads (
  post_id integer not null references presence.forum_posts (id) on delete cascade,
  member_id integer not null references presence.members (id) on delete cascade,
  read_at timestamptz not null default now(),
  dismissed_at timestamptz,
  primary key (post_id, member_id)
);
create index forum_post_reads_member_idx on presence.forum_post_reads (member_id);

-- « Ça m'intéresse » sur une opportunité.
create table presence.forum_post_interests (
  post_id integer not null references presence.forum_posts (id) on delete cascade,
  member_id integer not null references presence.members (id) on delete cascade,
  primary key (post_id, member_id)
);

-- Brouillon enregistré automatiquement, un par fenêtre de publication et par membre.
create table presence.forum_drafts (
  member_id integer not null references presence.members (id) on delete cascade,
  key varchar(40) not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (member_id, key)
);

-- Images du forum (couvertures et images dans le texte) : lecture publique, comme les vidéos.
-- Pièces jointes : bucket privé, liens de téléchargement signés créés par le serveur.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('forum-images', 'forum-images', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  ('forum-fichiers', 'forum-fichiers', false, 52428800, null)
on conflict (id) do nothing;
