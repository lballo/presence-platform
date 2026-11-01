# Présence — plateforme réseau (v1)

Plateforme communautaire de Laura Ballo : tableau de bord, analyse vidéo (Présence IA, reprise de PresenceAI), Talk Show, Forum & opportunités, Matching, Annuaire des membres, Ruches (communautés et ruches projet) et Événements.

**État v1 :** pas d'authentification (membre courant fixé par configuration), onglet « Mon parcours » laissé vide, données de démonstration fournies.

## Stack

- Front : Vite 7 · React 19 · TypeScript · Tailwind 3 · react-router 7
- API : Hono + tRPC 11 (`api/`), même serveur en dev et en prod
- Base : PostgreSQL via Drizzle ORM (`db/schema.ts`)
- IA : Gemini 2.5 Flash (analyse vidéo + Coach IA) — optionnel, fonctionne en mode dégradé sans clé

## Installation

```bash
npm install --legacy-peer-deps
cp .env.example .env        # puis renseigner les valeurs
npm run db:push             # crée les tables
npm run db:seed             # charge les données de démo (14 membres, ruches, événements…)
npm run dev                 # http://localhost:3000
```

### Variables d'environnement (`.env`)

| Variable | Rôle |
|---|---|
| `DATABASE_URL` | Postgres, ex. `postgres://user:pass@localhost:5432/presence` (Neon/Supabase acceptés) |
| `DB_SCHEMA` | Schéma Postgres à utiliser (vide = `public`). Sur Supabase : `presence` (tables créées par `db/migrations/0000_init.sql` dans ce schéma ; `db:push` le respecte aussi). |
| `GEMINI_API_KEY` | Clé Google AI Studio pour l'analyse vidéo et le Coach IA. Sans clé : coach en mode réponses fixes, analyse vidéo indisponible. |
| `APP_URL` | Adresse publique de l'application : base des liens d'invitation. |
| `MEMBERSHIP_URL` | Page qui explique comment revenir, sur l'écran « Accès terminé », et bloc « Découvrir le réseau » des pages d'événements. Sans elle, le bouton propose d'écrire à Laura. |
| `WELCOME_VIDEO_URL` | Courte vidéo de Laura dans le premier panneau d'accueil. Vide : panneau sans vidéo. |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Connexion des membres (obligatoires), invitations, et envoi des vidéos dans Supabase Storage. |
| `CALENDLY_URL` | Lien de réservation des séances de coaching (bandeau du tableau de bord) |
| `CALENDLY_EXPLO_URL` | Lien « Réserver votre session exploratoire » (membres non accompagnés) |

### Postgres en local (si besoin)

```bash
initdb -D ./pgdata -U presence --auth=trust
pg_ctl -D ./pgdata -o '-p 5432' start
createdb -U presence presence
# DATABASE_URL=postgres://presence@localhost:5432/presence
```

## Production

**Render (recommandé, comme PresenceAI)** : New → Blueprint → ce dépôt ; `render.yaml` décrit le service. Renseigner `DATABASE_URL` (Supabase, URL « pooler ») et `GEMINI_API_KEY` dans les variables du service.

**Vercel** : importer le dépôt (preset Vite, `vercel.json` et `api/index.ts` font le reste) et renseigner les mêmes variables, avec `DB_SCHEMA=presence` et l'URL Supabase « Transaction pooler » (port 6543). Limite : les requêtes y sont plafonnées à 4,5 Mo, donc l'analyse vidéo ne fonctionne pas sur Vercel — tout le reste oui.

**Serveur Node classique :**

```bash
npm run build     # dist/public (front) + dist/boot.js (serveur)
npm start         # sert le tout sur PORT (3000 par défaut)
```

## Organisation du code

```
server/
  boot.ts          serveur Hono (sert /api/trpc et le front en prod)
  router.ts        assemblage des routeurs tRPC
  routers/         members, forum, hashtags, hives, events, matching, coach, speech, dashboard,
                   onboarding, honey, notifications, reports, admin
  lib/             intents (7 intentions + Espace Rencontre), gemini, coach, format
db/
  schema.ts        tables Drizzle · relations.ts · seed.ts
api/index.ts       point d’entrée Vercel (fonction serverless) — voir vercel.json
src/
  pages/           Dashboard, Parcours (vide), PresenceIA, Analysis, TalkShow, Forum,
                   Matching, Membres, Ruches, Ruche, Evenements, EventPage, EventManage,
                   onboarding/Accueil, admin/ (panneau d'administration)
  components/      Layout (menu + thème clair/sombre), Avatar, ScoreRing, ui/, forum/, events/, onboarding/
  content/         accueil.ts : les textes de l'accueil, repris dans docs/textes-accueil.md
  lib/format.ts    dates et libellés en français
```

## Fonctionnement des intentions

Chaque membre règle dans son profil (tableau de bord → Modifier mon profil) jusqu'à 3 intentions parmi : Mentorat (cherche / propose), Pairs, Associé, Investissement (cherche / propose), Recrutement (cherche / propose), Amitié, Prise de parole (cherche un intervenant / est intervenant). L'Espace Rencontre (amour) est un opt-in séparé, jamais visible dans l'annuaire. Le Matching lit ces intentions et présente les profils complémentaires.

