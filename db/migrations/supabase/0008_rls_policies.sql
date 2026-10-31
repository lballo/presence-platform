-- RLS du schéma presence, alignée sur server/lib/permissions.ts.
-- Le serveur se connecte en propriétaire des tables et passe par can() ; ces règles sont le second
-- rempart pour tout accès avec le jeton d'un membre (rôle « authenticated »). « anon » n'a aucun accès.
-- Les colonnes sensibles (e-mail, adresses et liens d'événements, Espace Rencontre…) ne sont pas accordées.

-- ─── Activation sur toutes les tables du schéma ──────────────
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'presence' loop
    execute format('alter table presence.%I enable row level security', t.tablename);
  end loop;
end $$;

-- ─── Fonctions d'aide ────────────────────────────────────────
create or replace function presence.current_member_id() returns integer
language sql stable security definer set search_path = '' as $$
  select m.id from presence.members m
  where m.auth_user_id = auth.uid()
    and m.status = 'actif'
    and (m.access_ends_at is null or m.access_ends_at > now())
$$;

create or replace function presence.current_member_role() returns text
language sql stable security definer set search_path = '' as $$
  select m.role::text from presence.members m where m.id = presence.current_member_id()
$$;

create or replace function presence.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(presence.current_member_role() = 'administrateur', false)
$$;

create or replace function presence.can_publish_events() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(presence.current_member_role() in ('organisateur', 'administrateur'), false)
$$;

create or replace function presence.hive_role(p_hive integer) returns text
language sql stable security definer set search_path = '' as $$
  select hm.role::text from presence.hive_members hm
  where hm.hive_id = p_hive and hm.member_id = presence.current_member_id()
$$;

create or replace function presence.leads_hive(p_hive integer) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(presence.hive_role(p_hive) in ('founder', 'leader'), false)
$$;

create or replace function presence.inside_hive(p_hive integer) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(presence.hive_role(p_hive) in ('founder', 'leader', 'member'), false)
$$;

create or replace function presence.hive_is_open(p_hive integer) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select h.access = 'libre' from presence.hives h where h.id = p_hive), false)
$$;

-- Personne ne s'attribue un rôle, un statut ou un accès : seul un administrateur modifie ces champs.
-- Pas de « security definer » ici : current_user doit rester le rôle de l'appelant.
create or replace function presence.guard_member_admin_fields() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated' and not presence.is_admin() and (
    new.role is distinct from old.role or new.status is distinct from old.status
    or new.access_type is distinct from old.access_type or new.access_ends_at is distinct from old.access_ends_at
  ) then
    raise exception 'Réservé aux administrateurs.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger members_guard_admin_fields before update on presence.members
  for each row execute function presence.guard_member_admin_fields();

revoke all on function presence.current_member_id(), presence.current_member_role(), presence.is_admin(), presence.can_publish_events(),
  presence.hive_role(integer), presence.leads_hive(integer), presence.inside_hive(integer), presence.hive_is_open(integer),
  presence.guard_member_admin_fields() from public, anon;
grant execute on function presence.current_member_id(), presence.current_member_role(), presence.is_admin(), presence.can_publish_events(),
  presence.hive_role(integer), presence.leads_hive(integer), presence.inside_hive(integer), presence.hive_is_open(integer) to authenticated;

-- ─── Droits de base ──────────────────────────────────────────
revoke all on all tables in schema presence from anon, authenticated;
revoke all on all sequences in schema presence from anon, authenticated;
grant usage on schema presence to authenticated;
grant usage on all sequences in schema presence to authenticated;
grant select, insert, update, delete on
  presence.advice, presence.coach_messages, presence.coaching_sessions, presence.event_registrations,
  presence.forum_likes, presence.forum_posts, presence.forum_replies, presence.hive_members, presence.hive_posts,
  presence.hive_resources, presence.hives, presence.messages, presence.opportunities, presence.opportunity_interests,
  presence.speech_scores, presence.speeches, presence.swipes, presence.talks
  to authenticated;
-- presence.invitations : aucun droit, tout passe par le serveur.

-- members : ni e-mail, ni identifiant d'authentification, ni candidature, ni Espace Rencontre.
grant select (id, first_name, last_name, gender, job_title, org, city, zone, photo_url, bio, intention, ambition, passions,
  linkedin_url, "values", intents, pole, langs, visible_in_directory, role, created_at) on presence.members to authenticated;
grant update (first_name, last_name, job_title, city, bio, intention, ambition, passions, linkedin_url, "values", intents, langs,
  visible_in_directory, rencontre_enabled, rencontre_pref, rencontre_blurb, role, status, access_type, access_ends_at) on presence.members to authenticated;

-- events : l'adresse et le lien de visio ne sortent que par le serveur (personnes inscrites).
grant select (id, kind, hive_id, host_id, title, description, starts_at, duration_min, days, city, "where", lang, max_seats,
  featured, photo_url, with_line, in_agenda, live, created_at, status) on presence.events to authenticated;
