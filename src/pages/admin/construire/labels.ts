export const STATUS_LABEL = { brouillon: "Brouillon", relecture: "En relecture", publie: "Publié" } as const;
export const COURSE_STATUS_LABEL = { brouillon: "Brouillon", relecture: "En relecture", publie: "Publiée" } as const;
export const statusTone = (s: keyof typeof STATUS_LABEL) => (s === "publie" ? ("ok" as const) : s === "relecture" ? ("wait" as const) : ("calm" as const));
export const PUBLIC_LABEL = { tous: "Tous les membres", attribution: "Sur attribution" } as const;
export const RHYTHM_LABEL = { hebdo: "Une section par semaine", complet: "Accès complet" } as const;
export const LESSON_STATUS_LABEL = COURSE_STATUS_LABEL;
export const notionUrl = (id: string) => `https://www.notion.so/${id.replace(/-/g, "")}`;
