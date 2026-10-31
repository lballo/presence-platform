-- Connexion Supabase Auth : relie les membres à auth.users, sépare poste et rôle,
-- ajoute le type d'accès, le statut du compte et la table des invitations (7 jours).
-- Les fiches existantes sont toutes conservées.

create type presence.member_role as enum ('membre', 'organisateur', 'administrateur');
create type presence.access_type as enum ('collectif', 'individuel', 'les_deux');
create type presence.account_status as enum ('actif', 'suspendu', 'termine');

-- « role » contenait le poste (« DRH ») : il devient job_title.
alter table presence.members rename column role to job_title;

alter table presence.members
  add column role presence.member_role not null default 'membre',
  add column access_type presence.access_type not null default 'collectif',
  add column access_ends_at timestamptz,
  add column invited_at timestamptz,
  add column onboarding_completed_at timestamptz,
  add column email varchar(255),
  add column auth_user_id uuid references auth.users (id) on delete set null;

-- « status » contenait membre/organisateur/administrateur : il passe dans role, puis est remplacé.
update presence.members set role = case status
  when 'admin' then 'administrateur'::presence.member_role
  when 'organizer' then 'organisateur'::presence.member_role
  else 'membre'::presence.member_role
end;
alter table presence.members drop column status;
drop type presence.member_status;
alter table presence.members add column status presence.account_status not null default 'actif';

-- Fiches existantes : actives, sans date de fin, considérées comme déjà accueillies.
update presence.members set
  access_type = case when is_coached or role = 'administrateur' then 'les_deux'::presence.access_type else 'collectif'::presence.access_type end,
  onboarding_completed_at = now();

create unique index members_auth_user_id_unique on presence.members (auth_user_id);
create unique index members_email_unique on presence.members (lower(email));

-- Plus aucune donnée n'est rattachée d'office au membre n° 1.
alter table presence.speeches alter column member_id drop default;

-- Une opportunité peut désormais être refusée par l'équipe.
alter type presence.opportunity_status add value if not exists 'rejected';

-- Jetons d'invitation : valables 7 jours ; seule leur empreinte SHA-256 est stockée.
-- Le lien Supabase (limité à 24 h) n'est produit qu'au clic sur le bouton de la page d'invitation.
create table presence.invitations (
  id serial primary key,
  member_id integer not null references presence.members (id) on delete cascade,
  token_hash varchar(64) not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index invitations_member_idx on presence.invitations (member_id);
alter table presence.invitations enable row level security;
