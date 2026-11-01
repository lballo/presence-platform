-- Accueil des nouveaux membres : panneaux, tuto du coach et miel des premiers pas.
-- « onboarding_completed_at » marque désormais la fin des panneaux ; le mot de passe a sa propre date.

alter table presence.members
  add column password_chosen_at timestamptz,
  add column onboarding_step integer not null default 0,
  add column goals jsonb not null default '[]'::jsonb,
  add column goals_other text not null default '',
  add column match_profiles jsonb not null default '[]'::jsonb,
  add column match_sectors jsonb not null default '[]'::jsonb,
  add column profile_type varchar(40) not null default '',
  add column sector varchar(40) not null default '',
  add column country varchar(80) not null default '',
  add column tour jsonb not null default '{"status":"pending","step":0,"seen":[]}'::jsonb;

-- Comptes déjà ouverts : mot de passe considéré comme choisi, pas de tuto imposé.
-- Les fiches sans compte passeront par l'accueil complet quand elles seront invitées.
update presence.members set password_chosen_at = onboarding_completed_at where auth_user_id is not null;
update presence.members set tour = '{"status":"done","step":0,"seen":["/evenements","/forum","/messages","/membres","/talk-show"]}'::jsonb where auth_user_id is not null;

-- Barème : modifiable sans toucher au code. « actions » ponctuelles aujourd'hui ; d'autres pourront s'ajouter (niveaux…).
create table presence.honey_rules (
  action varchar(40) primary key,
  amount integer not null,
  position integer not null default 0,
  active boolean not null default true
);
insert into presence.honey_rules (action, amount, position) values
  ('accueil', 10, 1),
  ('tuto', 20, 2),
  ('profil', 20, 3),
  ('bienvenue_inscription', 10, 4),
  ('bienvenue_presence', 30, 5),
  ('presentation', 10, 6),
  ('presentation_video', 20, 7),
  ('premier_message', 10, 8),
  ('premier_evenement', 10, 9);

-- Une seule ligne par action et par membre pour les premiers pas (« ref » permettra plus tard des actions répétées).
-- « announced » : quantité déjà annoncée par l'animation du coach.
create table presence.honey_ledger (
  id serial primary key,
  member_id integer not null references presence.members (id) on delete cascade,
  action varchar(40) not null references presence.honey_rules (action),
  amount integer not null,
  ref varchar(80),
  announced integer not null default 0,
  created_at timestamptz not null default now()
);
create unique index honey_ledger_once on presence.honey_ledger (member_id, action, coalesce(ref, ''));

-- Comptes déjà ouverts : les panneaux sont considérés comme faits, sans animation.
insert into presence.honey_ledger (member_id, action, amount, announced)
select id, 'accueil', 10, 10 from presence.members where auth_user_id is not null and onboarding_completed_at is not null;

-- ─── RLS ─────────────────────────────────────────────────────
alter table presence.honey_rules enable row level security;
alter table presence.honey_ledger enable row level security;
revoke all on presence.honey_rules, presence.honey_ledger from anon, authenticated;
grant select on presence.honey_rules, presence.honey_ledger to authenticated;
create policy honey_rules_read on presence.honey_rules for select to authenticated using (presence.current_member_id() is not null);
create policy honey_ledger_own on presence.honey_ledger for select to authenticated using (member_id = presence.current_member_id());
grant select (country, sector, profile_type) on presence.members to authenticated;
