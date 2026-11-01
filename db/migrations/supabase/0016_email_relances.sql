-- Relances par e-mail : préférences de chaque membre, trace des envois, textes des modèles.

-- Une ligne seulement si le membre a choisi : sans ligne, la valeur par défaut de la catégorie s'applique (server/lib/email.ts).
create table presence.email_preferences (
  member_id integer not null references presence.members (id) on delete cascade,
  category varchar(30) not null,
  enabled boolean not null,
  updated_at timestamptz not null default now(),
  primary key (member_id, category)
);

-- Chaque envoi, ou chaque envoi écarté et pourquoi. Jamais l'adresse, jamais de contenu privé.
create table presence.email_sends (
  id serial primary key,
  member_id integer not null references presence.members (id) on delete cascade,
  category varchar(30) not null,
  kind varchar(12) not null, -- manuel | auto | essai
  template varchar(60) not null default '',
  course_id integer,
  module_id integer,
  subject text not null default '',
  status varchar(12) not null, -- envoye | ignore | echec
  reason varchar(40) not null default '',
  provider_id varchar(100) not null default '',
  sent_by integer,
  created_at timestamptz not null default now()
);
create index email_sends_member_idx on presence.email_sends (member_id, created_at desc);
create index email_sends_course_idx on presence.email_sends (course_id, member_id, created_at desc);

-- L'envoi automatique par e-mail est désactivé tant que l'administration ne l'active pas.
alter table presence.workflows
  add column email_enabled boolean not null default false,
  add column email_subject text not null default '',
  add column email_body text not null default '';

update presence.workflows set
  email_subject = 'Votre module de la semaine est ouvert : {{module}}',
  email_body = E'Bonjour {{prenom}},\n\nVotre nouveau module, « {{module}} », vous attend dans la formation « {{formation}} ».\n\nPrenez le temps qu’il vous faut : il reste ouvert.\n\nÀ très vite,\nLaura'
where key = 'nouveau_module';

update presence.workflows set
  email_subject = 'Votre formation vous attend : {{formation}}',
  email_body = E'Bonjour {{prenom}},\n\nVotre formation « {{formation}} » vous attend là où vous l’aviez laissée.\n\nReprenez à votre rythme : un module à la fois suffit.\n\nÀ très vite,\nLaura'
where key = 'formation_pause';

alter table presence.email_preferences enable row level security;
alter table presence.email_sends enable row level security;
revoke all on presence.email_preferences, presence.email_sends from anon, authenticated;
