import { beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  vi.stubEnv("PRIVATE_DATA_KEY", Buffer.alloc(32, 7).toString("base64"));
  vi.stubEnv("APP_URL", "https://presence.exemple.org");
});

describe("lien d'abonnement", () => {
  it("signe la fiche et la retrouve, refuse une signature d'une autre fiche", async () => {
    const { agendaLinks, memberFromAgendaFile } = await import("./agenda");
    const { feedUrl, webcalUrl, googleUrl } = agendaLinks(12);
    expect(feedUrl).toMatch(/^https:\/\/presence\.exemple\.org\/api\/agenda\/12-[A-Za-z0-9_-]{32}\.ics$/);
    expect(webcalUrl.startsWith("webcal://presence.exemple.org/api/agenda/12-")).toBe(true);
    expect(googleUrl).toBe(`https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcalUrl)}`);
    const file = feedUrl.split("/").pop()!;
    expect(memberFromAgendaFile(file)).toBe(12);
    expect(memberFromAgendaFile(file.replace(/^12-/, "13-"))).toBeNull();
    expect(memberFromAgendaFile("12-court.ics")).toBeNull();
    expect(memberFromAgendaFile("../12.ics")).toBeNull();
  });
});

describe("fichier iCalendar", () => {
  it("échappe le texte", async () => {
    const { icsText } = await import("./agenda");
    expect(icsText("Dîner; rire, et\nsuite \\ fin")).toBe("Dîner\\; rire\\, et\\nsuite \\\\ fin");
  });
  it("replie les longues lignes à 75 octets sans couper un accent", async () => {
    const { fold } = await import("./agenda");
    const line = `SUMMARY:${"é".repeat(60)}`;
    const parts = fold(line).split("\r\n");
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(Buffer.byteLength(p)).toBeLessThanOrEqual(75);
    expect(parts.slice(1).every((p) => p.startsWith(" "))).toBe(true);
    expect(parts.map((p, i) => (i ? p.slice(1) : p)).join("")).toBe(line);
  });
  it("décrit chaque rendez-vous, en heure universelle, avec son état", async () => {
    const { buildIcs } = await import("./agenda");
    const ics = buildIcs([
      { uid: "evenement-5@presence", title: "Dîner du Cercle", start: new Date("2026-12-03T18:30:00Z"), end: new Date("2026-12-03T21:00:00Z"), location: "12 rue de la Paix, Paris", url: "https://presence.exemple.org/e/diner", status: "CONFIRMED" },
      { uid: "evenement-6@presence", title: "Annulé", start: new Date("2026-12-04T08:00:00Z"), end: new Date("2026-12-04T09:00:00Z"), status: "CANCELLED" },
    ], new Date("2026-11-04T10:00:00Z"));
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("DTSTART:20261203T183000Z\r\nDTEND:20261203T210000Z");
    expect(ics).toContain("LOCATION:12 rue de la Paix\\, Paris");
    expect(ics).toContain("STATUS:CANCELLED");
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).not.toMatch(/[^\r]\n/);
  });
});
