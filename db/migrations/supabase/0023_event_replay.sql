-- Replays : un événement en ligne (visio ou salon live) peut recevoir son enregistrement après coup.
-- Lien vers la vidéo (YouTube, Vimeo, Google Drive, Loom…) ou fichier envoyé sur Présence ; visible des membres.
-- Ajout seul, sans rien retirer : aucun replay pour les événements existants.

alter table presence.events add column if not exists replay_url text;
alter table presence.events add column if not exists replay_added_at timestamptz;
