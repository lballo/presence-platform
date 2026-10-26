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
| `CURRENT_MEMBER_ID` | Membre « connecté » tant qu'il n'y a pas d'auth (1 = Hélène, 2 = Laura…). Peut aussi être passé par l'en-tête HTTP `x-member-id`. |
| `GEMINI_API_KEY` | Clé Google AI Studio pour l'analyse vidéo et le Coach IA. Sans clé : coach en mode réponses fixes, analyse vidéo indisponible. |
| `ADMIN_MEMBER_ID` | Membre qui valide les talks soumis (2 = Laura). |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Envoi des vidéos du Talk Show dans le bucket Supabase Storage `talks` (public en lecture). Sans elles, le formulaire propose un lien vidéo à la place du fichier. |
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
  routers/         members, forum, hives, events, matching, coach, speech, dashboard
  lib/             intents (7 intentions + Espace Rencontre), gemini, coach, format
db/
  schema.ts        tables Drizzle · relations.ts · seed.ts
api/index.ts       point d’entrée Vercel (fonction serverless) — voir vercel.json
src/
  pages/           Dashboard, Parcours (vide), PresenceIA, Analysis, TalkShow, Forum,
                   Matching, Membres, Ruches, Ruche, Evenements
  components/      Layout (menu + thème clair/sombre), Avatar, ScoreRing, ui/
  lib/format.ts    dates et libellés en français
```

## Fonctionnement des intentions

Chaque membre règle dans son profil (tableau de bord → Modifier mon profil) jusqu'à 3 intentions parmi : Mentorat (cherche / propose), Pairs, Associé, Investissement (cherche / propose), Recrutement (cherche / propose), Amitié, Prise de parole (cherche un intervenant / est intervenant). L'Espace Rencontre (amour) est un opt-in séparé, jamais visible dans l'annuaire. Le Matching lit ces intentions et présente les profils complémentaires.

## Talk Show

Chaque membre peut proposer un talk (titre, description/motivation, vidéo chargée ou lien). La proposition passe en « attente de validation » ; le membre `ADMIN_MEMBER_ID` voit un panneau « à valider » en haut du Talk Show et publie ou refuse. Les vidéos chargées partent directement du navigateur vers Supabase Storage (URL signée créée par le serveur), ce qui contourne la limite de 4,5 Mo de Vercel.

## Messagerie

Page « Messages » : conversations entre membres, badge de non-lus dans le menu. Les fils se rafraîchissent toutes les 2 secondes (et la liste toutes les 4 s), ce qui suffit pour une conversation fluide sans serveur temps réel. Les boutons « Écrire » de l’annuaire et des matchs ouvrent directement le fil.

## Événements : adresse et lien visio

À la création d’un événement (dans une ruche ou depuis la page Événements), l’adresse exacte est demandée pour le présentiel et le lien de visio pour l’en ligne et les salons. Ces informations ne sont renvoyées par l’API qu’aux personnes inscrites (hors liste d’attente), à l’organisatrice, aux leaders de la ruche et à l’administratrice ; les autres voient seulement la ville ou « En ligne ».

## Prochaine session (feuille de route)

- **Authentification des membres** : comptes (e-mail + mot de passe ou lien magique), invitation par l’équipe, mot de passe oublié. Remplace `CURRENT_MEMBER_ID` / `x-member-id`.
- **Rôle administrateur** : statut `admin` en base (remplace `ADMIN_MEMBER_ID`) et **panneau d’administration** dédié dans l’app :
  - ajouter, suspendre ou supprimer des membres ;
  - créer, modifier ou supprimer n’importe quel événement ;
  - modérer les contenus (forum, ruches, opportunités, talks) : masquer, supprimer, valider ;
  - files d’attente : opportunités et talks à relire.
- **Analyse vidéo des longues vidéos** : aujourd’hui la vidéo est envoyée au serveur en un seul bloc (héritage PresenceAI), ce qui limite la taille. Prévu : envoi direct du navigateur vers Supabase Storage (comme pour le Talk Show), puis traitement asynchrone côté serveur avec l’API Files de Gemini (statut « en cours » → « terminé »).
- Ensuite : onglet « Mon parcours », réponses aux publications du forum et des ruches, notifications (e-mail / push) pour les nouveaux messages.
