import { describe, expect, it } from "vitest";
import { cleanInline, courseContentFromBlocks, htmlToRichText, lessonContentFromBlocks, lessonIssues, themeIntroFromBlocks, sectionContentFromBlocks, sectionIssues, normalizeTag, labelFromTag, richTextToHtml, richTextToPlain, sameBlock, toCourseBlock, toNotionBlock } from "./notionBlocks";
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
  it("deux paragraphes de l'éditeur restent séparés par une ligne vide", () => {
    expect(cleanInline("<p>Un</p><p>Deux</p>")).toBe("Un<br /><br />Deux");
    expect(cleanInline("<p>Un</p><p></p><p></p><p>Deux</p><p></p>")).toBe("Un<br /><br />Deux");
    expect(htmlToRichText(cleanInline("<p>Un</p><p>Deux</p>"))[0].text?.content).toBe("Un\n\nDeux");
  });
  it("un retour à la ligne simple dans un paragraphe reste simple", () => {
    expect(cleanInline("<p>Un<br>Deux</p>")).toBe("Un<br />Deux");
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

describe("découpage d'une page de leçon", () => {
  // La structure réelle d'une leçon dans la base Notion
  const page = [
    text("heading_2", "Intention"), text("paragraph", "Identifier ce qui est juste."),
    text("heading_2", "Contenu"), text("paragraph", "À écrire : texte, images, vidéos, liens externes, emojis."),
    text("heading_2", "Exercice"), text("bulleted_list_item", "À écrire"),
    text("heading_2", "Défi dans le réseau"), text("paragraph", "Proposition : publier sa présentation."),
    text("heading_2", "Pour aller plus loin"), text("bulleted_list_item", "À compléter"),
  ];
  const content = lessonContentFromBlocks(page);
  const props = { type: "contenu" as const, intention: "Identifier ce qui est juste.", videoUrl: "", testUrl: "" };
  it("reconnaît les cinq rubriques", () => {
    expect(Object.keys(content.headings!)).toEqual(["intention", "contenu", "exercice", "defi", "plusLoin"]);
    expect(content.rubrics!.exercice).toHaveLength(1);
  });
  it("cache les textes provisoires aux membres", () => {
    expect(memberBlocks(content.rubrics!.contenu!)).toEqual([]);
    expect(memberBlocks(content.rubrics!.exercice!)).toEqual([]);
    expect(memberBlocks(content.rubrics!.plusLoin!)).toEqual([]);
    expect(memberBlocks(content.rubrics!.intention!)).toHaveLength(1);
    expect(memberBlocks(content.rubrics!.defi!)).toHaveLength(1);
  });
  it("cache aussi un défi encore à écrire", () => {
    const c = lessonContentFromBlocks([text("heading_2", "Défi dans le réseau"), text("paragraph", "Proposition : à écrire.")]);
    expect(memberBlocks(c.rubrics!.defi!)).toEqual([]);
  });
  it("signale ce qui reste à écrire", () => {
    const issues = lessonIssues(content, props);
    expect(issues.some((i) => i.startsWith("Contenu : texte encore à écrire"))).toBe(true);
    expect(issues.some((i) => i.includes("Proposition"))).toBe(true);
    expect(issues.some((i) => i.startsWith("Intention"))).toBe(false);
  });
  it("signale une intention différente entre le champ et la rubrique", () => {
    expect(lessonIssues(content, { ...props, intention: "Autre chose." }).some((i) => i.startsWith("Intention"))).toBe(true);
  });
  it("signale une rubrique absente", () => {
    expect(lessonIssues(lessonContentFromBlocks([text("heading_2", "Intention")]), { ...props, intention: "" }).some((i) => i.includes("« Exercice » absente"))).toBe(true);
  });
  it("le type de la leçon déclenche une alerte quand il manque ce qu'il annonce", () => {
    const empty = lessonContentFromBlocks([text("heading_2", "Intention"), text("heading_2", "Contenu"), text("heading_2", "Exercice"), text("heading_2", "Défi dans le réseau"), text("heading_2", "Pour aller plus loin")]);
    const alert = (type: "contenu" | "video" | "exercice" | "test" | "defi") => lessonIssues(empty, { ...props, type, intention: "" }).filter((i) => i.startsWith("Leçon de type"));
    expect(alert("video")[0]).toContain("aucun lien de vidéo");
    expect(alert("test")[0]).toContain("aucun test intégré");
    expect(alert("exercice")[0]).toContain("aucune question");
    expect(alert("defi")[0]).toContain("Défi est vide");
    expect(alert("contenu")).toEqual([]); // retirer le bloc Contenu est permis
    expect(lessonIssues(empty, { ...props, type: "video", intention: "", videoUrl: "https://exemple.org/v" }).filter((i) => i.startsWith("Leçon de type"))).toEqual([]);
  });
  it("un titre inconnu reste du contenu de la rubrique en cours", () => {
    const c = lessonContentFromBlocks([text("heading_2", "Contenu"), text("heading_2", "Une partie à moi"), text("paragraph", "Texte")]);
    expect(c.rubrics!.contenu).toHaveLength(2);
  });
  it("garde ce qui précède le premier titre sans l'afficher", () => {
    const c = lessonContentFromBlocks([text("paragraph", "Note de travail"), text("heading_2", "Intention")]);
    expect(c.before).toHaveLength(1);
  });
});

describe("découpage d'une page de section", () => {
  const page = [
    text("heading_2", "Intention"), text("paragraph", "À écrire"),
    text("heading_2", "Objectifs"), text("bulleted_list_item", "À écrire"),
    text("heading_2", "Leçons"), text("bulleted_list_item", "Faire le point sur son leadership"), text("bulleted_list_item", "S'ancrer dans ses valeurs"),
  ];
  const content = sectionContentFromBlocks(page);
  it("reconnaît ses rubriques et met la liste des leçons à part", () => {
    expect(Object.keys(content.headings!)).toEqual(["intention", "objectifs", "lecons"]);
    expect(content.rubrics!.lecons).toHaveLength(2);
    expect(content.rubrics!.objectifs).toHaveLength(1);
  });
  it("le défi est facultatif : son absence n'est pas signalée", () => {
    expect(sectionIssues(content, { intention: "" }).some((i) => i.includes("Défi"))).toBe(false);
  });
  it("ne signale jamais la liste des leçons, tenue par l'application", () => {
    expect(sectionIssues(sectionContentFromBlocks([text("heading_2", "Intention"), text("heading_2", "Objectifs")]), { intention: "" }).some((i) => i.includes("Leçons"))).toBe(false);
  });
  it("lit le défi quand la rubrique existe", () => {
    const c = sectionContentFromBlocks([...page, text("heading_2", "Défi dans le réseau"), text("paragraph", "Proposez un café.")]);
    expect(memberBlocks(c.rubrics!.defi!)).toHaveLength(1);
  });
});

describe("page de formation", () => {
  it("une formation n'affiche que sa présentation, pas son déroulé", () => {
    const c = courseContentFromBlocks([text("paragraph", "Note"), text("heading_2", "Déroulé"), text("numbered_list_item", "Un"), text("heading_2", "Présentation de la formation"), text("paragraph", "Huit semaines.")]);
    expect(c.description).toHaveLength(1);
    expect(plainOf((c.description![0] as { html: string }).html)).toBe("Huit semaines.");
  });
});

describe("couleurs de la charte", () => {
  const rich = (content: string, color?: string) => ({ plain_text: content, text: { content }, annotations: color ? { color } : {} }) as RichText;

  it("une couleur de Notion devient une classe de la charte, et revient à l'identique", () => {
    expect(richTextToHtml([rich("Texte", "red")])).toBe(`<span class="c-rouge">Texte</span>`);
    expect(htmlToRichText(`<span class="c-rouge">Texte</span>`)[0].annotations).toEqual({ color: "red" });
    for (const color of ["brown", "gray", "yellow", "orange", "red", "pink", "orange_background", "brown_background", "yellow_background"]) {
      expect(htmlToRichText(richTextToHtml([rich("x", color)]))[0].annotations).toEqual({ color });
    }
  });

  it("le noir de la charte est la couleur par défaut de Notion", () => {
    expect(richTextToHtml([rich("Texte", "default")])).toBe("Texte");
    expect(htmlToRichText("Texte")[0].annotations).toBeUndefined();
  });

  it("une couleur de Notion hors charte ne s'affiche pas", () => {
    expect(richTextToHtml([rich("Texte", "blue")])).toBe("Texte");
  });

  it("la couleur se combine avec le gras, et ne déborde pas sur le texte d'à côté", () => {
    const parts = htmlToRichText(`<strong><span class="h-sable">A</span>B</strong> C`);
    expect(parts.map((p) => [p.text?.content, p.annotations])).toEqual([["A", { bold: true, color: "yellow_background" }], ["B", { bold: true }], [" C", undefined]]);
  });

  it("le nettoyage garde les classes de la charte, et rien d'autre", () => {
    expect(cleanInline(`<span class="c-rouge x" onclick="alert(1)" style="color:red">A</span>`)).toBe(`<span class="c-rouge">A</span>`);
    expect(cleanInline(`<span class="pirate">A</span>`)).not.toContain("pirate");
    expect(cleanInline(`<script>alert(1)</script>A`)).toBe("A");
  });
});

describe("introduction d'un thème du catalogue", () => {
  const block = (type: string, content: string) => ({ id: content, type, [type]: { rich_text: [{ plain_text: content }] } }) as unknown as NotionBlock;
  const shown = (raw: NotionBlock[]) => memberBlocks(themeIntroFromBlocks(raw)).map((b) => plainOf((b as { html: string }).html));

  it("garde seulement la rubrique Introduction", () => {
    expect(shown([block("paragraph", "Avant"), block("heading_2", "Introduction"), block("paragraph", "Ce que mesurent ces tests."), block("heading_2", "Notes internes"), block("paragraph", "Après")])).toEqual(["Ce que mesurent ces tests."]);
  });

  it("cache le texte encore à écrire", () => {
    expect(shown([block("heading_2", "Introduction"), block("paragraph", "À écrire : ce que mesurent ces tests et comment lire ses résultats.")])).toEqual([]);
  });

  it("prend toute la page si elle n'a pas ce titre", () => {
    expect(shown([block("paragraph", "Une page simple.")])).toEqual(["Une page simple."]);
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
