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

## À faire ensuite

- Authentification (comptes, invitations, rôle admin pour relire les opportunités)
- Onglet « Mon parcours »
- Messagerie (les boutons « Écrire » sont en place mais inactifs)
- Réponses aux publications du forum et des ruches
- Stockage des vidéos (aujourd'hui envoyées directement à Gemini, comme dans PresenceAI)
