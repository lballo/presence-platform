/**
 * Seed de démonstration : reprend les données de la maquette Présence.
 * Lancer avec : npm run db:seed   (après npm run db:push)
 * Le seed vide les tables avant de les remplir.
 */
import { getDb } from "../server/queries/connection";
import * as s from "./schema";
import { sql, eq } from "drizzle-orm";

const d = (iso: string) => new Date(iso);


// Adresse précise (présentiel) et lien visio (en ligne, salon) — visibles des seules personnes inscrites.
const ADDRESSES: Record<string, string> = {
  "Dîner du Cercle : oser son autorité": "Salon privatisé, 34 rue Chevreul, 69007 Lyon",
  "Matinale des leaders sensibles": "Salle de réunion, 12 rue de Richelieu, 75001 Paris",
  "Retraite : silence & leadership": "Domaine du lac, 74290 Talloires-Montmin",
  "Café de ruche avant le Dîner du Cercle": "Place Bellecour, statue de Louis XIV, 69002 Lyon",
  "Marche au parc de la Tête d’Or": "Entrée des Enfants du Rhône, boulevard des Belges, 69006 Lyon",
  "Déjeuner des dirigeantes": "Paris 8e · adresse précisée par l’organisatrice",
  "Tournée de repérage à la Croix-Rousse": "Place de la Croix-Rousse, 69004 Lyon",
};
const slug = (t: string) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
function withAccess<T extends { kind: "onsite" | "online" | "salon"; title: string }>(list: T[]) {
  return list.map((e) => (e.kind === "onsite" ? { ...e, address: ADDRESSES[e.title] ?? "" } : { ...e, meetingUrl: `https://meet.jit.si/presence-${slug(e.title)}` }));
}

