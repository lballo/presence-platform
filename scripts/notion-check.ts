/**
 * Vérifie la liaison avec le vrai Notion, sans rien changer aux membres.
 *   npm run notion:check            lecture seule : bases, propriétés, modules, blocs
 *   npm run notion:check -- --ecriture   crée un module « ESSAI » en brouillon, le modifie, le relit, puis le met à la corbeille
 */
import { env } from "../server/lib/env";
import { appendBlocks, deleteBlock, getBlocks, getDataSource, getPage, listPages, listTemplates, notionMessage, notionReady, updateBlock, updatePage } from "../server/lib/notion";
import { courseContentFromBlocks, heading2, moduleContentFromBlocks, moduleIssues, plainToRichText, richTextToPlain } from "../server/lib/notionBlocks";
import { createModulePage } from "../server/lib/notionWrite";

const EXPECTED = {
  [env.notionFormations]: { Formation: "title", Accroche: "rich_text", Couverture: "files", Hashtags: "multi_select", "Ordre d'affichage": "number", Public: "select", Rythme: "select", Statut: "status" },
  [env.notionModules]: { Module: "title", Formation: "relation", Ordre: "number", Intention: "rich_text", Statut: "status", "Durée estimée (min)": "number", "Vidéo": "url", "Test intégré": "url", Hashtags: "multi_select", "Ce que le coach IA retient": "rich_text" },
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
  console.log(bad ? `${bad} propriété(s) à regarder` : "✓ Propriétés des deux bases conformes");

  const [courses, modules] = [await listPages(env.notionFormations), await listPages(env.notionModules)];
  console.log(`✓ ${courses.length} formation(s), ${modules.length} module(s) lisibles`);
  const blockTypes = new Map<string, number>();
  const count = (blocks: { type: string; children?: never[] }[]) => { for (const b of blocks) { blockTypes.set(b.type, (blockTypes.get(b.type) ?? 0) + 1); if (b.children) count(b.children); } };
  for (const c of courses) {
    const content = courseContentFromBlocks(await getBlocks(c.id));
    console.log(`  Formation « ${richTextToPlain(c.properties.Formation?.title)} » : présentation ${content.descriptionHeading ? "trouvée" : "absente"}`);
  }
  for (const m of modules) {
    const raw = await getBlocks(m.id);
    count(raw as never);
    const content = moduleContentFromBlocks(raw);
    const issues = moduleIssues(content, { intention: richTextToPlain(m.properties.Intention?.rich_text), coachBrief: richTextToPlain(m.properties["Ce que le coach IA retient"]?.rich_text) });
    console.log(`  Module « ${richTextToPlain(m.properties.Module?.title)} » : ${Object.keys(content.headings ?? {}).length}/6 sections, ${issues.length} point(s) à regarder`);
  }
  console.log("  Types de blocs :", [...blockTypes.entries()].map(([k, n]) => `${k} (${n})`).join(", "));
  const templates = await listTemplates(env.notionModules).catch(() => null);
  console.log(templates === null ? "  Modèles de base : liste indisponible" : `  Modèles de base : ${templates.length ? templates.map((t) => t.name).join(", ") : "aucun"}`);

  if (!process.argv.includes("--ecriture")) return;
  const parent = courses[0];
  if (!parent) throw new Error("Aucune formation dans Notion");
  console.log("Écriture : création d'un module ESSAI en brouillon…");
  const page = await createModulePage({ title: "ESSAI : à supprimer", position: 999, status: "brouillon", intention: "Essai d'écriture.", durationMin: 1, videoUrl: "", testUrl: "", coachBrief: "", hashtags: [], coursePageId: parent.id }, { kind: "structure" });
  try {
    let raw = await getBlocks(page.id);
    let content = moduleContentFromBlocks(raw);
    console.log(Object.keys(content.headings ?? {}).length === 6 ? "✓ Six sections créées" : "✗ Sections manquantes");
    const objectif = content.sections!.objectifs[0];
    await updateBlock(objectif.id, { bulleted_list_item: { rich_text: plainToRichText("Objectif modifié par l'essai") } });
    const [added] = await appendBlocks(page.id, [{ object: "block", type: "paragraph", paragraph: { rich_text: plainToRichText("Bloc inséré après le titre Contenu") } }], content.headings!.contenu);
    const [other] = await appendBlocks(page.id, [heading2("Titre à retirer")]);
    await deleteBlock(other.id);
    await updatePage(page.id, { properties: { Ordre: { number: 998 } } });
    raw = await getBlocks(page.id);
    content = moduleContentFromBlocks(raw);
    const reread = await getPage(page.id);
    console.log(JSON.stringify(content.sections!.objectifs[0]).includes("modifié par l'essai") ? "✓ Bloc mis à jour" : "✗ Mise à jour non retrouvée");
    console.log(content.sections!.contenu[0]?.id === added.id ? "✓ Bloc inséré au bon endroit" : "✗ Insertion mal placée");
    console.log(reread.properties.Ordre?.number === 998 ? "✓ Propriété modifiée" : "✗ Propriété non modifiée");
  } finally {
    await updatePage(page.id, { in_trash: true });
    console.log("✓ Module ESSAI mis à la corbeille de Notion");
  }
}

main().catch((e: unknown) => { console.error("Échec :", notionMessage(e)); process.exit(1); });
