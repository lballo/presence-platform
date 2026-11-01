/**
 * Vérifie la liaison avec le vrai Notion, sans rien changer aux membres.
 *   npm run notion:check            lecture seule : bases, propriétés, modules, blocs
 *   npm run notion:check -- --ecriture   crée un module « ESSAI » en brouillon, le modifie, le relit, puis le met à la corbeille
 */
import { env } from "../server/lib/env";
import { appendBlocks, deleteBlock, getBlocks, getDataSource, getPage, listPages, listTemplates, notionMessage, notionReady, updateBlock, updatePage } from "../server/lib/notion";
import { courseContentFromBlocks, heading2, lessonContentFromBlocks, lessonIssues, plainToRichText, richTextToPlain, sectionContentFromBlocks, sectionIssues } from "../server/lib/notionBlocks";
import { createLessonPage } from "../server/lib/notionWrite";

const EXPECTED = {
  [env.notionFormations]: { Formation: "title", Accroche: "rich_text", Couverture: "files", Hashtags: "multi_select", "Ordre d'affichage": "number", Public: "select", Rythme: "select", Statut: "status" },
  [env.notionSections]: { Section: "title", Formation: "relation", Ordre: "number", Intention: "rich_text", Hashtags: "multi_select", "Leçons": "relation" },
  [env.notionLecons]: { "Leçon": "title", Section: "relation", Ordre: "number", Type: "select", Intention: "rich_text", Statut: "status", "Durée estimée (min)": "number", "Vidéo": "url", "Test intégré": "url", Hashtags: "multi_select" },
};

async function main() {
  if (!notionReady()) throw new Error("NOTION_TOKEN manquant dans .env");
  let bad = 0;
  for (const [id, props] of Object.entries(EXPECTED)) {
    const source = await getDataSource(id);
    for (const [name, type] of Object.entries(props)) {
      if (source.properties[name]?.type !== type) { bad++; console.log(`✗ ${name} : attendu ${type}, trouvé ${source.properties[name]?.type ?? "rien"}`); }
    }
  }
  console.log(bad ? `${bad} propriété(s) à regarder` : "✓ Propriétés des trois bases conformes");

  const [courses, sections, lessons] = [await listPages(env.notionFormations), await listPages(env.notionSections), await listPages(env.notionLecons)];
  console.log(`✓ ${courses.length} formation(s), ${sections.length} section(s), ${lessons.length} leçon(s) lisibles`);
  const blockTypes = new Map<string, number>();
  const count = (blocks: { type: string; children?: never[] }[]) => { for (const b of blocks) { blockTypes.set(b.type, (blockTypes.get(b.type) ?? 0) + 1); if (b.children) count(b.children); } };
  for (const c of courses) {
    const content = courseContentFromBlocks(await getBlocks(c.id));
    console.log(`  Formation « ${richTextToPlain(c.properties.Formation?.title)} » : présentation ${content.descriptionHeading ? "trouvée" : "absente"}`);
  }
  for (const x of sections) {
    const raw = await getBlocks(x.id);
    count(raw as never);
    const content = sectionContentFromBlocks(raw);
    const issues = sectionIssues(content, { intention: richTextToPlain(x.properties.Intention?.rich_text) });
    console.log(`  Section « ${richTextToPlain(x.properties.Section?.title)} » : ${Object.keys(content.headings ?? {}).length} rubriques, ${issues.length} point(s) à regarder`);
  }
  for (const l of lessons) {
    const raw = await getBlocks(l.id);
    count(raw as never);
    const content = lessonContentFromBlocks(raw);
    const issues = lessonIssues(content, { type: "contenu", intention: richTextToPlain(l.properties.Intention?.rich_text), videoUrl: l.properties["Vidéo"]?.url ?? "", testUrl: l.properties["Test intégré"]?.url ?? "" });
    console.log(`  Leçon « ${richTextToPlain(l.properties["Leçon"]?.title)} » : ${Object.keys(content.headings ?? {}).length}/5 rubriques, ${issues.length} point(s) à regarder`);
  }
  console.log("  Types de blocs :", [...blockTypes.entries()].map(([k, n]) => `${k} (${n})`).join(", "));
  const templates = await listTemplates(env.notionLecons).catch(() => null);
  console.log(templates === null ? "  Modèles de base : liste indisponible" : `  Modèles de base : ${templates.length ? templates.map((t) => t.name).join(", ") : "aucun"}`);

  if (!process.argv.includes("--ecriture")) return;
  const parent = sections[0];
  if (!parent) throw new Error("Aucune section dans Notion");
  console.log("Écriture : création d'une leçon ESSAI en brouillon…");
  const page = await createLessonPage({ title: "ESSAI : à supprimer", position: 999, type: "contenu", status: "brouillon", intention: "Essai d'écriture.", durationMin: 1, videoUrl: "", testUrl: "", hashtags: [], sectionPageId: parent.id }, { kind: "structure" });
  try {
    let raw = await getBlocks(page.id);
    let content = lessonContentFromBlocks(raw);
    console.log(Object.keys(content.headings ?? {}).length === 5 ? "✓ Cinq rubriques créées" : "✗ Rubriques manquantes");
    const question = content.rubrics!.exercice![0];
    await updateBlock(question.id, { bulleted_list_item: { rich_text: plainToRichText("Question modifiée par l'essai") } });
    const [added] = await appendBlocks(page.id, [{ object: "block", type: "paragraph", paragraph: { rich_text: plainToRichText("Bloc inséré après le titre Contenu") } }], content.headings!.contenu);
    const [other] = await appendBlocks(page.id, [heading2("Titre à retirer")]);
    await deleteBlock(other.id);
    await updatePage(page.id, { properties: { Ordre: { number: 998 } } });
    raw = await getBlocks(page.id);
    content = lessonContentFromBlocks(raw);
    const reread = await getPage(page.id);
    console.log(JSON.stringify(content.rubrics!.exercice![0]).includes("modifiée par l'essai") ? "✓ Bloc mis à jour" : "✗ Mise à jour non retrouvée");
    console.log(content.rubrics!.contenu![0]?.id === added.id ? "✓ Bloc inséré au bon endroit" : "✗ Insertion mal placée");
    console.log(reread.properties.Ordre?.number === 998 ? "✓ Propriété modifiée" : "✗ Propriété non modifiée");
  } finally {
    await updatePage(page.id, { in_trash: true });
    console.log("✓ Leçon ESSAI mise à la corbeille de Notion");
  }
}

main().catch((e: unknown) => { console.error("Échec :", notionMessage(e)); process.exit(1); });