async function seed() {
  const db = getDb();
  console.log("Nettoyage…");
  const schemaName = (process.env.DB_SCHEMA ?? "").replace(/[^a-z0-9_]/gi, "");
  const tables = ["members", "coaching_sessions", "forum_posts", "forum_likes", "opportunities", "opportunity_interests",
    "hives", "hive_members", "hive_posts", "hive_resources", "events", "event_registrations", "swipes", "talks",
    "coach_messages", "messages", "speeches", "speech_scores", "advice"].map((t) => (schemaName && schemaName !== "public" ? `"${schemaName}"."${t}"` : `"${t}"`));
  await db.execute(sql.raw(`TRUNCATE TABLE ${tables.join(", ")} RESTART IDENTITY CASCADE`));

  console.log("Membres…");
  // Ids : 1 Hélène (membre courant), 2 Laura, 3 Sofia, 4 Léa, 5 Marc, 6 Thomas, 7 Claire, 8 Amina,
  //       9 Julien, 10 Nadia, 11 Nicolas, 12 Inès, 13 Hugo, 14 Camille
  await db.insert(s.members).values([
    { firstName: "Hélène", lastName: "Moreau", gender: "f", role: "Directrice des opérations", org: "Groupe de services", city: "Lyon", zone: "Lyon", photoUrl: "/photos/helene.jpg", bio: "Pilote les opérations d’un groupe de services. Apprend à trancher sans perdre le lien.", intention: "Décider avec fermeté, sans jamais perdre le lien.", values: ["Liberté", "Loyauté", "Transmission"], intents: ["mentorat:seek", "pairs:sym"], pole: "Empathie", langs: "Français, anglais", isCoached: true },
    { firstName: "Laura", lastName: "Ballo", gender: "f", role: "Coach et fondatrice de Présence", org: "Laura Ballo Coaching", city: "Lyon", zone: "Lyon", bio: "Coach, formatrice et conférencière, Laura accompagne depuis plus de dix ans des dirigeants et des équipes sur le leadership, la prise de parole et l’intelligence émotionnelle. Elle a fondé Présence pour réunir les leaders qui refusent de choisir entre sensibilité et autorité.", intention: "Réunir celles et ceux qui dirigent avec le cœur et la tête.", values: ["Transmission", "Audace", "Lien"], intents: ["mentorat:offer", "parole:offer"], pole: "Singularité", langs: "Français, anglais", visibleInDirectory: false },
    { firstName: "Sofia", lastName: "Marín", gender: "f", role: "Directrice marketing", org: "Groupe de cosmétiques", city: "Madrid", zone: "International", photoUrl: "/photos/sofia.jpg", bio: "Dirige une équipe entre Madrid et Paris. Travaille sa prise de parole en anglais devant son comité exécutif.", intention: "Diriger dans une autre langue sans perdre ma voix.", values: ["Liberté", "Transmission", "Créer"], intents: ["mentorat:seek", "recrut:seek", "amitie:sym"], pole: "Singularité", langs: "Français, anglais, espagnol", rencontreEnabled: true, rencontreBlurb: "Aime les voyages lents et les dîners qui s’éternisent." },
    { firstName: "Léa", lastName: "Fontaine", gender: "f", role: "Directrice générale", org: "Association d’insertion", city: "Nantes", zone: "France", photoUrl: "/photos/lea.jpg", bio: "A repris la direction il y a un an. Cherche à poser son autorité sans renier sa douceur.", intention: "Le droit d’être entière.", values: ["Engagement", "Lien", "Justice"], intents: ["pairs:sym", "invest:seek", "mentorat:seek"], pole: "Empathie", langs: "Français" },
    { firstName: "Marc", lastName: "Delorme", gender: "m", role: "Directeur commercial", org: "Groupe industriel", city: "Lille", zone: "France", photoUrl: "/photos/marc.jpg", bio: "Trente ans de terrain. Veut apprendre à écouter autant qu’il sait convaincre.", intention: "Le silence, mon meilleur argument.", values: ["Loyauté", "Sens", "Exigence"], intents: ["parole:offer", "mentorat:offer"], pole: "Autorité", langs: "Français, anglais" },
    { firstName: "Thomas", lastName: "Leroy", gender: "m", role: "DRH", org: "Banque privée", city: "Paris", zone: "Paris", photoUrl: "/photos/thomas.jpg", bio: "Accompagne la transformation RH de son groupe. Mentor au sein du cercle.", intention: "Laisser aux humains les décisions qui comptent.", values: ["Transmission", "Équité"], intents: ["mentorat:offer", "recrut:seek", "parole:offer"], pole: "Empathie", langs: "Français, anglais", rencontreEnabled: true, rencontreBlurb: "Randonneur du dimanche, lecteur de romans russes." },
    { firstName: "Claire", lastName: "Dubois", gender: "f", role: "Fondatrice", org: "Studio de design", city: "Lyon", zone: "Lyon", bio: "A fondé son studio il y a huit ans. Apprend à déléguer sans tout reprendre en main.", intention: "Dire non à mon associé.", values: ["Liberté", "Création", "Audace"], intents: ["amitie:sym", "parole:seek", "pairs:sym"], pole: "Singularité", langs: "Français" },
    { firstName: "Amina", lastName: "Benali", gender: "f", role: "Directrice générale", org: "Groupe de santé", city: "Montréal", zone: "International", bio: "Dirige plusieurs établissements au Québec. Aime transmettre ce qu’elle a appris à la dure.", intention: "Diriger avec humanité.", values: ["Courage", "Soin"], intents: ["mentorat:offer", "invest:offer", "parole:offer"], pole: "Autorité", langs: "Français, anglais" },
    { firstName: "Julien", lastName: "Marchand", gender: "m", role: "Fondateur", org: "Start-up edtech", city: "Bordeaux", zone: "France", bio: "Entrepreneur en pleine levée de fonds. Cherche des pairs pour garder le cap.", intention: "Garder le cap pendant la levée.", values: ["Créer", "Liberté"], intents: ["invest:seek", "associe:sym", "pairs:sym"], pole: "Singularité", langs: "Français, anglais" },
    { firstName: "Nadia", lastName: "Haddad", gender: "f", role: "Directrice financière", org: "Groupe industriel", city: "Genève", zone: "Genève", bio: "A vu l’IA transformer son métier. Veut garder sa place d’humaine dans les décisions.", intention: "Poser mes limites en comité de direction.", values: ["Rigueur", "Loyauté"], intents: ["invest:offer", "amitie:sym"], pole: "Autorité", langs: "Français, anglais, arabe" },
    { firstName: "Nicolas", lastName: "Garnier", gender: "m", role: "Architecte associé", org: "Agence d’architecture", city: "Annecy", zone: "France", bio: "Présente ses projets devant des élus. Veut gagner en impact à l’oral.", intention: "Tenir les silences devant un conseil municipal.", values: ["Beauté", "Écoute"], intents: ["mentorat:seek", "parole:seek", "amitie:sym"], pole: "Empathie", langs: "Français, italien", rencontreEnabled: true, rencontreBlurb: "Dessine les villes qu’il visite et cherche quelqu’un avec qui flâner." },
    { firstName: "Inès", lastName: "Laurent", gender: "f", role: "Fondatrice", org: "Cabinet de conseil", city: "Genève", zone: "Genève", bio: "A fondé son cabinet seule. Cherche une associée pour développer l’activité côté France.", intention: "Ne plus décider seule.", values: ["Indépendance", "Transmission"], intents: ["associe:sym", "mentorat:offer"], pole: "Singularité", langs: "Français, anglais" },
    { firstName: "Hugo", lastName: "Martin", gender: "m", role: "Directeur d’usine", org: "Agroalimentaire", city: "Lyon", zone: "Lyon", bio: "Pilote 300 personnes. Veut apprendre à reconnaître davantage le travail de ses équipes.", intention: "Reconnaître le travail de mes équipes.", values: ["Sécurité", "Respect"], intents: ["recrut:seek", "mentorat:seek"], pole: "Autorité", langs: "Français" },
    { firstName: "Camille", lastName: "Roux", gender: "f", role: "Directrice de l’innovation", org: "Énergéticien", city: "Paris", zone: "Paris", bio: "Porte les projets IA de son groupe. Cherche des pairs qui allient technologie et humain.", intention: "Allier technologie et humain.", values: ["Curiosité", "Liberté"], intents: ["pairs:sym", "recrut:offer", "parole:offer"], pole: "Singularité", langs: "Français, anglais", rencontreEnabled: true, rencontreBlurb: "Curieuse de tout, fan de jazz et de longues marches." },
  ]);

  // Statuts : Laura administratrice, Marc organisateur, Camille candidate organisatrice
  await db.update(s.members).set({ status: "admin" }).where(eq(s.members.id, 2));
  await db.update(s.members).set({ status: "organizer" }).where(eq(s.members.id, 5));
  await db.update(s.members).set({ organizerRequest: "J’aimerais animer un cycle de déjeuners « IA et leadership » à Paris, un mardi par mois.", organizerRequestedAt: new Date() }).where(eq(s.members.id, 14));

  console.log("Coaching…");
  await db.insert(s.coachingSessions).values([
    ...[1, 2, 3, 4].map((n) => ({ memberId: 1, number: n, total: 12, title: `Séance ${n}`, startsAt: d(`2026-0${5 + n}-15T18:00:00`), durationMin: 60, done: true })),
    { memberId: 1, number: 5, total: 12, title: "Oser trancher", startsAt: d("2026-10-29T18:00:00"), durationMin: 60, done: false },
  ]);

  console.log("Forum…");
  await db.insert(s.forumPosts).values([
    { authorId: 9, kind: "victoire", text: "J’ai pitché en anglais devant des investisseurs à Londres. Deux ans que je repoussais ce moment. Ils ont posé des questions jusqu’au bout.", likes: 32, replies: 9, createdAt: d("2026-10-24T09:10:00") },
    { authorId: 4, kind: "video", text: "Première répétition de mon discours de rentrée devant l’équipe. J’aimerais vos retours sur le rythme et les silences.", askFeedback: true, likes: 11, replies: 6, createdAt: d("2026-10-23T18:40:00") },
    { authorId: 10, kind: "question", text: "Comment dites-vous non à une demande de votre direction sans passer pour quelqu’un qui freine ?", likes: 8, replies: 14, createdAt: d("2026-10-22T11:30:00") },
    { authorId: 11, kind: "victoire", text: "J’ai présenté notre projet devant le conseil municipal. J’ai tenu les silences, comme on l’avait travaillé ici.", likes: 21, replies: 5, createdAt: d("2026-10-21T20:00:00") },
  ]);

  await db.insert(s.opportunities).values([
    { authorId: 13, type: "recrut", title: "Responsable administratif et financier (H/F)", text: "Nous cherchons quelqu’un qui sache tenir les chiffres sans perdre de vue les équipes. Un poste clé dans une usine de 300 personnes, avec une vraie autonomie.", facts: ["Lyon", "CDI", "Prise de poste en janvier"], status: "published", createdAt: d("2026-10-23T10:00:00") },
    { authorId: 9, type: "fin", title: "Business angels pour une edtech", text: "Nous préparons une levée d’amorçage pour une application qui aide les lycéens à préparer leur grand oral. Je cherche des investisseurs qui partagent notre vision de l’éducation, et leurs conseils.", facts: ["Amorçage", "500 k€ recherchés", "Bordeaux"], status: "published", createdAt: d("2026-10-21T10:00:00") },
    { authorId: 12, type: "assoc", title: "Une associée pour mon cabinet de conseil", text: "Mon cabinet accompagne les comités de direction. Je cherche une associée plus opérationnelle que moi, prête à développer l’activité côté France.", facts: ["Genève et Annecy", "Entrée au capital", "Temps plein"], status: "published", createdAt: d("2026-10-18T10:00:00") },
    { authorId: 6, type: "recrut", title: "Coach en freelance, deux jours par mois", text: "Notre banque lance un programme d’accompagnement des nouveaux managers. Je cherche un ou une coach certifiée pour suivre une dizaine de personnes sur l’année.", facts: ["Paris et visio", "Freelance", "Dès novembre"], status: "published", createdAt: d("2026-10-18T09:00:00") },
    { authorId: 4, type: "fin", title: "Entreprises mécènes pour un programme d’insertion", text: "Notre association accompagne 120 jeunes vers l’emploi. Nous cherchons deux ou trois entreprises mécènes pour financer un atelier de prise de parole.", facts: ["Mécénat", "Nantes", "Avantage fiscal"], status: "published", createdAt: d("2026-10-15T09:00:00") },
  ]);
  await db.insert(s.opportunityInterests).values([
    { opportunityId: 1, memberId: 3 }, { opportunityId: 1, memberId: 7 }, { opportunityId: 1, memberId: 14 },
    { opportunityId: 2, memberId: 8 }, { opportunityId: 2, memberId: 10 }, { opportunityId: 2, memberId: 5 }, { opportunityId: 2, memberId: 6 }, { opportunityId: 2, memberId: 12 },
    { opportunityId: 3, memberId: 14 }, { opportunityId: 3, memberId: 10 },
    { opportunityId: 4, memberId: 5 }, { opportunityId: 4, memberId: 8 }, { opportunityId: 4, memberId: 12 }, { opportunityId: 4, memberId: 2 }, { opportunityId: 4, memberId: 7 }, { opportunityId: 4, memberId: 11 },
    { opportunityId: 5, memberId: 13 }, { opportunityId: 5, memberId: 6 }, { opportunityId: 5, memberId: 9 }, { opportunityId: 5, memberId: 3 },
  ]);

  console.log("Ruches…");
  // 1 voix, 2 lyon, 3 sensibles, 4 fondateurs, 5 ia, 6 dirigeantes, puis ruches projet 7..15
  await db.insert(s.hives).values([
    { type: "communaute", name: "Voix & Présence", theme: "Prise de parole", cover: "rouge", access: "libre", founderId: 2, description: "S’entraîner ensemble à prendre la parole : un défi par semaine, des vidéos partagées et des retours bienveillants." },
    { type: "communaute", name: "Ruche Lyon", theme: "Rencontres locales", cover: "or", access: "libre", founderId: 13, description: "Les membres de la région lyonnaise se retrouvent pour de vraies rencontres : cafés, marches et dîners." },
    { type: "communaute", name: "Sensibilité & performance", theme: "Hypersensibilité au travail", cover: "vin", access: "validation", founderId: 1, description: "Un espace confidentiel pour faire de sa sensibilité une force au travail, sans avoir à la justifier." },
    { type: "communaute", name: "Fondateurs en solo", theme: "Entrepreneuriat", cover: "bronze", access: "validation", founderId: 12, description: "Pour les fondatrices et fondateurs qui avancent souvent seuls : décisions difficiles, rythme, solitude du dirigeant." },
    { type: "communaute", name: "Humain & IA", theme: "Leadership et IA", cover: "nuit", access: "libre", founderId: 14, description: "Comment l’IA transforme nos métiers et notre manière de diriger, en gardant l’humain au centre des décisions." },
    { type: "communaute", name: "Cercle des dirigeantes", theme: "Femmes en direction générale", cover: "braise", access: "validation", founderId: 8, description: "Des femmes à la tête d’une organisation partagent leurs enjeux de pouvoir, de légitimité et d’équilibre." },
    { type: "projet", parentId: 1, name: "Le recueil des prises de parole", cover: "rouge", access: "libre", founderId: 5, phase: "en_cours", endMonth: "2027-06", goal: "Réunir quarante témoignages de prises de parole marquantes dans un livret offert aux nouveaux membres.", description: "Un discours, une réunion, un silence bien tenu : les membres racontent le moment où leur parole a compté.", needs: ["Des témoignages", "Une relectrice", "Une mise en page"] },
    { type: "projet", parentId: 1, name: "Le club de répétition", cover: "rouge", access: "libre", founderId: 11, phase: "idee", goal: "Offrir à chaque membre un binôme pour répéter la veille d’une intervention importante.", description: "Vingt minutes de visio, un retour à chaud, et l’on arrive plus serein le lendemain.", needs: ["Des volontaires", "Un planning partagé"] },
    { type: "projet", parentId: 1, name: "Cinquante façons d’ouvrir un discours", cover: "rouge", access: "libre", founderId: 2, phase: "termine", endMonth: "2026-09", goal: "Constituer une bibliothèque d’accroches testées par les membres, classées par situation.", description: "Comité de direction, conférence, annonce difficile : cinquante premières phrases qui ont fait leurs preuves." },
    { type: "projet", parentId: 2, name: "Le guide des lieux calmes", cover: "or", access: "libre", founderId: 7, phase: "en_cours", endMonth: "2027-03", goal: "Recenser vingt lieux lyonnais où l’on peut se réunir au calme, testés et notés par les membres.", description: "Des cafés, des salles et des jardins où l’on s’entend parler, pour des rencontres sans bruit ni précipitation.", needs: ["Des adresses", "Des photos"] },
    { type: "projet", parentId: 3, name: "La charte de la sensibilité au travail", cover: "vin", access: "validation", founderId: 4, phase: "en_cours", endMonth: "2027-02", goal: "Écrire un texte court que chacun peut partager avec son équipe pour dire ce dont une personne sensible a besoin.", description: "Ce qui aide une personne sensible à donner le meilleur d’elle-même, et ce qu’elle apporte au collectif.", needs: ["Une juriste en droit social", "Des retours d’équipes"] },
    { type: "projet", parentId: 4, name: "Le fonds d’entraide des fondateurs", cover: "bronze", access: "validation", founderId: 12, phase: "idee", goal: "Créer une caisse commune pour aider un membre à passer un cap difficile.", description: "Un salaire à couvrir, un conseil juridique, une avance de trésorerie : l’entraide entre fondateurs, concrètement.", needs: ["Un expert-comptable", "Des premiers contributeurs"] },
    { type: "projet", parentId: 5, name: "La charte IA des PME", cover: "nuit", access: "libre", founderId: 6, phase: "en_cours", endMonth: "2027-01", goal: "Proposer un modèle de charte simple, prêt à adapter, pour encadrer l’usage de l’IA dans une petite entreprise.", description: "Encadrer l’IA sans freiner les équipes : un texte court, des exemples concrets, des règles claires.", needs: ["Des retours de dirigeants", "Une relecture juridique"] },
    { type: "projet", parentId: 5, name: "Les ateliers IA des associations", cover: "nuit", access: "libre", founderId: 10, phase: "idee", goal: "Offrir quelques heures de formation à l’IA aux associations du réseau.", description: "Gagner du temps sur l’administratif pour en rendre davantage aux personnes accompagnées.", needs: ["Des formateurs bénévoles", "Des associations partantes"] },
    { type: "projet", parentId: 6, name: "Le mentorat des futures dirigeantes", cover: "braise", access: "validation", founderId: 8, phase: "en_cours", goal: "Accompagner des femmes cadres qui visent la direction générale, à raison d’un rendez-vous par mois.", description: "Chaque membre accompagne une femme cadre pendant un an, puis le binôme passe le relais.", needs: ["Des mentores", "Des entreprises partenaires"] },
  ]);

  const hm = (hiveId: number, memberId: number, role: "founder" | "leader" | "member" | "pending" = "member", note = "") => ({ hiveId, memberId, role, note });
  await db.insert(s.hiveMembers).values([
    // Voix & Présence
    hm(1, 2, "founder"), hm(1, 5, "leader"), hm(1, 6), hm(1, 11), hm(1, 3), hm(1, 1),
    // Ruche Lyon
    hm(2, 13, "founder"), hm(2, 1, "leader"), hm(2, 7), hm(2, 11),
    // Sensibilité & performance (Hélène fondatrice)
    hm(3, 1, "founder"), hm(3, 4, "leader"), hm(3, 10), hm(3, 7), hm(3, 3),
    hm(3, 14, "pending", "« Je cherche un lieu où parler de ma sensibilité sans avoir à m’en excuser. »"),
    hm(3, 9, "pending", "« Mes associés me trouvent trop à l’écoute. J’aimerais en faire un atout. »"),
    // Fondateurs en solo
    hm(4, 12, "founder"), hm(4, 9), hm(4, 7),
    // Humain & IA
    hm(5, 14, "founder"), hm(5, 6, "leader"), hm(5, 10), hm(5, 5), hm(5, 9),
    // Cercle des dirigeantes
    hm(6, 8, "founder"), hm(6, 4), hm(6, 10),
    // Ruches projet
    hm(7, 5, "founder"), hm(7, 3, "leader"), hm(7, 11), hm(7, 6), hm(7, 1),
    hm(8, 11, "founder"), hm(8, 6), hm(8, 3),
    hm(9, 2, "founder"), hm(9, 5), hm(9, 11),
    hm(10, 7, "founder"), hm(10, 1, "leader"), hm(10, 13), hm(10, 11),
    hm(11, 4, "founder"), hm(11, 10, "leader"), hm(11, 7),
    hm(12, 12, "founder"), hm(12, 9),
    hm(13, 6, "founder"), hm(13, 14, "leader"), hm(13, 5), hm(13, 9),
    hm(14, 10, "founder"), hm(14, 5),
    hm(15, 8, "founder"), hm(15, 4), hm(15, 10),
  ]);

  await db.insert(s.hivePosts).values([
    { hiveId: 1, authorId: 5, text: "Défi de la semaine : ouvrir votre prochaine réunion par une question plutôt que par l’ordre du jour. Qui le tente avec moi ?", likes: 12, replies: 7, createdAt: d("2026-10-25T14:00:00") },
    { hiveId: 1, authorId: 11, text: "J’ai présenté notre projet devant le conseil municipal. J’ai tenu les silences, comme on l’avait travaillé ici. Merci à vous.", likes: 21, replies: 5, createdAt: d("2026-10-24T19:00:00") },
    { hiveId: 2, authorId: 13, text: "Qui serait partant pour un café avant le Dîner du Cercle du 5 novembre ? Je propose 18h30, près de Bellecour.", likes: 8, replies: 4, createdAt: d("2026-10-23T09:00:00") },
    { hiveId: 2, authorId: 7, text: "Je cherche un lieu calme pour notre prochaine rencontre de ruche. Vos adresses préférées ?", likes: 3, replies: 9, createdAt: d("2026-10-20T09:00:00") },
    { hiveId: 3, authorId: 4, text: "Comment protégez-vous votre énergie les semaines où tout s’enchaîne ? Je prends toutes les petites astuces.", likes: 14, replies: 11, createdAt: d("2026-10-25T11:00:00") },
    { hiveId: 3, authorId: 10, text: "J’ai osé dire en comité de direction que j’avais besoin d’un temps de réflexion avant de trancher. Personne n’a sourcillé.", likes: 19, replies: 6, createdAt: d("2026-10-24T17:00:00") },
    { hiveId: 5, authorId: 14, text: "Partagez un usage de l’IA qui vous a fait gagner du temps sans vous retirer le plaisir du métier.", likes: 9, replies: 13, createdAt: d("2026-10-25T16:00:00") },
    { hiveId: 5, authorId: 6, text: "Notre charte IA côté RH est enfin signée. Le point qui a tout débloqué : écrire noir sur blanc ce que nous ne confierons jamais à une machine.", likes: 17, replies: 8, createdAt: d("2026-10-22T10:00:00") },
    { hiveId: 7, authorId: 5, text: "Nous en sommes à quatorze témoignages. Il en manque surtout sur les moments difficiles : annoncer une mauvaise nouvelle, recadrer, dire non.", likes: 9, replies: 4, createdAt: d("2026-10-25T12:00:00") },
    { hiveId: 8, authorId: 11, text: "Je propose de commencer simplement : chacun note ses grandes échéances dans un tableau partagé, et un binôme se manifeste. Qu’en pensez-vous ?", likes: 6, replies: 3, createdAt: d("2026-10-24T12:00:00") },
    { hiveId: 10, authorId: 7, text: "J’ai testé la bibliothèque du 1er arrondissement : parfaite pour un petit groupe le matin. Je l’ajoute à la carte.", likes: 5, replies: 2, createdAt: d("2026-10-23T12:00:00") },
    { hiveId: 13, authorId: 6, text: "La version 2 est dans les ressources. J’aimerais vos retours sur la partie données clients avant vendredi.", likes: 8, replies: 6, createdAt: d("2026-10-24T12:00:00") },
  ]);

  await db.insert(s.hiveResources).values([
    { hiveId: 7, authorId: 5, kind: "pdf", title: "Note de cadrage du recueil", meta: "4 pages", pinned: true, createdAt: d("2026-10-12") },
    { hiveId: 7, authorId: 3, kind: "doc", title: "Modèle de témoignage à compléter", createdAt: d("2026-10-14") },
    { hiveId: 7, authorId: 5, kind: "sheet", title: "Suivi des témoignages reçus", meta: "14 témoignages", createdAt: d("2026-10-24") },
    { hiveId: 7, authorId: 3, kind: "link", title: "Inspirations de mise en page", createdAt: d("2026-10-20") },
    { hiveId: 8, authorId: 11, kind: "doc", title: "Déroulé d’une répétition en binôme", pinned: true, createdAt: d("2026-10-22") },
    { hiveId: 9, authorId: 2, kind: "pdf", title: "Le recueil des cinquante accroches", meta: "18 pages", pinned: true, createdAt: d("2026-09-30") },
    { hiveId: 10, authorId: 7, kind: "sheet", title: "Carte des lieux testés", meta: "12 lieux", pinned: true, createdAt: d("2026-10-18") },
    { hiveId: 10, authorId: 1, kind: "doc", title: "Grille d’évaluation d’un lieu", createdAt: d("2026-10-21") },
    { hiveId: 10, authorId: 13, kind: "link", title: "Carte interactive des lieux", createdAt: d("2026-10-24") },
    { hiveId: 11, authorId: 4, kind: "doc", title: "Charte, version de travail", pinned: true, createdAt: d("2026-10-16") },
    { hiveId: 11, authorId: 10, kind: "pdf", title: "Synthèse des retours d’équipes", meta: "6 pages", createdAt: d("2026-10-22") },
    { hiveId: 12, authorId: 12, kind: "doc", title: "Premières pistes de fonctionnement", pinned: true, createdAt: d("2026-10-23") },
    { hiveId: 13, authorId: 6, kind: "pdf", title: "Charte IA, version 2", meta: "7 pages", pinned: true, createdAt: d("2026-10-23") },
    { hiveId: 13, authorId: 14, kind: "sheet", title: "Recensement des usages en entreprise", createdAt: d("2026-10-15") },
    { hiveId: 13, authorId: 6, kind: "slides", title: "Présenter la charte à un comité de direction", meta: "12 diapositives", createdAt: d("2026-10-09") },
    { hiveId: 15, authorId: 8, kind: "doc", title: "Charte du binôme mentore et mentorée", pinned: true, createdAt: d("2026-10-01") },
  ]);

  console.log("Événements…");
  await db.insert(s.events).values(withAccess([
    // Salons live (programme Présence)
    { kind: "salon", hostId: 4, title: "Préparer sa semaine avec calme", startsAt: d("2026-10-25T20:00:00"), durationMin: 45, maxSeats: 10, live: true, where: "En ligne", description: "Le rendez-vous du dimanche soir : on dépose ce qui pèse, on choisit une intention pour la semaine et on repart plus léger. Un tour de parole, un exercice court, une intention partagée." },
    { kind: "salon", hostId: 10, title: "Dire non sans avoir à se justifier", startsAt: d("2026-10-27T12:30:00"), durationMin: 45, maxSeats: 8, where: "En ligne", description: "Pourquoi est-ce si coûteux de refuser ? Nadia partage les formulations qui l’ont aidée, puis chacun s’entraîne en binôme sur une situation réelle." },
    { kind: "salon", hostId: 5, title: "Préparer un oral à fort enjeu", startsAt: d("2026-10-29T12:30:00"), durationMin: 45, maxSeats: 10, where: "En ligne", description: "Trois questions pour clarifier son message, un temps de répétition en petit groupe et des retours précis sur la posture et la voix." },
    { kind: "salon", hostId: 6, title: "Diriger avec l’IA sans perdre le lien", startsAt: d("2026-11-03T12:30:00"), durationMin: 45, maxSeats: 10, where: "En ligne", description: "Ce que l’on peut confier à l’IA, ce que l’on garde pour soi : un échange concret à partir des usages des participants." },
    { kind: "salon", hostId: 12, title: "La solitude du dirigeant, parlons-en", startsAt: d("2026-11-04T08:00:00"), durationMin: 45, maxSeats: 8, where: "En ligne", description: "Un café du matin entre fondateurs : ce qui pèse quand on décide seul, et ce qui aide à tenir dans la durée." },
    // Programme du cercle
    { kind: "onsite", hostId: 2, city: "Lyon", title: "Dîner du Cercle : oser son autorité", startsAt: d("2026-11-05T19:30:00"), durationMin: 180, maxSeats: 16, featured: true, where: "Lyon", description: "Une soirée en petit comité pour parler de ce qui se joue quand on doit trancher. Un échange guidé à partir de situations vécues, puis un vrai dîner pour prolonger la conversation." },
    { kind: "online", hostId: 2, title: "Masterclass : leadership incarné", startsAt: d("2026-11-12T18:00:00"), durationMin: 120, featured: true, where: "En ligne", description: "Une immersion pour aligner votre présence intérieure et votre impact extérieur : posture, voix, silence. Des exercices à faire chez soi, caméra allumée ou non." },
    { kind: "onsite", hostId: 2, city: "Paris", title: "Matinale des leaders sensibles", startsAt: d("2026-11-18T08:30:00"), durationMin: 90, maxSeats: 14, where: "Paris", description: "Un petit-déjeuner pour celles et ceux qui ressentent fort et dirigent quand même. Un thème, un tour de table et des pistes concrètes pour la journée." },
    { kind: "online", hostId: 2, title: "Talk Show live : trois idées qui transforment", startsAt: d("2026-11-19T19:00:00"), durationMin: 75, where: "En ligne · diffusion en direct", withLine: "Avec Marc Delorme, Claire Dubois et Sofia Marín.", description: "Le live du mois : le silence comme argument, dire non à son associé, diriger dans une autre langue. Trois membres racontent l’idée qui a changé leur façon de diriger, puis répondent à vos questions." },
    { kind: "online", hostId: 8, lang: "EN", title: "International Circle : leading with presence", startsAt: d("2026-11-26T18:00:00"), durationMin: 60, where: "En ligne · en anglais", description: "Le cercle des membres installés hors de France, en anglais. Cette fois : garder sa présence quand on dirige des équipes à distance." },
    { kind: "onsite", hostId: 2, city: "Annecy", title: "Retraite : silence & leadership", startsAt: d("2026-12-04T10:00:00"), durationMin: 60, days: 3, maxSeats: 8, featured: true, where: "Annecy", description: "Trois jours en pleine nature pour retrouver clarté et profondeur : marches, temps de silence, ateliers en petit groupe et accompagnement individuel." },
    // Événements de ruche
    { kind: "online", hiveId: 1, hostId: 5, title: "Atelier impro : parler sans notes", startsAt: d("2026-11-10T12:30:00"), durationMin: 60, where: "En ligne", inAgenda: false },
    { kind: "online", hiveId: 1, hostId: 2, title: "Club vidéo : on se regarde, on progresse", startsAt: d("2026-11-24T12:30:00"), durationMin: 60, where: "En ligne", inAgenda: false },
    { kind: "onsite", hiveId: 2, hostId: 13, city: "Lyon", title: "Café de ruche avant le Dîner du Cercle", startsAt: d("2026-11-05T18:30:00"), durationMin: 60, where: "Lyon · Bellecour", inAgenda: false },
    { kind: "onsite", hiveId: 2, hostId: 1, city: "Lyon", title: "Marche au parc de la Tête d’Or", startsAt: d("2026-11-22T10:00:00"), durationMin: 120, where: "Lyon · parc de la Tête d’Or", inAgenda: false },
    { kind: "online", hiveId: 3, hostId: 4, title: "Cercle de parole : poser ses limites", startsAt: d("2026-11-25T19:00:00"), durationMin: 75, where: "En ligne", inAgenda: false },
    { kind: "online", hiveId: 4, hostId: 12, title: "Revue de trimestre entre pairs", startsAt: d("2026-12-01T09:00:00"), durationMin: 90, where: "En ligne", inAgenda: false },
    { kind: "online", hiveId: 5, hostId: 6, title: "Démo : préparer ses réunions avec un assistant IA", startsAt: d("2026-11-16T12:30:00"), durationMin: 45, where: "En ligne", inAgenda: false },
    { kind: "onsite", hiveId: 6, hostId: 8, city: "Paris", title: "Déjeuner des dirigeantes", startsAt: d("2026-11-20T12:30:00"), durationMin: 90, where: "Paris", inAgenda: false },
    { kind: "online", hiveId: 7, hostId: 3, title: "Atelier d’écriture des témoignages", startsAt: d("2026-11-17T12:30:00"), durationMin: 60, where: "En ligne", inAgenda: false },
    { kind: "onsite", hiveId: 10, hostId: 7, city: "Lyon", title: "Tournée de repérage à la Croix-Rousse", startsAt: d("2026-11-14T10:00:00"), durationMin: 120, where: "Lyon · Croix-Rousse", inAgenda: false },
    { kind: "online", hiveId: 13, hostId: 14, title: "Relecture collective de la version 2", startsAt: d("2026-11-26T12:30:00"), durationMin: 60, where: "En ligne", inAgenda: false },
  ]));

  // inscriptions de démo (nb de participants) : on remplit avec d'autres membres
  const regs: { eventId: number; memberId: number }[] = [];
  const fill = (eventId: number, ids: number[]) => ids.forEach((memberId) => regs.push({ eventId, memberId }));
  fill(1, [5, 3, 7, 10, 11, 14, 9]);          // salon live : 7 personnes
  fill(2, [3, 7, 11, 14]);
  fill(3, [3, 6, 7, 9, 10, 11, 12, 13, 14]);  // 9/10
  fill(4, [3, 4, 5, 7, 8, 9, 10, 11, 12, 13]); // complet
  fill(5, [9, 7, 14]);
  fill(6, [1, 3, 5, 6, 7, 9, 10, 11, 12, 13, 14, 4]); // Dîner du Cercle, Hélène inscrite
  fill(7, [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  fill(8, [6, 7, 9, 10, 11, 12, 13, 14, 3]);
  fill(9, [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  fill(10, [3, 8, 9, 10, 14]);
  fill(11, [3, 4, 7, 10, 12]);
  fill(14, [1, 7, 11]); fill(15, [1, 13]); fill(16, [1, 10, 7]);
  await db.insert(s.eventRegistrations).values(regs);

  console.log("Talks…");
  await db.insert(s.talks).values([
    { speakerId: 4, title: "Le droit d’être entière", summary: "Léa raconte comment elle a cessé de choisir entre douceur et autorité en reprenant la direction de son association.", durationMin: 14, views: 312, publishedAt: d("2026-10-20") },
    { speakerId: 5, title: "Le silence, mon meilleur argument", summary: "Trente ans de négociations, et la découverte tardive que se taire est parfois la meilleure façon de convaincre.", durationMin: 11, views: 540, publishedAt: d("2026-10-06") },
    { speakerId: 7, title: "Dire non à mon associé", summary: "Comment poser une limite à la personne avec qui l’on a tout construit, sans casser la relation.", durationMin: 9, views: 428, publishedAt: d("2026-09-22") },
    { speakerId: 3, title: "Diriger dans une autre langue", summary: "Garder sa voix et son autorité quand on parle devant un comité exécutif dans une langue qui n’est pas la sienne.", durationMin: 12, views: 265, publishedAt: d("2026-09-08") },
  ]);

  console.log("Matching (intérêts déjà exprimés par d'autres membres)…");
  // ces membres ont déjà glissé à droite sur Hélène : un like d'Hélène en retour fait un match
  const likesYou = [3, 5, 7, 8, 9, 12, 14];
  await db.insert(s.swipes).values(
    likesYou.flatMap((fromId) => [
      { fromId, toId: 1, goal: "mentorat", liked: true },
      { fromId, toId: 1, goal: "pairs", liked: true },
      { fromId, toId: 1, goal: "associe", liked: true },
      { fromId, toId: 1, goal: "invest", liked: true },
      { fromId, toId: 1, goal: "recrut", liked: true },
      { fromId, toId: 1, goal: "amitie", liked: true },
      { fromId, toId: 1, goal: "parole", liked: true },
      { fromId, toId: 1, goal: "amour", liked: true },
    ])
  );

  console.log("Terminé.");
  process.exit(0);
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
