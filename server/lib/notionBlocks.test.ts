import { describe, expect, it } from "vitest";
import { cleanInline, courseContentFromBlocks, htmlToRichText, moduleContentFromBlocks, moduleIssues, normalizeTag, labelFromTag, richTextToHtml, richTextToPlain, sameBlock, toCourseBlock, toNotionBlock } from "./notionBlocks";
import { memberBlocks, plainOf } from "./courseBlocks";
import type { NotionBlock, RichText } from "./notion";

const rt = (content: string, annotations = {}, href: string | null = null): RichText => ({ type: "text", plain_text: content, href, text: { content, link: href ? { url: href } : null }, annotations });
const block = (type: string, value: Record<string, unknown>, id = `${type}-${Math.random()}`): NotionBlock => ({ id, type, [type]: value });
const text = (type: string, s: string, id?: string) => block(type, { rich_text: [rt(s)] }, id);

describe("texte mis en forme", () => {
  it("échappe tout ce qui vient de Notion", () => {
    expect(richTextToHtml([rt("<script>alert(1)</script>")])).toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
  it("garde gras, italique et lien", () => {
    const html = richTextToHtml([rt("Un "), rt("mot", { bold: true }), rt(" et "), rt("un lien", { italic: true }, "https://exemple.org")]);
    expect(html).toContain("<strong>mot</strong>");
    expect(html).toContain('<a href="https://exemple.org" target="_blank"');
    expect(html).toContain("<em>un lien</em>");
  });
  it("refuse un lien qui n'est pas web", () => {
    expect(richTextToHtml([rt("x", {}, "javascript:alert(1)")])).toBe("x");
  });
  it("fait l'aller-retour sans rien perdre", () => {
    const rich = htmlToRichText('Un <strong>mot</strong> et <em><a href="https://exemple.org">un lien</a></em>');
    expect(richTextToPlain(rich)).toBe("Un mot et un lien");
    expect(rich[1].annotations?.bold).toBe(true);
    expect(rich[3].text?.link?.url).toBe("https://exemple.org");
    expect(rich[3].annotations?.italic).toBe(true);
  });
  it("découpe les longs textes : Notion accepte 2 000 caractères par morceau", () => {
    const rich = htmlToRichText("a".repeat(4500));
    expect(rich).toHaveLength(3);
    expect(rich.every((r) => r.text!.content.length <= 2000)).toBe(true);
  });
  it("retrouve les caractères spéciaux", () => {
    expect(richTextToPlain(htmlToRichText("a &lt; b &amp; c"))).toBe("a < b & c");
  });
  it("le nettoyage retire les scripts et les liens dangereux", () => {
    const clean = cleanInline('<p onclick="x()">Texte <script>alert(1)</script><a href="javascript:x()">lien</a><img src=x onerror=y></p>');
    expect(clean).not.toMatch(/script|onclick|onerror|img|javascript/);
    expect(clean).toContain("Texte");
  });
  it("deux paragraphes de l'éditeur deviennent un retour à la ligne", () => {
    expect(cleanInline("<p>Un</p><p>Deux</p>")).toBe("Un<br />Deux");
  });
});

describe("blocs", () => {
  it("convertit les types connus, et garde les autres sans les afficher", () => {
    expect(toCourseBlock(text("paragraph", "Bonjour", "a"))).toEqual({ id: "a", type: "paragraph", html: "Bonjour" });
    expect(toCourseBlock(block("bookmark", { url: "https://exemple.org", caption: [rt("Voir")] }, "b"))).toEqual({ id: "b", type: "link", url: "https://exemple.org", title: "Voir" });
    expect(toCourseBlock(block("table", {}, "c"))).toEqual({ id: "c", type: "unknown", notionType: "table" });
    expect(memberBlocks([{ id: "c", type: "unknown", notionType: "table" }])).toEqual([]);
  });
  it("le lien d'un fichier Notion change, sa clé non", () => {
    const b = toCourseBlock(block("image", { type: "file", file: { url: "https://s3/x/photo.png?sig=1" }, caption: [] }));
    expect(b.type === "image" && b.sourceKey).toBe("https://s3/x/photo.png");
  });
  it("une écriture différente du même texte n'est pas une modification", () => {
    expect(sameBlock({ id: "a", type: "paragraph", html: "Un <b>mot</b>" }, { id: "a", type: "paragraph", html: "Un <strong>mot</strong>" })).toBe(true);
    expect(sameBlock({ id: "a", type: "paragraph", html: "Un mot" }, { id: "a", type: "paragraph", html: "Deux mots" })).toBe(false);
  });
  it("un bloc inconnu n'est jamais écrit", () => {
    expect(toNotionBlock({ id: "a", type: "unknown", notionType: "table" })).toBeNull();
  });
  it("une image part avec son adresse externe", () => {
    expect(toNotionBlock({ id: "a", type: "image", url: "https://x/i.png", caption: "Légende" })).toMatchObject({ type: "image", image: { type: "external", external: { url: "https://x/i.png" } } });
  });
});

describe("découpage d'une page en sections", () => {
  // La structure réelle d'un module dans la base Notion
  const page = [
    text("heading_2", "Intention"), text("paragraph", "Identifier ce qui est juste."),
    text("heading_2", "Objectifs"), text("bulleted_list_item", "À écrire"),
    text("heading_2", "Contenu"), block("callout", { rich_text: [rt("Texte, images, vidéos, liens externes, emojis.")], icon: { type: "emoji", emoji: "✍️" } }),
    text("heading_2", "Exercice"), text("paragraph", "Questions de réflexion ; les réponses vont dans le journal privé du membre."), text("bulleted_list_item", "À écrire"),
    text("heading_2", "Défi dans le réseau"), text("paragraph", "Proposition : publier sa présentation."),
    text("heading_2", "Pour aller plus loin"), text("bulleted_list_item", "À compléter"),
  ];
  const content = moduleContentFromBlocks(page);
  it("reconnaît les six sections", () => {
    expect(Object.keys(content.headings!)).toEqual(["intention", "objectifs", "contenu", "exercice", "defi", "plusLoin"]);
    expect(content.sections!.exercice).toHaveLength(2);
  });
  it("cache les textes provisoires aux membres", () => {
    expect(memberBlocks(content.sections!.objectifs)).toEqual([]);
    expect(memberBlocks(content.sections!.contenu)).toEqual([]);
    expect(memberBlocks(content.sections!.exercice)).toEqual([]);
    expect(memberBlocks(content.sections!.plusLoin)).toEqual([]);
    expect(memberBlocks(content.sections!.intention)).toHaveLength(1);
    expect(memberBlocks(content.sections!.defi)).toHaveLength(1);
  });
  it("signale ce qui reste à écrire", () => {
    const issues = moduleIssues(content, { intention: "Identifier ce qui est juste.", coachBrief: "" });
    expect(issues.some((i) => i.startsWith("Objectifs : texte encore à écrire"))).toBe(true);
    expect(issues.some((i) => i.includes("Proposition"))).toBe(true);
    expect(issues.some((i) => i.includes("coach IA retient"))).toBe(true);
    expect(issues.some((i) => i.startsWith("Intention"))).toBe(false);
  });
  it("signale une intention différente entre le champ et la section", () => {
    expect(moduleIssues(content, { intention: "Autre chose.", coachBrief: "x" }).some((i) => i.startsWith("Intention"))).toBe(true);
  });
  it("signale une section absente", () => {
    expect(moduleIssues(moduleContentFromBlocks([text("heading_2", "Intention")]), { intention: "", coachBrief: "x" }).some((i) => i.includes("« Exercice » absente"))).toBe(true);
  });
  it("garde ce qui précède le premier titre sans l'afficher", () => {
    const c = moduleContentFromBlocks([text("paragraph", "Note de travail"), text("heading_2", "Intention")]);
    expect(c.before).toHaveLength(1);
  });
  it("une formation n'affiche que sa présentation, pas son déroulé", () => {
    const c = courseContentFromBlocks([text("paragraph", "Note"), text("heading_2", "Déroulé"), text("numbered_list_item", "Un"), text("heading_2", "Présentation de la formation"), text("paragraph", "Huit semaines.")]);
    expect(c.description).toHaveLength(1);
    expect(plainOf((c.description![0] as { html: string }).html)).toBe("Huit semaines.");
  });
});

describe("hashtags", () => {
  it("relie le nom de Notion à celui de la communauté", () => {
    expect(normalizeTag("Prise de parole")).toBe("prise-de-parole");
    expect(normalizeTag("Émotions")).toBe("émotions");
    expect(normalizeTag("#Présence")).toBe("présence");
    expect(labelFromTag("prise-de-parole")).toBe("Prise de parole");
  });
});
