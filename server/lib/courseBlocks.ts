/**
 * Le contenu d'une formation, tel que l'application le garde et l'affiche.
 * Chaque bloc porte l'identifiant de son bloc Notion : c'est ce qui permet de réécrire bloc par bloc
 * et de ne jamais perdre ce que l'application ne sait pas afficher.
 */
export type TextBlockType = "paragraph" | "bullet" | "number" | "quote";

export type CourseBlock =
  | { id: string; type: TextBlockType; html: string; draft?: boolean; children?: CourseBlock[] }
  | { id: string; type: "heading"; html: string; level: 2 | 3; draft?: boolean; children?: CourseBlock[] }
  | { id: string; type: "callout"; html: string; emoji: string; draft?: boolean; children?: CourseBlock[] }
  | { id: string; type: "toggle"; html: string; draft?: boolean; children?: CourseBlock[] }
  | { id: string; type: "divider" }
  | { id: string; type: "image" | "video"; url: string; caption: string; sourceKey?: string }
  | { id: string; type: "file"; url: string; name: string; sourceKey?: string }
  | { id: string; type: "link"; url: string; title: string }
  | { id: string; type: "unknown"; notionType: string };

export const SECTIONS = [
  { key: "intention", title: "Intention" },
  { key: "objectifs", title: "Objectifs" },
  { key: "contenu", title: "Contenu" },
  { key: "exercice", title: "Exercice" },
  { key: "defi", title: "Défi dans le réseau" },
  { key: "plusLoin", title: "Pour aller plus loin" },
] as const;

export type SectionKey = (typeof SECTIONS)[number]["key"];
export type Sections = Record<SectionKey, CourseBlock[]>;

export type ModuleContent = {
  sections?: Sections;
  headings?: Partial<Record<SectionKey, string>>; // identifiant Notion de chaque titre de section
  before?: CourseBlock[]; // ce qui précède le premier titre : conservé, jamais réécrit
};

export type CourseContent = {
  description?: CourseBlock[]; // section « Présentation de la formation »
  descriptionHeading?: string;
};

export const emptySections = (): Sections => ({ intention: [], objectifs: [], contenu: [], exercice: [], defi: [], plusLoin: [] });

/** Texte sans mise en forme, pour comparer ou transmettre au coach. */
export const plainOf = (html: string) => html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim();

/** Ce qu'un membre voit : ni les textes provisoires, ni les blocs que l'application ne sait pas afficher. */
export function memberBlocks(blocks: CourseBlock[]): CourseBlock[] {
  return blocks
    .filter((b) => b.type !== "unknown" && !("draft" in b && b.draft))
    .map((b) => {
      if ("sourceKey" in b) { const { sourceKey: _k, ...rest } = b; return rest as CourseBlock; }
      if ("children" in b && b.children) return { ...b, children: memberBlocks(b.children) } as CourseBlock;
      return b;
    });
}

/** Une question d'exercice : chaque puce de la section Exercice. */
export const isQuestion = (b: CourseBlock) => b.type === "bullet" || b.type === "number";