grant insert, delete on presence.events to authenticated;
grant update (kind, title, description, starts_at, duration_min, city, "where", address, meeting_url, max_seats, status) on presence.events to authenticated;

-- ─── Règles ──────────────────────────────────────────────────
-- Membres
create policy members_read on presence.members for select to authenticated using (presence.current_member_id() is not null);
create policy members_update_self on presence.members for update to authenticated using (id = presence.current_member_id()) with check (id = presence.current_member_id());
create policy members_admin_update on presence.members for update to authenticated using (presence.is_admin()) with check (presence.is_admin());

-- Espace personnel : coach, coaching, analyses vidéo
create policy coach_own on presence.coach_messages for all to authenticated using (member_id = presence.current_member_id()) with check (member_id = presence.current_member_id());
create policy coaching_read_own on presence.coaching_sessions for select to authenticated using (member_id = presence.current_member_id() or presence.is_admin());
create policy coaching_admin_insert on presence.coaching_sessions for insert to authenticated with check (presence.is_admin());
create policy coaching_admin_update on presence.coaching_sessions for update to authenticated using (presence.is_admin()) with check (presence.is_admin());
create policy coaching_admin_delete on presence.coaching_sessions for delete to authenticated using (presence.is_admin());
create policy speeches_own on presence.speeches for all to authenticated using (member_id = presence.current_member_id()) with check (member_id = presence.current_member_id());
create policy scores_own on presence.speech_scores for all to authenticated
  using (exists (select 1 from presence.speeches s where s.id = "speechId" and s.member_id = presence.current_member_id()))
  with check (exists (select 1 from presence.speeches s where s.id = "speechId" and s.member_id = presence.current_member_id()));
create policy advice_own on presence.advice for all to authenticated
  using (exists (select 1 from presence.speeches s where s.id = "speechId" and s.member_id = presence.current_member_id()))
  with check (exists (select 1 from presence.speeches s where s.id = "speechId" and s.member_id = presence.current_member_id()));

-- Événements : membre sur validation, organisateur et administrateur en direct ; ruche : ses leaders.
create policy events_read on presence.events for select to authenticated using (
  presence.current_member_id() is not null and (status = 'published' or host_id = presence.current_member_id() or presence.is_admin()));
create policy events_propose on presence.events for insert to authenticated with check (
  host_id = presence.current_member_id() and (
    (hive_id is null and (status = 'pending' or presence.can_publish_events()))
    or (hive_id is not null and (presence.leads_hive(hive_id) or presence.is_admin()))));
create policy events_update on presence.events for update to authenticated
  using (presence.is_admin()
    or (host_id = presence.current_member_id() and hive_id is null and presence.can_publish_events())
    or (host_id = presence.current_member_id() and hive_id is not null and presence.leads_hive(hive_id)))
  with check (presence.is_admin()
    or (host_id = presence.current_member_id() and hive_id is null and presence.can_publish_events())
    or (host_id = presence.current_member_id() and hive_id is not null and presence.leads_hive(hive_id)));
create policy events_delete on presence.events for delete to authenticated using (presence.is_admin()
  or (host_id = presence.current_member_id() and status <> 'published')
  or (host_id = presence.current_member_id() and hive_id is null and presence.can_publish_events())
  or (host_id = presence.current_member_id() and hive_id is not null and presence.leads_hive(hive_id)));
create policy registrations_read on presence.event_registrations for select to authenticated using (presence.current_member_id() is not null);
create policy registrations_own_insert on presence.event_registrations for insert to authenticated with check (member_id = presence.current_member_id());
create policy registrations_own_delete on presence.event_registrations for delete to authenticated using (member_id = presence.current_member_id());

-- Forum : chacun ses contenus ; suppression aussi par l'administrateur (modération).
create policy posts_read on presence.forum_posts for select to authenticated using (presence.current_member_id() is not null);
create policy posts_insert on presence.forum_posts for insert to authenticated with check (author_id = presence.current_member_id());
create policy posts_update on presence.forum_posts for update to authenticated using (author_id = presence.current_member_id()) with check (author_id = presence.current_member_id());
create policy posts_delete on presence.forum_posts for delete to authenticated using (author_id = presence.current_member_id() or presence.is_admin());
create policy replies_read on presence.forum_replies for select to authenticated using (presence.current_member_id() is not null);
create policy replies_insert on presence.forum_replies for insert to authenticated with check (author_id = presence.current_member_id());
create policy replies_update on presence.forum_replies for update to authenticated using (author_id = presence.current_member_id()) with check (author_id = presence.current_member_id());
create policy replies_delete on presence.forum_replies for delete to authenticated using (author_id = presence.current_member_id() or presence.is_admin());
create policy likes_read on presence.forum_likes for select to authenticated using (presence.current_member_id() is not null);
create policy likes_insert on presence.forum_likes for insert to authenticated with check (member_id = presence.current_member_id());
create policy likes_delete on presence.forum_likes for delete to authenticated using (member_id = presence.current_member_id());

-- Opportunités : relues par l'administrateur avant publication.
create policy opportunities_read on presence.opportunities for select to authenticated using (
  presence.current_member_id() is not null and (status = 'published' or author_id = presence.current_member_id() or presence.is_admin()));
