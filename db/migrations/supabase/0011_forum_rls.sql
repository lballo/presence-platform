-- RLS du forum en espaces, alignée sur server/lib/forumAccess.ts. Même principe que 0008 :
-- le serveur passe par can() et ces règles sont le second rempart pour un accès avec le jeton d'un membre.
-- Publier ou modifier passe uniquement par le serveur : il nettoie le texte mis en forme et applique
-- les règles des espaces (réservés, relus avant publication).

alter table presence.forum_spaces enable row level security;
alter table presence.hashtags enable row level security;
alter table presence.forum_post_hashtags enable row level security;
alter table presence.forum_post_reads enable row level security;
alter table presence.forum_post_interests enable row level security;
alter table presence.forum_drafts enable row level security;

revoke all on presence.forum_spaces, presence.hashtags, presence.forum_post_hashtags, presence.forum_post_reads,
  presence.forum_post_interests, presence.forum_drafts from anon, authenticated;
revoke all on all sequences in schema presence from anon;
grant select on presence.forum_spaces, presence.hashtags, presence.forum_post_hashtags, presence.forum_post_reads,
  presence.forum_post_interests to authenticated;
-- presence.forum_drafts : aucun droit, tout passe par le serveur.

-- Le public visé d'une annonce concerne-t-il le membre connecté ?
create or replace function presence.audience_includes_me(p_audience presence.forum_audience) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(p_audience = 'tous' or exists (
    select 1 from presence.members m
    where m.id = presence.current_member_id()
      and (m.access_type = 'les_deux'
        or (p_audience = 'collectif' and m.access_type = 'collectif')
        or (p_audience = 'accompagnement' and m.access_type = 'individuel'))
  ), false)
$$;
revoke all on function presence.audience_includes_me(presence.forum_audience) from public, anon;
grant execute on function presence.audience_includes_me(presence.forum_audience) to authenticated;

-- Publications : l'auteur et l'administrateur voient tout ; les leaders, les annonces de leur ruche ;
-- les autres, ce qui est en ligne et les concerne.
revoke insert, update on presence.forum_posts from authenticated;
drop policy posts_insert on presence.forum_posts;
drop policy posts_update on presence.forum_posts;
drop policy posts_read on presence.forum_posts;
create policy posts_read on presence.forum_posts for select to authenticated using (
  presence.current_member_id() is not null and (
    author_id = presence.current_member_id()
    or presence.is_admin()
    or (hive_id is not null and presence.leads_hive(hive_id))
    or (
      status = 'published' and published_at <= now() and (ends_at is null or ends_at > now())
      and case when hive_id is null then presence.audience_includes_me(audience)
          else presence.inside_hive(hive_id) or presence.hive_is_open(hive_id) end
    )
  ));

-- Réponses et réactions : seulement sur une publication que le membre peut voir (la RLS de forum_posts s'applique ici).
drop policy replies_read on presence.forum_replies;
create policy replies_read on presence.forum_replies for select to authenticated using (
  exists (select 1 from presence.forum_posts p where p.id = post_id));
drop policy replies_insert on presence.forum_replies;
create policy replies_insert on presence.forum_replies for insert to authenticated with check (
  author_id = presence.current_member_id() and exists (select 1 from presence.forum_posts p where p.id = post_id and p.status = 'published'));
drop policy likes_read on presence.forum_likes;
create policy likes_read on presence.forum_likes for select to authenticated using (
  exists (select 1 from presence.forum_posts p where p.id = post_id));
drop policy likes_insert on presence.forum_likes;
create policy likes_insert on presence.forum_likes for insert to authenticated with check (
  member_id = presence.current_member_id() and exists (select 1 from presence.forum_posts p where p.id = post_id and p.status = 'published'));

create policy forum_spaces_read on presence.forum_spaces for select to authenticated using (presence.current_member_id() is not null);
create policy hashtags_read on presence.hashtags for select to authenticated using (presence.current_member_id() is not null);
create policy post_hashtags_read on presence.forum_post_hashtags for select to authenticated using (
  exists (select 1 from presence.forum_posts p where p.id = post_id));
create policy post_reads_own on presence.forum_post_reads for select to authenticated using (member_id = presence.current_member_id());
create policy post_interests_read on presence.forum_post_interests for select to authenticated using (
  exists (select 1 from presence.forum_posts p where p.id = post_id));
