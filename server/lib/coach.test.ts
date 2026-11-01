import { describe, expect, it } from "vitest";
import { answerMemory, challengeMemory, testMemory } from "./coach";

describe("ce qui entre dans la mémoire du coach : les mots du membre", () => {
  it("une réponse garde sa question", () => {
    expect(answerMemory("Qu’est-ce qui est juste ?", "Dire non plus tôt.")).toBe("À « Qu’est-ce qui est juste ? », a répondu : Dire non plus tôt.");
  });
  it("une réflexion libre n'a pas de question", () => {
    expect(answerMemory("", "Je respire mieux.")).toBe("Réflexion : Je respire mieux.");
  });
  it("un test donne son libellé et son résumé", () => {
    expect(testMemory(JSON.stringify({ label: "Bâtisseur", summary: "Vous structurez." }))).toBe("Résultat du test : Bâtisseur : Vous structurez.");
  });
  it("un test illisible reste tel quel", () => {
    expect(testMemory("pas du json")).toBe("Résultat du test : pas du json");
    expect(testMemory(JSON.stringify({ label: "Stratège" }), "Mon profil")).toBe("Résultat du test « Mon profil » : Stratège");
    expect(testMemory(JSON.stringify({ label: "Bâtisseur" }), "Mes moteurs", ["Drivers", "Voie professionnelle"])).toBe("Résultat du test « Mes moteurs » (thèmes : Drivers, Voie professionnelle) : Bâtisseur");
    expect(testMemory(JSON.stringify({ label: "Vigilant" }), "Mon stress", ["Stress"])).toBe("Résultat du test « Mon stress » (thème : Stress) : Vigilant");
  });
  it("un défi garde la note si elle existe", () => {
    expect(challengeMemory("Fondations", "")).toBe("A relevé le défi de « Fondations ».");
    expect(challengeMemory("Fondations", "C’était fort.")).toBe("A relevé le défi de « Fondations » : C’était fort.");
  });
});
