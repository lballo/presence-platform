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

/** Les rubriques d'une page de leçon, dans l'ordre de la page Notion. */
export const LESSON_RUBRICS = [
  { key: "intention", title: "Intention" },
  { key: "contenu", title: "Contenu" },
  { key: "exercice", title: "Exercice" },
  { key: "defi", title: "Défi dans le réseau" },
  { key: "plusLoin", title: "Pour aller plus loin" },
] as const;

/** Les rubriques d'une page de section. « Leçons » est tenue par l'application : ignorée à la lecture, réécrite quand les leçons changent. */
export const SECTION_RUBRICS = [
  { key: "intention", title: "Intention" },
  { key: "objectifs", title: "Objectifs" },
  { key: "lecons", title: "Leçons" },
  { key: "defi", title: "Défi dans le réseau" },
] as const;

export type RubricKey = (typeof LESSON_RUBRICS)[number]["key"] | (typeof SECTION_RUBRICS)[number]["key"];
export type Rubric = { key: RubricKey; title: string };
export type Rubrics = Partial<Record<RubricKey, CourseBlock[]>>;

export type PageContent = {
  rubrics?: Rubrics;
  headings?: Partial<Record<RubricKey, string>>; // identifiant Notion de chaque titre de rubrique
  before?: CourseBlock[]; // ce qui précède le premier titre : conservé, jamais réécrit
};

export type CourseContent = {
  description?: CourseBlock[]; // rubrique « Présentation de la formation »
  descriptionHeading?: string;
};

export const LESSON_TYPES = ["contenu", "video", "exercice", "test", "defi"] as const;
export type LessonType = (typeof LESSON_TYPES)[number];
export const LESSON_TYPE_LABEL: Record<LessonType, string> = { contenu: "Contenu", video: "Vidéo", exercice: "Exercice", test: "Test", defi: "Défi dans le réseau" };

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

/** Une question d'exercice : chaque puce de la rubrique Exercice. */
export const isQuestion = (b: CourseBlock) => b.type === "bullet" || b.type === "number";
