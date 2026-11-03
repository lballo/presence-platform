-- « Ma bucket list » dans Mon profil : des désirs, des rêves à réaliser, des lieux à découvrir.
-- Ajout seul, sans rien retirer : une liste vide pour toutes les fiches existantes.

alter table presence.members add column if not exists bucket_list jsonb not null default '[]'::jsonb;
