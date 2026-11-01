-- Panneau d'administration : journal, signalements, contenus masqués, message de décision, suppression par anonymisation.

create table presence.admin_log (
  id serial primary key,
  actor_id integer,
  actor_name varchar(170) not null default '', -- le nom au moment de l'action : il survit à une suppression
  action varchar(80) not null,
  target_type varchar(40) not null,
  target_id integer,
  target_label text not null default '',
  detail text not null default '',
  created_at timestamptz not null default now()
);
create index admin_log_created_idx on presence.admin_log (created_at desc);

create type presence.report_kind as enum ('post', 'reply', 'message', 'hive_post');
create type presence.report_status as enum ('ouvert', 'traite', 'classe');

create table presence.reports (
  id serial primary key,
  reporter_id integer not null,
  kind presence.report_kind not null,
  target_id integer not null,
  author_id integer not null,
  reason text not null,
  snapshot text not null default '', -- le contenu au moment du signalement : il peut être modifié ou effacé ensuite
  status presence.report_status not null default 'ouvert',
  decision varchar(30) not null default '',
  decided_by integer,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (reporter_id, kind, target_id)
);
create index reports_status_idx on presence.reports (status, created_at);
create index reports_target_idx on presence.reports (kind, target_id);

alter table presence.forum_posts add column hidden_at timestamptz, add column review_note text not null default '';
alter table presence.forum_replies add column hidden_at timestamptz;
alter table presence.messages add column hidden_at timestamptz;
alter table presence.hive_posts add column hidden_at timestamptz;
alter table presence.events add column review_note text not null default '';
alter table presence.talks add column review_note text not null default '';
alter table presence.members add column deleted_at timestamptz;

-- Tout passe par le serveur : rien en accès direct.
alter table presence.admin_log enable row level security;
alter table presence.reports enable row level security;
revoke all on presence.admin_log, presence.reports from anon, authenticated;

-- Second rempart : un contenu masqué ne se lit plus qu'à l'administration (et par son auteur pour les publications).
drop policy posts_read on presence.forum_posts;
create policy posts_read on presence.forum_posts for select to authenticated using (
  presence.current_member_id() is not null and (
    author_id = presence.current_member_id()
    or presence.is_admin()
    or (hidden_at is null and hive_id is not null and presence.leads_hive(hive_id))
    or (
      hidden_at is null and status = 'published' and published_at <= now() and (ends_at is null or ends_at > now())
      and case when hive_id is null then presence.audience_includes_me(audience)
          else presence.inside_hive(hive_id) or presence.hive_is_open(hive_id) end
    )
  ));
drop policy replies_read on presence.forum_replies;
create policy replies_read on presence.forum_replies for select to authenticated using (
  (hidden_at is null or author_id = presence.current_member_id() or presence.is_admin())
  and exists (select 1 from presence.forum_posts p where p.id = post_id));
drop policy messages_read on presence.messages;
create policy messages_read on presence.messages for select to authenticated using (
  hidden_at is null and (from_id = presence.current_member_id() or to_id = presence.current_member_id()));
drop policy hive_posts_read on presence.hive_posts;
create policy hive_posts_read on presence.hive_posts for select to authenticated using (
  (hidden_at is null or author_id = presence.current_member_id() or presence.is_admin())
  and (presence.inside_hive(hive_id) or presence.hive_is_open(hive_id) and presence.current_member_id() is not null));
