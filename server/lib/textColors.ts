/**
 * Les couleurs de la charte dans le texte des leçons. Fichier pur, importé aussi par l'éditeur.
 * Notion ne connaît que dix couleurs nommées et une seule par morceau de texte : chaque teinte de la charte a la sienne,
 * pour revenir à l'identique. Dans Notion, le texte s'affiche dans la teinte la plus proche de sa palette.
 * Les trois teintes très claires seraient illisibles en texte sur fond blanc : elles servent de surlignage.
 */
export const TEXT_COLORS = [
  { cls: "", hex: "#1A1A1A", name: "Encre", notion: "default" },
  { cls: "c-brun", hex: "#3D3128", name: "Brun", notion: "brown" },
  { cls: "c-taupe", hex: "#6C6059", name: "Taupe", notion: "gray" },
  { cls: "c-taupe-clair", hex: "#AFA098", name: "Taupe clair", notion: "yellow" },
  { cls: "c-terre", hex: "#AA564C", name: "Terre", notion: "orange" },
  { cls: "c-rouge", hex: "#A83932", name: "Rouge Présence", notion: "red" },
  { cls: "c-carmin", hex: "#AD261E", name: "Rouge profond", notion: "pink" },
] as const;

export const HIGHLIGHTS = [
  { cls: "h-creme", hex: "#F3ECE8", name: "Crème", notion: "orange_background" },
  { cls: "h-lin", hex: "#E8DDD6", name: "Lin", notion: "brown_background" },
  { cls: "h-sable", hex: "#E0D3BD", name: "Sable", notion: "yellow_background" },
] as const;

const ALL = [...TEXT_COLORS, ...HIGHLIGHTS];

export const CHART_CLASSES: string[] = ALL.map((c) => c.cls as string).filter(Boolean);
export const isChartClass = (cls: string) => CHART_CLASSES.includes(cls);

/** Une couleur de Notion hors de cette liste ne s'affiche pas : le texte reste dans la couleur par défaut. */
export const classOfNotionColor = (name: string | undefined): string => (ALL.find((c) => c.notion === name)?.cls as string | undefined) ?? "";
export const notionColorOfClass = (cls: string): string | undefined => ALL.find((c) => c.cls === cls && cls)?.notion;
