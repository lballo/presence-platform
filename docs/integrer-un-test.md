# Intégrer un test dans un module

Réseau Présence : https://presence-platform.onrender.com

Vos tests sont des pages HTML autonomes. Le réseau les affiche dans le module et récupère le résultat, à une condition : ajouter quelques lignes à la fin du test.

## En bref

1. Hébergez la page du test sur **un autre domaine** que le réseau, en `https`.
2. Ajoutez le code ci-dessous à la page, là où le résultat s'affiche.
3. Collez l'adresse de la page dans le champ **Test intégré** du module (dans Notion, ou dans `/admin`, onglet Construire).
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

Le membre peut refaire le test : chaque résultat s'ajoute à son journal, et le dernier s'affiche dans le module.

## Hauteur de la page (facultatif)

Par défaut, le test s'affiche sur 640 pixels de haut. Pour que le cadre s'ajuste à votre page :

```js
window.parent.postMessage(
  { type: "presence:test-height", height: document.documentElement.scrollHeight },
  "https://presence-platform.onrender.com"
);
```

## Ce que le réseau vérifie

- **L'origine** : seul un message venant du domaine exact du test, et de ce cadre précis, est lu. Tout autre message est ignoré.
- **Le format** : un message sans le `type` attendu, ou sans `label` ni `summary`, est ignoré.
- **L'adresse** : un test hébergé sur le domaine du réseau est refusé. Il pourrait agir à la place du membre connecté.

## Où va le résultat

- Il est chiffré et rangé dans le journal privé du membre. Personne d'autre ne le lit, sauf si le membre le partage avec vous.
- Si le membre a accepté la mémoire du coach, le coach retient l'essentiel du résultat quand le module est terminé. Le résultat est alors transmis à Gemini, le service d'IA de Google.
- Le journal d'activité indique seulement « Test passé », jamais le résultat.

## Si le test ne s'affiche pas

Votre hébergeur interdit peut-être l'affichage dans un cadre. Dans ce cas, retirez de la page l'en-tête `X-Frame-Options`, ou autorisez `https://presence-platform.onrender.com` dans `Content-Security-Policy: frame-ancestors`. Le membre garde un lien pour ouvrir le test à part, mais son résultat n'est alors pas enregistré.

Le cadre accepte les scripts, les formulaires et l'ouverture de liens. Votre page ne peut ni lire le réseau, ni changer sa page. Elle ne reçoit aucune information sur le membre.

Ne demandez pas de données personnelles dans un test : elles resteraient chez votre hébergeur, hors du journal privé.
