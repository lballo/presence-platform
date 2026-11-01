import { describe, expect, it } from "vitest";
import { datesBetween, occurrence } from "./recurrence";

describe("dates d'un événement récurrent", () => {
  it("toutes les deux semaines, à la même heure", () => {
    const first = new Date("2026-11-05T18:00:00Z"); // jeudi 5 novembre, 19 h à Paris
    expect(occurrence(first, "deux_semaines", 1).toISOString()).toBe("2026-11-19T18:00:00.000Z");
    expect(occurrence(first, "deux_semaines", 2).toISOString()).toBe("2026-12-03T18:00:00.000Z");
  });
  it("chaque semaine", () => {
    expect(occurrence(new Date("2026-11-05T18:00:00Z"), "semaine", 3).toISOString()).toBe("2026-11-26T18:00:00.000Z");
  });
  it("garde l'heure de Paris quand on passe à l'heure d'hiver", () => {
    const first = new Date("2026-10-15T17:00:00Z"); // 19 h à Paris, heure d'été
    expect(occurrence(first, "deux_semaines", 1).toISOString()).toBe("2026-10-29T18:00:00.000Z"); // 19 h à Paris, heure d'hiver
  });
  it("garde l'heure de Paris quand on passe à l'heure d'été", () => {
    const first = new Date("2027-03-18T18:00:00Z"); // 19 h à Paris, heure d'hiver
    expect(occurrence(first, "deux_semaines", 1).toISOString()).toBe("2027-04-01T17:00:00.000Z"); // 19 h à Paris, heure d'été
  });
  it("garde l'heure le jour même du changement d'heure", () => {
    const first = new Date("2026-10-18T18:00:00Z"); // dimanche 18 octobre, 20 h à Paris
    expect(occurrence(first, "semaine", 1).toISOString()).toBe("2026-10-25T19:00:00.000Z"); // dimanche 25 octobre, 20 h à Paris
  });
  it("chaque mois, à la même date", () => {
    const first = new Date("2026-11-10T18:00:00Z");
    expect(occurrence(first, "mois", 1).toISOString()).toBe("2026-12-10T18:00:00.000Z");
    expect(occurrence(first, "mois", 2).toISOString()).toBe("2027-01-10T18:00:00.000Z");
  });
  it("un 31 revient au dernier jour des mois plus courts, sans rester bloqué", () => {
    const first = new Date("2027-01-31T18:00:00Z");
    expect(occurrence(first, "mois", 1).toISOString()).toBe("2027-02-28T18:00:00.000Z");
    expect(occurrence(first, "mois", 2).toISOString()).toBe("2027-03-31T17:00:00.000Z");
  });
  it("ne donne que les dates entre deux bornes", () => {
    const first = new Date("2026-11-05T18:00:00Z");
    const dates = datesBetween(first, "deux_semaines", new Date("2026-11-20T00:00:00Z"), new Date("2026-12-20T00:00:00Z"));
    expect(dates.map((d) => d.toISOString())).toEqual(["2026-12-03T18:00:00.000Z", "2026-12-17T18:00:00.000Z"]);
  });
  it("ne redonne pas la date de départ", () => {
    const first = new Date("2026-11-05T18:00:00Z");
    expect(datesBetween(first, "semaine", first, new Date("2026-11-13T00:00:00Z")).map((d) => d.toISOString())).toEqual(["2026-11-12T18:00:00.000Z"]);
  });
});
