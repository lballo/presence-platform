# Réglages Supabase Auth (projet presenceai)

À saisir dans le tableau de bord Supabase. Remplacer `https://ADRESSE-DE-L-APP` par l'adresse publique de Présence.

## 1. SMTP Hostinger

Authentication → Emails → SMTP Settings → activer **Enable custom SMTP**.

| Champ | Valeur |
|---|---|
| Sender email | `contact@lauraballo.com` |
| Sender name | `Laura Ballo` |
| Host | `smtp.hostinger.com` |
| Port number | `465` |
| Minimum interval | `30` secondes |
| Username | `contact@lauraballo.com` |
| Password | le mot de passe de la boîte `contact@lauraballo.com` |

Puis Authentication → Rate Limits → **Rate limit for sending emails** : `30` par heure (à relever pour une grosse vague d'invitations).

## 2. Adresses

Authentication → URL Configuration :

- **Site URL** : `https://ADRESSE-DE-L-APP`
- **Redirect URLs** : `https://ADRESSE-DE-L-APP/**`

## 3. Réseau sur invitation

Authentication → Sign In / Providers :

- **Allow new users to sign up** : désactivé
- **Email** : activé, **Confirm email** activé
- **Minimum password length** : `8`

Les invitations passent par l'API d'administration et continuent de fonctionner, inscriptions fermées.

## 4. Modèles d'e-mails

Authentication → Emails → Templates. Coller le contenu des fichiers en mode **Source**.

| Modèle | Objet | Contenu |
|---|---|---|
| **Invite user** | `Laura vous invite à rejoindre Présence` | `docs/auth-emails/invitation.html` |
| **Reset password** | `Votre nouveau mot de passe Présence` | `docs/auth-emails/reinitialisation.html` |

Le modèle d'invitation utilise `{{ .Data.invitation_url }}` et non `{{ .ConfirmationURL }}` : c'est le lien de 7 jours de Présence. Le lien Supabase, limité à 24 h, n'est produit qu'au clic sur le bouton de la page d'invitation.

## 5. Variables du serveur (Render)

`APP_URL`, `MEMBERSHIP_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Supprimer `CURRENT_MEMBER_ID` et `ADMIN_MEMBER_ID`.

## 6. Inviter depuis son ordinateur

Le script a besoin d'un fichier `.env` local avec `DATABASE_URL`, `DB_SCHEMA=presence`, `APP_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

```bash
npm run invite -- personne@exemple.fr "Prénom Nom" membre collectif
```

Rôles : `membre`, `organisateur`, `administrateur`. Types d'accès : `collectif`, `individuel`, `les_deux`.
