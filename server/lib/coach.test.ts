import { describe, expect, it } from "vitest";
import { parseMemoryItems } from "./coach";

describe("ce que le service d'IA renvoie pour la mémoire", () => {
  it("lit le format attendu", () => {
    expect(parseMemoryItems('[{"source":"test","texte":"Leader bâtisseur"},{"source":"module","texte":"Elle veut diriger sans s’effacer."}]')).toEqual([{ source: "test", text: "Leader bâtisseur" }, { source: "module", text: "Elle veut diriger sans s’effacer." }]);
  });
  it("accepte une réponse entourée de balises de code", () => {
    expect(parseMemoryItems('```json\n[{"source":"defi","texte":"Défi relevé"}]\n```')).toHaveLength(1);
  });
  it("une source inconnue devient le module, un texte vide est ignoré", () => {
    expect(parseMemoryItems('[{"source":"autre","texte":"A"},{"source":"test","texte":"  "}]')).toEqual([{ source: "module", text: "A" }]);
  });
  it("refuse ce qui n'est pas une liste", () => {
    expect(() => parseMemoryItems('{"a":1}')).toThrow();
    expect(() => parseMemoryItems("pas du json")).toThrow();
  });
  it("garde au plus huit éléments", () => {
    expect(parseMemoryItems(JSON.stringify(Array.from({ length: 20 }, (_, i) => ({ source: "module", texte: `t${i}` }))))).toHaveLength(8);
  });
});