## Talk Show

Chaque membre peut proposer un talk (titre, description/motivation, vidéo chargée ou lien). La proposition passe en « attente de validation » et rejoint la file unique de `/admin/validations`. Les vidéos chargées partent directement du navigateur vers Supabase Storage (URL signée créée par le serveur), ce qui contourne la limite de 4,5 Mo de Vercel.

## Messagerie

Page « Messages » : ouverte à tous les membres (pas seulement aux relations), pièces jointes jusqu’à 50 Mo (bucket privé `messages`, liens de téléchargement temporaires). Conversations entre membres, badge de non-lus dans le menu. Les fils se rafraîchissent toutes les 2 secondes (et la liste toutes les 4 s), ce qui suffit pour une conversation fluide sans serveur temps réel. Les boutons « Écrire » de l’annuaire et des matchs ouvrent directement le fil.

## Événements

- **Page de destination** : `/e/{slug}` (`src/pages/EventPage.tsx`). Un événement public se lit sans compte ; sinon connexion, puis affichage aux seuls ayants droit (`server/lib/eventAccess.ts`). L'aperçu de partage est calculé côté serveur (`server/lib/eventShare.ts`) : le vrai titre pour un événement public, un aperçu générique sinon.
- **Adresse et lien visio** : ils ne sortent de l'API que pour les personnes inscrites (hors liste d'attente), l'organisateur, les leaders de la ruche et l'administration. La RLS (`0012_event_pages.sql`) ne les accorde pas en lecture directe.
- **Inscription** : un clic, liste d'attente, promotion automatique ; confirmation avec `.ics`, Google Agenda et partage. Les tables sont prêtes pour des invités (`event_guests`), non activés.
- **Gestion** : `/e/{slug}/gerer` pour le créateur et l'administration : modifier, inscrits, présents, annuler (inscrits prévenus par la cloche), vues.
- **Agenda** : calendrier mensuel du tableau de bord (`src/components/events/AgendaCalendar.tsx`), événements du réseau et des ruches du membre ; sur téléphone, une liste par défaut.
- **Notifications** : `notifications`, affichées par la cloche (`src/components/NotificationBell.tsx`). Aucun e-mail n'est envoyé.

## Accueil et miel

- **Parcours** : invitation → mot de passe → trois panneaux (`src/pages/onboarding/Accueil.tsx`, affichés tant que `onboarding_completed_at` est vide, quelle que soit la page demandée, avec sauvegarde à chaque panneau) → tuto du coach (`src/components/onboarding/Tour.tsx`, progression dans `members.tour`) → carte « Mes premiers pas » du tableau de bord. Les autres rubriques ont leur bulle à la première visite.
- **Réponses** : `goals`, `goals_other`, `match_profiles`, `match_sectors`, `profile_type`, `sector`, `intents` ; elles servent au matching et aux suggestions du coach. Les choix sont dans `server/lib/onboardingOptions.ts`.
- **Miel** : `honey_rules` (barème modifiable) et `honey_ledger` (une ligne par action et par membre). `server/lib/honey.ts` crédite une seule fois ; si l'action vaut davantage ensuite (vidéo ajoutée à une présentation), seule la différence est gagnée. L'animation du coach lit `honey.unannounced`.
- **Présentation** : une seule par membre dans l'espace Présentations, préremplie et modifiable.
- **Réunion de bienvenue** : un événement de type `bienvenue`, plusieurs dates possibles ; les présences cochées dans « Gérer » donnent le miel.
- **Textes** : `src/content/accueil.ts`, repris pour relecture dans [docs/textes-accueil.md](docs/textes-accueil.md).

## Administration

Panneau `/admin` (`src/pages/admin/`, `server/routers/admin.ts`), réservé au droit `admin.panel` : tableaux sur ordinateur, cartes sur téléphone.

- **Membres** : recherche, filtres, invitation (vrai e-mail), rôle, type d'accès, date de fin, suspension. Supprimer désactive le compte et anonymise le profil, les publications restent ; le compte de connexion n'est pas effacé de Supabase, car le projet est partagé avec PresenceAI : seul le lien avec la fiche est coupé.
- **Validations** : une seule file (événements, talks, opportunités, candidatures organisateur). Le message facultatif arrive dans les notifications de l'auteur.
- **Signalements** : `reports.create`, sur chaque message privé reçu, publication, réponse et message de ruche. `reports.snapshot` garde le contenu au moment du signalement, sauf pour un message privé, qui n'apparaît pas dans la liste.
- **Modération** : masquer (`hidden_at`), rétablir, supprimer, classer sans suite, suspendre l'auteur. `admin.reportContext` renvoie pour un message privé ce message et les deux avant et après, jamais le reste ; chaque première lecture va au journal.
- **Journal** : `admin_log` via `server/lib/adminLog.ts`. Toute nouvelle action d'administration doit appeler `logAdmin` (ou `logIfOnBehalf` quand une administratrice agit sur le contenu d'un autre).

