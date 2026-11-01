-- Range les publications existantes dans leur espace. À passer une fois le nouveau code en ligne ;
-- le script peut être rejoué sans créer de doublon.
-- Les anciennes tables opportunities et opportunity_interests sont conservées, mais ne sont plus lues.

update presence.forum_posts p
set space_id = s.id
from presence.forum_spaces s
where p.space_id is null and p.hive_id is null
  and s.slug = case p.kind when 'victoire' then 'victoires' when 'video' then 'retours-video' else 'entraide' end;

insert into presence.forum_posts (author_id, space_id, title, text, status, opp_type, facts, created_at, published_at)
select o.author_id, s.id, o.title, o.text, o.status::text::presence.forum_post_status, o.type, o.facts, o.created_at, o.created_at at time zone 'UTC'
from presence.opportunities o
cross join (select id from presence.forum_spaces where slug = 'opportunites') s
where not exists (
  select 1 from presence.forum_posts p
  where p.space_id = s.id and p.author_id = o.author_id and p.title = o.title and p.created_at = o.created_at
);

insert into presence.forum_post_interests (post_id, member_id)
select p.id, i.member_id
from presence.opportunity_interests i
join presence.opportunities o on o.id = i.opportunity_id
join presence.forum_posts p on p.opp_type is not null and p.author_id = o.author_id and p.title = o.title and p.created_at = o.created_at
on conflict do nothing;
