import { describe, expect, it } from "vitest";
import { courseIsVisible, isAssigned, moduleIsOpen, moduleOpensAt, testUrlProblem } from "./courseAccess";

const start = new Date("2026-11-04T15:30:00Z"); // un mercredi après-midi, heure de Paris

describe("calendrier d'ouverture", () => {
  it("le premier module s'ouvre au démarrage", () => {
    expect(moduleOpensAt(start, 1)).toEqual(start);
  });
  it("le suivant s'ouvre une semaine plus tard, à minuit à Paris", () => {
    expect(moduleOpensAt(start, 2).toISOString()).toBe("2026-11-10T23:00:00.000Z");
    expect(moduleOpensAt(start, 3).toISOString()).toBe("2026-11-17T23:00:00.000Z");
  });
  it("le changement d'heure ne décale pas minuit", () => {
    // Démarrage en heure d'été, ouverture en heure d'hiver : minuit à Paris vaut alors 23 h UTC
    expect(moduleOpensAt(new Date("2026-10-20T10:00:00Z"), 2).toISOString()).toBe("2026-10-26T23:00:00.000Z");
    // Démarrage en heure d'hiver, ouverture en heure d'été : minuit à Paris vaut alors 22 h UTC
    expect(moduleOpensAt(new Date("2027-03-25T10:00:00Z"), 2).toISOString()).toBe("2027-03-31T22:00:00.000Z");
  });
  it("un démarrage juste après minuit à Paris reste sur le bon jour", () => {
    expect(moduleOpensAt(new Date("2026-11-03T23:30:00Z"), 2).toISOString()).toBe("2026-11-10T23:00:00.000Z");
  });
});

describe("module ouvert", () => {
  const base = { startedAt: start, position: 2, rhythm: "hebdo" as const, fullAccess: false };
  it("fermé avant sa date, ouvert après", () => {
    expect(moduleIsOpen(base, new Date("2026-11-10T22:59:00Z"))).toBe(false);
    expect(moduleIsOpen(base, new Date("2026-11-10T23:00:00Z"))).toBe(true);
  });
  it("sans démarrage, rien n'est ouvert", () => {
    expect(moduleIsOpen({ ...base, startedAt: null, position: 1 })).toBe(false);
  });
  it("l'accès complet ouvre tout, et le retrait referme ce qui n'a été ouvert que par lui", () => {
    const now = new Date("2026-11-05T10:00:00Z");
    expect(moduleIsOpen({ ...base, fullAccess: true }, now)).toBe(true);
    expect(moduleIsOpen({ ...base, openedAt: now, openedViaFullAccess: true }, now)).toBe(false);
  });
  it("un module ouvert selon le calendrier reste ouvert si son ordre change", () => {
    const now = new Date("2026-11-20T10:00:00Z");
    expect(moduleIsOpen({ ...base, position: 8, openedAt: new Date("2026-11-12T10:00:00Z") }, now)).toBe(true);
  });
  it("le rythme « Accès complet » ouvre tout dès le départ", () => {
    expect(moduleIsOpen({ ...base, position: 8, rhythm: "complet" }, start)).toBe(true);
  });
});

describe("attribution", () => {
  const collectif = { id: 3, accessType: "collectif" as const };
  const lesDeux = { id: 4, accessType: "les_deux" as const };
  const none = { memberId: null, accessType: null, tagId: null };
  it("à un membre", () => {
    expect(isAssigned(collectif, [], [{ ...none, memberId: 3 }])).toBe(true);
    expect(isAssigned(collectif, [], [{ ...none, memberId: 9 }])).toBe(false);
  });
  it("à un type d'accès : « les deux » comprend les deux autres", () => {
    expect(isAssigned(collectif, [], [{ ...none, accessType: "collectif" }])).toBe(true);
    expect(isAssigned(collectif, [], [{ ...none, accessType: "individuel" }])).toBe(false);
    expect(isAssigned(lesDeux, [], [{ ...none, accessType: "individuel" }])).toBe(true);
  });
  it("à une étiquette", () => {
    expect(isAssigned(collectif, [7], [{ ...none, tagId: 7 }])).toBe(true);
    expect(isAssigned(collectif, [8], [{ ...none, tagId: 7 }])).toBe(false);
  });
  it("visibilité", () => {
    expect(courseIsVisible({ public: "tous" }, false, false)).toBe(true);
    expect(courseIsVisible({ public: "attribution" }, false, false)).toBe(false);
    expect(courseIsVisible({ public: "attribution" }, true, false)).toBe(true);
    expect(courseIsVisible({ public: "attribution" }, false, true)).toBe(true);
  });
});

describe("adresse d'un test", () => {
  const app = "https://presence-platform.onrender.com";
  it("accepte un autre domaine en https", () => expect(testUrlProblem("https://tests.example.com/leader.html", app)).toBeNull());
  it("refuse le domaine de l'application", () => expect(testUrlProblem(`${app}/test.html`, app)).toMatch(/autre domaine/));
  it("refuse http hors essai local", () => expect(testUrlProblem("http://tests.example.com/a.html", app)).toMatch(/https/));
  it("refuse une adresse invalide", () => expect(testUrlProblem("pas une adresse", app)).toMatch(/valide/));
  it("un champ vide n'est pas une erreur", () => expect(testUrlProblem("", app)).toBeNull());
});