create policy opportunities_insert on presence.opportunities for insert to authenticated with check (author_id = presence.current_member_id() and status = 'pending');
create policy opportunities_admin_update on presence.opportunities for update to authenticated using (presence.is_admin()) with check (presence.is_admin());
create policy opportunities_delete on presence.opportunities for delete to authenticated using (presence.is_admin() or (author_id = presence.current_member_id() and status = 'pending'));
create policy interests_read on presence.opportunity_interests for select to authenticated using (presence.current_member_id() is not null);
create policy interests_insert on presence.opportunity_interests for insert to authenticated with check (member_id = presence.current_member_id());
create policy interests_delete on presence.opportunity_interests for delete to authenticated using (member_id = presence.current_member_id());

-- Talks : publiés après validation de l'administrateur.
create policy talks_read on presence.talks for select to authenticated using (
  presence.current_member_id() is not null and (status = 'published' or speaker_id = presence.current_member_id() or presence.is_admin()));
create policy talks_insert on presence.talks for insert to authenticated with check (speaker_id = presence.current_member_id() and status = 'pending');
create policy talks_admin_update on presence.talks for update to authenticated using (presence.is_admin()) with check (presence.is_admin());
create policy talks_delete on presence.talks for delete to authenticated using (presence.is_admin() or (speaker_id = presence.current_member_id() and status = 'pending'));

-- Messages et matching : uniquement les personnes concernées.
create policy messages_read on presence.messages for select to authenticated using (from_id = presence.current_member_id() or to_id = presence.current_member_id());
create policy messages_insert on presence.messages for insert to authenticated with check (from_id = presence.current_member_id());
create policy messages_update on presence.messages for update to authenticated using (from_id = presence.current_member_id() or to_id = presence.current_member_id()) with check (from_id = presence.current_member_id() or to_id = presence.current_member_id());
create policy swipes_read on presence.swipes for select to authenticated using (from_id = presence.current_member_id() or (to_id = presence.current_member_id() and liked));
create policy swipes_insert on presence.swipes for insert to authenticated with check (from_id = presence.current_member_id());
create policy swipes_update on presence.swipes for update to authenticated using (from_id = presence.current_member_id()) with check (from_id = presence.current_member_id());
create policy swipes_delete on presence.swipes for delete to authenticated using (from_id = presence.current_member_id());

-- Ruches : tout membre en crée ; fondatrice, leaders et administrateur la gèrent ; seul l'administrateur la supprime.
create policy hives_read on presence.hives for select to authenticated using (presence.current_member_id() is not null);
create policy hives_insert on presence.hives for insert to authenticated with check (founder_id = presence.current_member_id());
create policy hives_update on presence.hives for update to authenticated using (presence.leads_hive(id) or presence.is_admin()) with check (presence.leads_hive(id) or presence.is_admin());
create policy hives_admin_delete on presence.hives for delete to authenticated using (presence.is_admin());
create policy hive_members_read on presence.hive_members for select to authenticated using (presence.current_member_id() is not null);
create policy hive_members_join on presence.hive_members for insert to authenticated with check (
  member_id = presence.current_member_id() and (
    (role = 'founder' and exists (select 1 from presence.hives h where h.id = hive_id and h.founder_id = presence.current_member_id()))
    or (role = 'member' and presence.hive_is_open(hive_id))
    or role = 'pending'));
-- Valider un membre ou nommer un leader. Retirer un leader est réservé à la fondatrice et à l'administrateur.
create policy hive_members_manage on presence.hive_members for update to authenticated
  using ((presence.leads_hive(hive_id) or presence.is_admin()) and role <> 'founder' and (role <> 'leader' or presence.hive_role(hive_id) = 'founder' or presence.is_admin()))
  with check ((presence.leads_hive(hive_id) or presence.is_admin()) and role in ('member', 'leader'));
create policy hive_members_leave on presence.hive_members for delete to authenticated using (
  (member_id = presence.current_member_id() and role <> 'founder')
  or ((presence.leads_hive(hive_id) or presence.is_admin()) and role = 'pending')
  or presence.is_admin());
create policy hive_posts_read on presence.hive_posts for select to authenticated using (presence.inside_hive(hive_id) or presence.hive_is_open(hive_id) and presence.current_member_id() is not null or presence.is_admin());
create policy hive_posts_insert on presence.hive_posts for insert to authenticated with check (author_id = presence.current_member_id() and presence.inside_hive(hive_id));
create policy hive_posts_delete on presence.hive_posts for delete to authenticated using (presence.is_admin());
create policy hive_resources_read on presence.hive_resources for select to authenticated using (presence.inside_hive(hive_id) or presence.hive_is_open(hive_id) and presence.current_member_id() is not null or presence.is_admin());
create policy hive_resources_insert on presence.hive_resources for insert to authenticated with check (author_id = presence.current_member_id() and presence.inside_hive(hive_id));
create policy hive_resources_delete on presence.hive_resources for delete to authenticated using (presence.is_admin());
