// Textes de l'accueil, regroupés ici et repris dans docs/textes-accueil.md pour relecture.

export const PANELS = {
  esprit: {
    eyebrow: "Bienvenue",
    title: (firstName: string) => `Bienvenue dans le réseau, ${firstName}.`,
    lines: [
      "Présence réunit des dirigeants sensibles et ambitieux.",
      "C’est un lieu sûr pour se retrouver, évoluer, partager ses idées et ses projets.",
      "Bienveillance, courtoisie et confidentialité : c’est notre règle commune.",
    ],
  },
  objectifs: {
    eyebrow: "Mes objectifs",
    title: "Qu’est-ce qui vous amène ?",
    hint: "Plusieurs choix possibles.",
    other: "Autre chose ? Dites-le avec vos mots.",
  },
  matching: {
    eyebrow: "Mes rencontres",
    title: "Qui aimeriez-vous rencontrer ?",
    hint: "Le matching et le coach s’en servent pour vous guider. Vous pourrez tout changer plus tard.",
    profiles: "Les profils que je veux rencontrer",
    sectors: "Les secteurs qui m’intéressent",
    seek: "Ce que je cherche",
    offer: "Ce que je propose",
    limit: "Trois choix au plus, entre ce que vous cherchez et ce que vous proposez.",
    me: "Et vous, vous êtes plutôt…",
    mySector: "Votre secteur",
  },
  buttons: { next: "Continuer", back: "Retour", finish: "Entrer dans le réseau" },
};

/** Le tuto du coach : une bulle par étape, deux phrases au plus. */
export const TOUR_STEPS = [
  { target: "/presence-ia", text: "Voici Présence IA. Entraînez-vous à la prise de parole et faites analyser vos vidéos." },
  { target: "coach", text: "Et moi, je suis votre coach. Posez-moi vos questions, je vous guide au quotidien." },
  { target: "/matching", text: "Le matching vous fait découvrir les membres qui correspondent à vos objectifs." },
  { target: "/ruches", text: "Les ruches sont nos petits cercles. Rejoignez ou créez une communauté ou un projet." },
  { target: null, text: "Complétez votre bio pour gagner vos premiers 20 miels. Un peu de précieux nectar pour bien commencer." },
] as const;

export const TOUR_BUTTONS = { next: "Suivant", skip: "Passer", profile: "Compléter mon profil", later: "Plus tard", gotIt: "Compris", inMenu: "À retrouver dans le menu, en bas à droite." };

/** Bulle d'une rubrique, à la première visite. */
export const SECTION_BUBBLES: Record<string, string> = {
  "/evenements": "Ici, les rendez-vous du réseau. Inscrivez-vous en un clic : l’adresse arrive avec votre place.",
  "/forum": "Le forum, c’est la vie du réseau. Racontez, demandez, répondez : chaque espace a son ton.",
  "/messages": "Écrivez directement à un membre. Votre premier message rapporte 10 miels.",
  "/membres": "L’annuaire du réseau. Cherchez un parcours, une ville, une envie.",
  "/talk-show": "Les talks des membres. Regardez, inspirez-vous, et proposez le vôtre.",
};

/** La rubrique dont la bulle reste à montrer sur cette page. */
export const sectionToShow = (pathname: string, seen: string[]) => Object.keys(SECTION_BUBBLES).find((k) => pathname.startsWith(k) && !seen.includes(k));

/** Animation du coach à chaque gain. */
export const HONEY_LINES: Record<string, string> = {
  accueil: "Votre premier précieux nectar.",
  tuto: "Vous connaissez les lieux.",
  profil: "Un beau profil, ça se récompense.",
  bienvenue_inscription: "À très vite à la réunion de bienvenue.",
  bienvenue_presence: "Merci d’être venu·e !",
  presentation: "Le réseau vous dit bonjour.",
  premier_message: "Premier lien tissé.",
  premier_evenement: "On se retrouve là-bas.",
};

/** Carte « Mes premiers pas ». */
export const FIRST_STEPS_CARD = {
  title: "Mes premiers pas",
  intro: "Chaque pas rapporte du miel, notre précieux nectar.",
  total: "Mon miel",
  steps: {
    accueil: { label: "Découvrir l’esprit du réseau" },
    tuto: { label: "Suivre le tuto du coach", cta: "Suivre le tuto" },
    profil: { label: "Compléter mon profil", sub: "Photo, fonction, ville et bio.", cta: "Compléter" },
    bienvenue_inscription: { label: "M’inscrire à une réunion de bienvenue", none: "Les prochaines dates arrivent bientôt." },
    bienvenue_presence: { label: "Participer à la réunion de bienvenue", sub: "L’équipe coche les présents le jour J." },
    presentation: { label: "Me présenter au réseau", sub: "10 miels, 20 avec une vidéo.", cta: "Me présenter" },
    premier_message: { label: "Écrire à un membre", cta: "Voir les membres" },
    premier_evenement: { label: "M’inscrire à un premier événement", cta: "Voir les événements" },
  },
} as const;

/** Fenêtre de présentation : conseils pour la vidéo. */
export const VIDEO_TIPS = {
  title: "Conseils pour une vidéo d’une minute",
  tips: [
    "Filmez à hauteur d’yeux, face à la lumière.",
    "Dites qui vous êtes, ce qui vous amène, ce que vous cherchez.",
    "Une seule prise suffit : on préfère le vrai au parfait.",
    "Un texte seul convient aussi.",
  ],
};

export const PROFILE_PROMPT = "Photo, fonction, ville et bio : complétez-les pour gagner 20 miels.";
export const REPLAY_TOUR = "Revoir le tuto";