## Profils

Chaque membre renseigne son intention, son ambition, ses valeurs, ses passions et son lien LinkedIn. L’annuaire ouvre une fiche résumée et une page de profil complet (`/membres/:id`) : présentation, ruches, talks publiés, événements animés et lien avec la personne (matchs, messages échangés).

## Fichiers

Les vidéos (Talk Show, forum), les images et pièces jointes du forum (buckets `forum-images` et `forum-fichiers`, privé) et les pièces jointes des messages sont envoyées directement du navigateur vers Supabase Storage grâce à une URL signée créée par le serveur. Il faut `SUPABASE_URL`, `SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY` ; sans elles, le forum et le Talk Show proposent un lien vidéo et le trombone des messages reste désactivé.

## Statuts et événements

- **Membre** : propose des événements Présence, qui attendent la validation de l’équipe (« Mes propositions » sur la page Événements). Peut postuler pour devenir organisateur depuis son tableau de bord.
- **Organisateur** : crée des événements Présence publiés directement, et modifie ou annule les siens.
- **Administrateur** : valide les propositions et les candidatures, change le statut des membres, modifie ou annule tous les événements (panneau `/admin`).
- **Deux canaux distincts** : la page Événements ne montre que le programme Présence ; les événements de ruche vivent dans leur ruche (créés par les leaders). L'agenda du tableau de bord réunit les deux.

## Forum

- **Espaces** (`forum_spaces`) : fil d'actualité, puis « Arriver dans le réseau » (Bienvenue, Présentations, Annonces) et « Échanger » (Conversations, Victoires, Retours vidéo, Entraide, Opportunités). Bienvenue et Annonces sont réservés aux administrateurs ; les opportunités des membres sont relues avant publication, y compris après une modification.
- **Fenêtre de publication** (`src/components/forum/Composer.tsx`) : création, annonce et modification ; couverture, image, pièce jointe, vidéo, lien, emoji, note vocale (enregistrée comme pièce jointe privée) et hashtags. Le brouillon est enregistré sur le serveur (`forum_drafts`). Le texte mis en forme est nettoyé par `server/lib/richText.ts` avant d'être enregistré ; lui seul est affiché tel quel.
- **Annonces** : publications de l'espace Annonces ou d'une ruche (`forum_posts.hive_id`). Épingle, public visé (d'après `access_type` du membre), publication programmée, fin d'affichage, point de couleur et nombre de lectures (`forum_post_reads`). Une annonce est comptée comme lue après une seconde à l'écran, ou quand la personne la ferme sur son tableau de bord.
- **Qui voit quoi** : `server/lib/forumAccess.ts`, doublé par la RLS (`db/migrations/supabase/0011_forum_rls.sql`). Publier ou modifier passe uniquement par le serveur.
- **Hashtags** (`hashtags`) : liste partagée définie par l'administratrice. Elle n'est pas propre au forum : les contenus de formation auront leur propre table de liaison vers cette liste, comme `forum_post_hashtags`.
- **Administration** : `/admin/forum` (annonces, espaces, hashtags, épingles).
- **Mise en ligne** : appliquer `0009_forum_spaces.sql` et `0011_forum_rls.sql`, déployer, puis passer `0010_forum_ranger_publications.sql` (qui peut être rejoué). Les anciennes tables `opportunities` et `opportunity_interests` sont conservées, mais ne sont plus lues.

## Connexion et droits

- **Connexion** : Supabase Auth, e-mail et mot de passe, réseau sur invitation. Réglages et e-mails : [docs/auth-setup.md](docs/auth-setup.md).
- **Droits** : une seule fonction, `can(membre, action, ressource)` dans `server/lib/permissions.ts`. Le routeur ne peut déclarer une route membre qu’avec `procFor(action)` ; la RLS (`db/migrations/supabase/0008_rls_policies.sql`) en est le second rempart.
- **Inviter** : `npm run invite -- email "Prénom Nom" rôle type_acces` (`--sans-email` affiche le lien sans rien envoyer ; `--fiche=N` relie une fiche existante).
- **Inviter** se fait aussi depuis `/admin/membres`.
- **Migrations Supabase** : `db/migrations/supabase/`, écrites pour le schéma `presence`, à appliquer dans l’ordre. Pour les pages d'événements, l'accueil et l'administration : `0012`, `0013`, `0014`, puis déployer.

## Prochaine session (feuille de route)

- **Analyse vidéo des longues vidéos** : aujourd’hui la vidéo est envoyée au serveur en un seul bloc (héritage PresenceAI), ce qui limite la taille. Prévu : envoi direct du navigateur vers Supabase Storage (comme pour le Talk Show), puis traitement asynchrone côté serveur avec l’API Files de Gemini (statut « en cours » → « terminé »).
- Ensuite : onglet « Mon parcours », réponses aux discussions des ruches, notifications par e-mail ou push.
