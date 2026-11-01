# Présence — plateforme réseau (v1)

Plateforme communautaire de Laura Ballo : tableau de bord, analyse vidéo (Présence IA, reprise de PresenceAI), Talk Show, Forum & opportunités, Matching, Annuaire des membres, Ruches (communautés et ruches projet) et Événements.

**État v1 :** données de démonstration fournies pour le développement.

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
| `NOTION_TOKEN` | Clé de l'intégration interne Notion, connectée à la page « Formations Présence » (droits : lecture, modification, insertion) et à la page « Catalogue de tests » (lue seulement). Sans elle : rien ne se synchronise, Construire le signale. |
| `PRIVATE_DATA_KEY` | Clé de chiffrement du journal, des résultats de tests et de la mémoire du coach : `openssl rand -base64 32`. À garder aussi en lieu sûr, car sans elle ces contenus deviennent illisibles. Sans cette variable, les membres ne peuvent pas écrire dans leur journal. |
| `RESEND_API_KEY` | Envoi des relances par e-mail, domaine `lauraballo.com` vérifié chez Resend. Sans elle : notifications dans l'application seulement. |
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
                   onboarding, honey, notifications, reports, admin, courses, coachMemory, build
  lib/             intents (7 intentions + Espace Rencontre), gemini, coach, format
db/
  schema.ts        tables Drizzle · relations.ts · seed.ts
api/index.ts       point d’entrée Vercel (fonction serverless) — voir vercel.json
src/
  pages/           Dashboard, Parcours et parcours/, PresenceIA, Analysis, TalkShow, Forum,
                   Matching, Membres, Ruches, Ruche, Evenements, EventPage, EventManage,
                   onboarding/Accueil, admin/ (panneau d'administration, dont admin/construire : Construire)
  components/      Layout (menu + thème clair/sombre), Avatar, ScoreRing, ui/, forum/, events/, onboarding/, course/
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
- **Événements récurrents** : table `event_series`, calcul des dates dans `server/lib/recurrence.ts`, création dans `server/lib/eventSeries.ts`. Chaque date est un événement ordinaire, avec sa page et ses inscrits, créé trois mois à l'avance par le travail régulier. La liste « À venir » ne montre que la prochaine date d'une série ; l'agenda les montre toutes. Modifier ou annuler vaut pour une date, ou pour elle et toute la suite. Réservé aux organisateurs et aux ruches : un membre propose une date à la fois.
- **Notifications** : `notifications`, affichées par la cloche (`src/components/NotificationBell.tsx`). Aucun e-mail n'est envoyé.

## Accueil et miel

- **Parcours** : invitation → mot de passe → trois panneaux (`src/pages/onboarding/Accueil.tsx`, affichés tant que `onboarding_completed_at` est vide, quelle que soit la page demandée, avec sauvegarde à chaque panneau) → tuto du coach (`src/components/onboarding/Tour.tsx`, progression dans `members.tour`) → carte « Mes premiers pas » du tableau de bord. Les autres rubriques ont leur bulle à la première visite.
- **Réponses** : `goals`, `goals_other`, `match_profiles`, `match_sectors`, `profile_type`, `sector`, `intents` ; elles servent au matching et aux suggestions du coach. Les choix sont dans `server/lib/onboardingOptions.ts`.
- **Miel** : `honey_rules` (barème modifiable) et `honey_ledger` (une ligne par action et par membre). `server/lib/honey.ts` crédite une seule fois ; si l'action vaut davantage ensuite (vidéo ajoutée à une présentation), seule la différence est gagnée. L'animation du coach lit `honey.unannounced`.
- **Présentation** : une seule par membre dans l'espace Présentations, préremplie et modifiable.
- **Réunion de bienvenue** : un événement de type `bienvenue`, plusieurs dates possibles, souvent en série ; les présences cochées dans « Gérer » donnent le miel.
- **Textes** : `src/content/accueil.ts`, repris pour relecture dans [docs/textes-accueil.md](docs/textes-accueil.md).

## Administration

Panneau `/admin` (`src/pages/admin/`, `server/routers/admin.ts`), réservé au droit `admin.panel` : tableaux sur ordinateur, cartes sur téléphone.

- **Membres** : recherche, filtres, invitation (vrai e-mail), rôle, type d'accès, date de fin, suspension. Supprimer désactive le compte et anonymise le profil, les publications restent ; le compte de connexion n'est pas effacé de Supabase, car le projet est partagé avec PresenceAI : seul le lien avec la fiche est coupé.
- **Validations** : une seule file (événements, talks, opportunités, candidatures organisateur). Le message facultatif arrive dans les notifications de l'auteur.
- **Signalements** : `reports.create`, sur chaque message privé reçu, publication, réponse et message de ruche. `reports.snapshot` garde le contenu au moment du signalement, sauf pour un message privé, qui n'apparaît pas dans la liste.
- **Modération** : masquer (`hidden_at`), rétablir, supprimer, classer sans suite, suspendre l'auteur. `admin.reportContext` renvoie pour un message privé ce message et les deux avant et après, jamais le reste ; chaque première lecture va au journal.
- **Journal** : `admin_log` via `server/lib/adminLog.ts`. Toute nouvelle action d'administration doit appeler `logAdmin` (ou `logIfOnBehalf` quand une administratrice agit sur le contenu d'un autre).

