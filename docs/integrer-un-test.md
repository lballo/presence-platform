# Intégrer un test

Réseau Présence : https://presence-platform.onrender.com

Vos tests sont des pages HTML autonomes. Il y a deux façons de les proposer :

- **Dans Mes ressources** (`/parcours/ressources`) : le test est catalogué dans Notion et son fichier est déposé sur le réseau. C'est la façon conseillée, voir plus bas.
- **Dans une leçon** : le test est hébergé ailleurs et son adresse va dans le champ **Test intégré**.

Dans les deux cas, le réseau récupère le résultat à une condition : ajouter quelques lignes à la fin du test.

## Mes ressources : le catalogue de tests

1. Dans Notion, page **Catalogue de tests**, remplissez la fiche du test dans la base **Catalogue des tests** : thèmes, description, durée, leçons liées, « Peut être refait », statut. Notion fait foi pour tout cela, et l'application ne l'écrit jamais.
2. Déposez le fichier : dans le champ **Fichier HTML** de Notion, ou depuis `/admin`, onglet Construire, **Tests de Mes ressources**. Inutile de passer par GitHub. Le dernier fichier déposé, d'un côté ou de l'autre, est celui qui s'affiche.
3. Cochez **Résultat enregistré** si le fichier contient le code ci-dessous. Construire signale un désaccord entre la case et le fichier.
4. Dans Construire, **Essayer** ouvre le test comme un membre, même en brouillon, sans rien enregistrer.
5. Passez le test et son thème au statut publié : une rubrique apparaît par thème publié, et un test à plusieurs thèmes apparaît dans chacune.

Le thème **Stress** affiche « Ce test n'est pas un outil médical » : cela dépend du nom du thème, qui doit contenir le mot « stress ».

### Ce que le fichier peut et ne peut pas faire

Le test s'ouvre dans un cadre isolé, sur le seul chemin `/api/test-html/` : son code ne peut rien lire de l'application.

| Il peut | Il ne peut pas |
|---|---|
| Exécuter son propre code et ses styles, charger des scripts, images et polices en `https` | Lire la session, le stockage ou la page de l'application |
| Afficher des formulaires, des messages `alert()` et proposer un téléchargement | Appeler une API ou un serveur (`fetch`, envoi de formulaire vers une adresse) |
| Utiliser `localStorage` : il reçoit un stockage en mémoire, effacé à la fin du passage | Ouvrir une fenêtre ou changer la page de l'application |

**Un test qui doit envoyer ses réponses à un autre serveur ne fonctionnera pas ici** : il restera dans son cadre, sans réseau. Tout doit se calculer dans la page. Le cadre s'ajuste tout seul à la hauteur du test.

Sans le code ci-dessous, le test fonctionne quand même : rien n'est enregistré, et le membre clique sur « J'ai terminé ce test » pour noter son passage.

## Dans une leçon

1. Hébergez la page du test sur **un autre domaine** que le réseau, en `https`.
2. Ajoutez le code ci-dessous à la page, là où le résultat s'affiche.
3. Collez l'adresse de la page dans le champ **Test intégré** de la leçon (dans Notion, ou dans `/admin`, onglet Construire).
4. Ouvrez l'**aperçu comme un membre** pour essayer : un message confirme que le résultat est bien reçu.

## Le code à ajouter

Appelez cette fonction au moment où le membre obtient son résultat :

```html
<script>
  function envoyerResultat(resultat) {
    window.parent.postMessage(
      { type: "presence:test-result", version: 1, result: resultat },
      "https://presence-platform.onrender.com" // seule cette adresse recevra le résultat
    );
  }
</script>
```

Par exemple, à la fin de votre calcul :

```js
envoyerResultat({
  label: "Leader bâtisseur",                       // le titre du résultat
  summary: "Vous rassemblez avant de décider.",    // le texte à garder
  score: 82,                                       // facultatif
  details: { ecoute: 9, decision: 6 }              // facultatif
});
```

| Champ | Obligatoire | Limite |
|---|---|---|
| `label` | `label` ou `summary` | 200 caractères |
| `summary` | `label` ou `summary` | 4 000 caractères |
| `score` | non | un nombre, ou un texte de 40 caractères |
| `details` | non | 40 valeurs simples : texte, nombre, vrai ou faux |

Le membre peut refaire le test : chaque résultat s'ajoute à ses passages, et le dernier s'affiche. Dans Mes ressources, c'est aussi le plus récent qui s'affiche dans son profil : `label` est le seul champ que les autres membres peuvent voir, et seulement si le membre le choisit. Si `label` est vide, c'est `score`. `summary` reste privé. Donnez donc à `label` une forme courte et montrable.

## Hauteur de la page (facultatif)

Dans Mes ressources, le cadre s'ajuste tout seul. Pour un test hébergé ailleurs, il s'affiche par défaut sur 640 pixels de haut. Pour qu'il s'ajuste à votre page :

```js
window.parent.postMessage(
  { type: "presence:test-height", height: document.documentElement.scrollHeight },
  "https://presence-platform.onrender.com"
);
```

## Ce que le réseau vérifie

- **L'origine** : seul un message venant de ce cadre précis est lu, et du domaine exact du test quand il est hébergé ailleurs. Tout autre message est ignoré.
- **Le format** : un message sans le `type` attendu, ou sans `label` ni `summary`, est ignoré.
- **L'adresse** : un lien vers le domaine du réseau est refusé. La page pourrait agir à la place du membre connecté. Un fichier déposé dans Construire ne pose pas ce problème : il est servi isolé, sans origine.

## Où va le résultat

- Il est chiffré et rangé dans les passages du membre, dans sa leçon ou sa page de test. Personne d'autre ne le lit, sauf si le membre le partage avec vous ou l'affiche sur son profil.
- Si le membre a accepté la mémoire du coach, le résultat y entre dès qu'il est enregistré. Il est transmis à Gemini, le service d'IA de Google, seulement quand le membre parle au coach.
- Le journal d'activité indique seulement « Test passé », jamais le résultat.

## Si le test ne s'affiche pas

Votre hébergeur interdit peut-être l'affichage dans un cadre. Dans ce cas, retirez de la page l'en-tête `X-Frame-Options`, ou autorisez `https://presence-platform.onrender.com` dans `Content-Security-Policy: frame-ancestors`. Le membre garde un lien pour ouvrir le test à part, mais son résultat n'est alors pas enregistré.

Pour un test hébergé ailleurs, le cadre accepte les scripts, les formulaires et l'ouverture de liens. Votre page ne peut ni lire le réseau, ni changer sa page. Elle ne reçoit aucune information sur le membre.

Ne demandez pas de données personnelles dans un test : elles resteraient chez votre hébergeur, hors du journal privé.
