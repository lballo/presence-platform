# Textes de l'accueil, à relire

Application : réseau Présence (https://presence-platform.onrender.com). Ces textes vivent dans `src/content/accueil.ts` : c'est là qu'ils se corrigent. Les listes de choix sont dans `server/lib/onboardingOptions.ts`.

## Panneaux d'accueil

### 1. L'esprit du réseau

- Sur-titre : Bienvenue
- Titre : Bienvenue dans le réseau, {prénom}.
- Texte :
  - Présence réunit des dirigeants sensibles et ambitieux.
  - C'est un lieu sûr pour se retrouver, évoluer, partager ses idées et ses projets.
  - Bienveillance, courtoisie et confidentialité : c'est notre règle commune.
- Vidéo de Laura : affichée si la variable `WELCOME_VIDEO_URL` est remplie (YouTube, Vimeo, Loom, Google Drive ou fichier). Sans elle, le panneau s'affiche sans vidéo.
- Bouton : Continuer

### 2. Mes objectifs

- Titre : Qu'est-ce qui vous amène ?
- Indication : Plusieurs choix possibles.
- Choix : Rencontrer des pairs · Gagner en aisance à l'oral · Prendre du recul sur mon rôle · Trouver des partenaires ou des clients · Lancer un projet · M'inspirer d'autres parcours
- Champ libre : Autre chose ? Dites-le avec vos mots.
- Boutons : Retour · Continuer

### 3. Mes rencontres

- Titre : Qui aimeriez-vous rencontrer ?
- Indication : Le matching et le coach s'en servent pour vous guider. Vous pourrez tout changer plus tard.
- Les profils que je veux rencontrer : Dirigeants · Fondateurs · Cadres dirigeants · Indépendants · Experts · Mentors · Investisseurs
- Les secteurs qui m'intéressent : Industrie · Services · Numérique · Finance · Santé · Éducation · Conseil · Commerce · Culture · Associatif
- Ce que je cherche : Trouver un mentor · Échanger entre pairs · M'associer · Lever des fonds · Recruter · Trouver un poste · Nouvelles amitiés · Trouver un intervenant
- Ce que je propose : Être mentor · Investir · Intervenir en conférence
- Indication : Trois choix au plus, entre ce que vous cherchez et ce que vous proposez.
- Et vous, vous êtes plutôt… : mêmes profils
- Votre secteur : mêmes secteurs
- Boutons : Retour · Entrer dans le réseau

## Tuto du coach

Boutons : Suivant · Passer. Sur téléphone, si la rubrique n'est pas dans les onglets du bas : « À retrouver dans le menu, en bas à droite. »

1. Présence IA : Voici Présence IA. Entraînez-vous à la prise de parole et faites analyser vos vidéos.
2. Le coach : Et moi, je suis votre coach. Posez-moi vos questions, je vous guide au quotidien.
3. Le matching : Le matching vous fait découvrir les membres qui correspondent à vos objectifs.
4. Les ruches : Les ruches sont nos petits cercles. Rejoignez ou créez une communauté ou un projet.
5. Dernière bulle : Complétez votre bio pour gagner vos premiers 20 miels. Un peu de précieux nectar pour bien commencer. Boutons : Compléter mon profil · Plus tard

Dans le profil : Revoir le tuto. Sur le formulaire du profil : « Photo, fonction, ville et bio : complétez-les pour gagner 20 miels. »

## Bulles à la première visite

Bouton : Compris

- Événements : Ici, les rendez-vous du réseau. Inscrivez-vous en un clic : l'adresse arrive avec votre place.
- Forum : Le forum, c'est la vie du réseau. Racontez, demandez, répondez : chaque espace a son ton.
- Messagerie : Écrivez directement à un membre. Votre premier message rapporte 10 miels.
- Annuaire : L'annuaire du réseau. Cherchez un parcours, une ville, une envie.
- Talk Show : Les talks des membres. Regardez, inspirez-vous, et proposez le vôtre.

## Animations du miel

Le coach annonce « +20 miels » (selon le gain) avec une phrase :

- Panneaux d'accueil terminés (10) : Votre premier précieux nectar.
- Tuto suivi jusqu'au bout (20) : Vous connaissez les lieux.
- Profil complété (20) : Un beau profil, ça se récompense.
- Inscription à la réunion de bienvenue (10) : À très vite à la réunion de bienvenue.
- Présence à la réunion de bienvenue (30) : Merci d'être venu·e !
- Présentation (10, ou 20 avec une vidéo) : Le réseau vous dit bonjour.
- Premier message à un membre (10) : Premier lien tissé.
- Inscription à un premier événement (10) : On se retrouve là-bas.

## Carte « Mes premiers pas »

- Titre : Mes premiers pas
- Introduction : Chaque pas rapporte du miel, notre précieux nectar. {n} pas restants.
- Découvrir l'esprit du réseau
- Suivre le tuto du coach · bouton : Suivre le tuto
- Compléter mon profil · Photo, fonction, ville et bio. · bouton : Compléter
- M'inscrire à une réunion de bienvenue · boutons : les prochaines dates · sans date : Les prochaines dates arrivent bientôt.
- Participer à la réunion de bienvenue · L'équipe coche les présents le jour J.
- Me présenter au réseau · 10 miels, 20 avec une vidéo. · bouton : Me présenter
- Écrire à un membre · bouton : Voir les membres
- M'inscrire à un premier événement · bouton : Voir les événements

## Présentation

Début de texte prérempli, que le membre réécrit librement :

> **Bonjour, je suis {prénom}**
>
> Je suis {fonction} à {ville}.
>
> Ce qui m'amène ici : {ses réponses au panneau 2}.
>
> Ce que je cherche : {ses réponses au panneau 3}.
>
> Ce que je propose : {ses réponses au panneau 3}.

Conseils pour une vidéo d'une minute :

- Filmez à hauteur d'yeux, face à la lumière.
- Dites qui vous êtes, ce qui vous amène, ce que vous cherchez.
- Une seule prise suffit : on préfère le vrai au parfait.
- Un texte seul convient aussi.