## Formations

Trois niveaux, connectés à Notion (espace « Formations Présence », bases Formations, Sections et Leçons) : Formation → Section → Leçon. **Notion fait foi pour les contenus**, l'application en garde une copie et enregistre ce qui appartient aux membres, qui n'est jamais écrit dans Notion.

- **Modèle** : `courses`, `course_sections`, `course_lessons` (contenu en blocs JSON, par rubrique), `course_assignments`, `member_tags`, `course_enrollments`, `section_progress`, `lesson_progress`, `journal_entries`, `test_results`, `coach_memory`, `coach_settings`, `notion_sync_runs`, `member_activity`, `workflows`. Migrations `0015_elearning.sql` et `0017_formations_trois_niveaux.sql` ; rien n'est accessible directement par la base (RLS, aucun droit). `course_modules` et `module_progress` sont l'ancien modèle : seule la reprise (`server/lib/courseResume.ts`) les lit encore, ils seront retirés une fois la reprise vérifiée.
- **Notion** : `server/lib/notion.ts` (client, version `2026-03-11`, environ 3 requêtes par seconde), `notionBlocks.ts` (conversions, rubriques, textes provisoires), `notionSync.ts` (lecture), `notionWrite.ts` (écriture bloc par bloc). Un bloc que l'application ne sait pas afficher est gardé et signalé, jamais supprimé. Les fichiers hébergés par Notion sont recopiés dans Supabase Storage, car leurs liens expirent. La liste « Leçons » d'une page de section est tenue par l'application : ignorée à la lecture, réécrite quand ses leçons changent. Contrôle du vrai Notion : `npm run notion:check` (lecture seule), `npm run notion:check -- --ecriture` (crée puis met à la corbeille une leçon ESSAI).
- **Synchronisation** : toutes les 15 minutes et au démarrage (`server/lib/scheduler.ts`), bouton « Synchroniser maintenant » dans Construire. Sur l'offre gratuite de Render, le serveur s'endort : rien ne tourne pendant son sommeil. Enregistrer depuis Construire écrit dans Notion puis relit la page ; si la page a changé dans Notion entre-temps, l'enregistrement est refusé.
- **Accès et calendrier** : `server/lib/courseAccess.ts` et `courseState.ts`, seule source des droits de lecture. Une leçon est visible si sa formation et elle-même sont publiées. Une section n'a pas de statut : elle apparaît dès qu'une de ses leçons est publiée, et la propriété « Statut » de la base Sections n'est ni lue ni écrite. La section n s'ouvre n−1 semaines après le démarrage, à minuit heure de Paris, et toutes ses leçons s'ouvrent ensemble. Une section ouverte au calendrier ne se referme pas si l'ordre change. Accès complet réversible : ce qui n'a été ouvert que par lui se referme, les réponses restent. Une section est terminée quand toutes ses leçons publiées le sont ; son défi, facultatif, ne compte pas.
- **Données privées** : chiffrées par `server/lib/privateBox.ts`, chaque texte lié à son membre. L'administration ne lit que ce qui est partagé (`build.memberShared`). Le journal d'activité ne contient aucun texte de membre.
- **Coach** : `server/lib/coachMemory.ts`. Si le membre a accepté (`COACH_CONSENT`, version gardée avec l'accord), ses réponses, réflexions, résultats de tests et défis entrent dans la mémoire dès qu'ils sont enregistrés, avec ses mots, sans résumé. Ils partent à Gemini seulement quand il parle au coach, 60 éléments au plus (`coachContext`). Chaque souvenir garde son origine (`coach_memory.origin`) : modifier l'entrée le met à jour, la vider le retire, et ce que le membre a corrigé ou effacé reste. Un élément effacé ne garde aucun texte, seulement son origine, pour ne pas revenir. Pendant une pause, rien n'entre. Les conversations du coach (`coach_messages`) ne sont pas chiffrées.
- **Tests intégrés** : pages HTML sur un autre domaine, résultat par `postMessage`, tout message d'une autre origine est ignoré. Voir [docs/integrer-un-test.md](docs/integrer-un-test.md). Pour les tests déposés sur le réseau, voir « Mon parcours » ci-dessous.
- **Relances** : `server/lib/workflows.ts`, modèles « Nouvelle section disponible » et « Formation en pause depuis 14 jours » : notification dans l'application, et e-mail automatique si l'administration l'active. Relance manuelle depuis les participants ou la fiche d'un membre (`server/lib/reminders.ts`), jamais deux en 24 heures pour une même formation.
- **E-mails** : `server/lib/email.ts`, envoi par l'API de Resend, car l'offre gratuite de Render bloque le SMTP. Chaque membre choisit ses catégories (`EMAIL_CATEGORIES` : formations, événements, marketing) dans son tableau de bord ; le marketing est désactivé par défaut. Chaque e-mail porte un lien signé de désinscription (`/desinscription`) et l'en-tête de désinscription en un clic. Tout nouvel envoi de relance doit passer par `sendMemberEmail`, qui respecte ces choix et laisse une trace dans `email_sends`.

## Espace créateur (Construire)

`/admin/construire` est une pleine page, sans le menu du réseau, toujours en clair, aux couleurs de la charte (`html.creator-mode` dans `src/index.css`, `CreatorShell.tsx`).

- **Mes formations**, **Tests**, **Relances** : le bandeau de gauche. L'éditeur d'une formation garde ses quatre onglets (contenu, informations, participants, statistiques).
- **Plan** : `Outline.tsx`, glissement aux événements de pointeur (clic tenu puis 4 pixels), écritures en file. Les flèches restent pour le téléphone.
- **Leçon et section, comme un document** : `BlockEditor.tsx`. Un bloc de l'application reste un bloc Notion : chaque ligne a son éditeur, Entrée crée le bloc suivant, Retour arrière recolle, les flèches passent d'un bloc à l'autre, « / » ouvre le menu d'insertion. Le changement de bloc se fait dans le même geste (`flushSync`, `focusNow`) : la lettre suivante ne doit jamais tomber dans le bloc d'avant.
- **Enregistrement** : `useDocSaver` (`EditorParts.tsx`). Tant que les membres ne voient pas la page, elle part toute seule dans Notion après 2,5 secondes de pause. Sur une page publiée, rien ne part sans un clic, et quitter pose la question. La page ne se recharge jamais sous les doigts : après une écriture, `remapIds` donne aux blocs leur identifiant Notion. Sans cela, l'écriture suivante les recréerait.
- **Couleurs** : `server/lib/textColors.ts`. Notion n'a que dix couleurs nommées, et une seule par morceau de texte : chaque teinte de la charte a la sienne, pour revenir à l'identique (classes `c-*` et `h-*`, seules gardées par `cleanInline`). Dans Notion, le texte s'affiche donc dans sa teinte la plus proche.
- **Polices** : celles de la maquette (Newsreader, Abhaya Libre, Figtree) pour écrire. Les membres lisent en Cormorant Garamond et Plus Jakarta Sans.

## Mon parcours

Quatre sous-pages (`src/pages/parcours/ParcoursLayout.tsx`), en onglets sur ordinateur, en liste sur téléphone, sans onglet de plus dans le menu principal : Mes formations (`/parcours`), Mes ressources (`/parcours/ressources`), Mon journal personnel (`/parcours/journal`), Ce que le coach retient de moi (`/parcours/coach`).

- **Catalogue de tests** : page Notion « Catalogue de tests », bases Thèmes et Catalogue des tests (`NOTION_THEMES_SOURCE`, `NOTION_TESTS_SOURCE`). **Lue seulement, Notion fait foi.** Copie dans `test_themes`, `tests`, `test_theme_links`, `test_lesson_links`, `test_hashtags` (migration `0020_ressources_tests.sql`). Une lecture à part dans `notionSync.ts` : si Notion en refuse l'accès, les formations se synchronisent quand même et `notion_sync_runs.detail` le note.
- **Cadre isolé** : `server/lib/testHost.ts`, seul chemin `/api/test-html/:id`, lien signé valable 4 heures. L'en-tête `Content-Security-Policy: sandbox` retire au test l'origine de l'application, même ouvert hors du cadre, et `connect-src 'none'` lui interdit tout appel réseau. **Ne jamais ajouter `allow-same-origin`** : le test pourrait lire la session dans le stockage du navigateur. Le fichier vient du bucket privé `test-files`, déposé depuis Construire (`build.setTestFile`) ou recopié du champ « Fichier HTML » de Notion ; le plus récent des deux l'emporte.
- **Résultats** : `test_results` avec `test_id`, chiffrés ; `result_enc` vide pour un test sans bloc de résultat, dont seul le passage est noté. Construire n'affiche que des totaux par test.
- **Profil** : `server/lib/testCatalog.ts`. Le résultat le plus récent de chaque thème, sous le libellé « Dans le profil ». Privé par défaut ; une ligne dans `profile_theme_shares` rend un thème public, thème par thème. Les autres membres ne voient que le titre du résultat (`outcomeTitle`), jamais son explication. Seuls ces résultats publics servent au matching.
- **Journal** : les réponses aux exercices et aux questions des leçons, regroupées par formation et par section. `journal_entries.kind` (`exercice`, `reflexion`) prépare les entrées libres et les questions du jour, qui viendront sans leçon.
- **Coaching** : « À travailler en coaching avec Laura » pose `journal_entries.shared_at`. C'est la seule porte vers l'administration : `server/routers/coaching.ts` (`/admin/coaching`, fiche du client, « abordée en séance ») et `build.memberShared` ne lisent que les réponses marquées. Retirer l'option remet aussi `coaching_discussed_at` à zéro. Sans accompagnement individuel en cours, le journal propose aussi `CALENDLY_EXPLO_URL`.

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

- **Espaces** (`forum_spaces`) : fil d'actualité, puis « Arriver dans le réseau » (Bienvenue, Présentations, Annonces) et « Échanger » (Conversations, Victoires, Retours vidéo, Entraide, Opportunités). Bienvenue et Annonces sont réservés aux administrateurs ; les opportunités des membres sont relues avant publication, y compris après une modification. L'administration ajoute, renomme et supprime les espaces (`SpaceDialog.tsx`) : l'adresse d'un espace ne change pas quand on le renomme, ses publications rejoignent l'espace choisi quand on le supprime, et ceux dont le site a besoin (Annonces, Présentations, Opportunités, Retours vidéo) ne se suppriment pas.
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
- Ensuite : réponses aux discussions des ruches, notifications par e-mail ou push.
