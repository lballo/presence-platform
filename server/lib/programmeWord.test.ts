import { describe, expect, it } from "vitest";
import { fillDocx, fillXml, readZip, writeZip } from "./programmeWord";

const run = (t: string, hl = true) => `<w:r><w:rPr>${hl ? '<w:highlight w:val="yellow"/>' : ""}</w:rPr><w:t xml:space="preserve">${t}</w:t></w:r>`;

describe("fillXml", () => {
  it("remplace une variable, même coupée par Word, et retire le surlignage", () => {
    const xml = `<w:p>${run("Préparé pour {{pre")}${run("nom}} {{nom}}")}</w:p>`;
    const out = fillXml(xml, { prenom: "Claire", nom: "Martin" });
    expect(out).toContain("Claire Martin");
    expect(out).not.toContain("w:highlight");
  });
  it("laisse surlignée une variable inconnue", () => {
    const out = fillXml(`<w:p>${run("{{nombre}} fois")}</w:p>`, { prenom: "Paul" });
    expect(out).toContain("{{nombre}}");
    expect(out).toContain("w:highlight");
  });
  it("retire le séparateur d'une variable vide", () => {
    const out = fillXml(`<w:p>${run("{{prenom}}")}${run(", ", false)}${run("{{entreprise}}")}</w:p>`, { prenom: "Paul", entreprise: "" });
    expect(out).toContain("Paul");
    expect(out).not.toContain(", ");
  });
});

describe("zip", () => {
  it("relit ce qu'il écrit", () => {
    const doc = Buffer.from(`<w:document><w:body><w:p>${run("Bonjour {{prenom}}")}</w:p></w:body></w:document>`);
    const zip = writeZip([{ name: "word/document.xml", data: doc }]);
    const out = readZip(fillDocx(zip, { prenom: "Claire" }));
    expect(out[0].data.toString()).toContain("Bonjour Claire");
  });
});
