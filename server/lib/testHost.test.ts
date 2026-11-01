import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => { vi.stubEnv("PRIVATE_DATA_KEY", Buffer.alloc(32, 7).toString("base64")); });
afterEach(() => { vi.useRealTimers(); });

describe("le lien signé d'un test", () => {
  it("ouvre ce test, pour ce membre", async () => {
    const { readTestToken, testToken } = await import("./testHost");
    expect(readTestToken(testToken(4, 3)!, 4)).toEqual({ memberId: 3, preview: false });
    expect(readTestToken(testToken(4, 2, true)!, 4)).toEqual({ memberId: 2, preview: true });
  });

  it("ne sert pas pour un autre test", async () => {
    const { readTestToken, testToken } = await import("./testHost");
    expect(readTestToken(testToken(4, 3)!, 5)).toBeNull();
  });

  it("refuse une signature ou un contenu modifié", async () => {
    const { readTestToken, testToken } = await import("./testHost");
    const token = testToken(4, 3)!;
    const parts = token.split(".");
    expect(readTestToken(`${token}x`, 4)).toBeNull();
    expect(readTestToken([parts[0], parts[1], "1", parts[3], parts[4]].join("."), 4)).toBeNull();
    expect(readTestToken([parts[0], "9", parts[2], parts[3], parts[4]].join("."), 4)).toBeNull();
    expect(readTestToken(undefined, 4)).toBeNull();
    expect(readTestToken("n'importe quoi", 4)).toBeNull();
  });

  it("expire après quelques heures", async () => {
    const { readTestToken, testToken } = await import("./testHost");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-01T10:00:00Z"));
    const token = testToken(4, 3)!;
    vi.setSystemTime(new Date("2026-11-01T13:59:00Z"));
    expect(readTestToken(token, 4)).not.toBeNull();
    vi.setSystemTime(new Date("2026-11-01T14:01:00Z"));
    expect(readTestToken(token, 4)).toBeNull();
  });
});

describe("l'isolement du test", () => {
  it("retire au test l'origine de l'application et tout accès au réseau", async () => {
    const { TEST_CSP } = await import("./testHost");
    expect(TEST_CSP.startsWith("sandbox ")).toBe(true);
    for (const forbidden of ["allow-same-origin", "allow-top-navigation", "allow-popups"]) expect(TEST_CSP).not.toContain(forbidden);
    for (const rule of ["default-src 'none'", "connect-src 'none'", "form-action 'none'", "base-uri 'none'", "frame-ancestors 'self'"]) expect(TEST_CSP).toContain(rule);
  });
});

describe("le fichier d'un test", () => {
  it("reconnaît le bloc qui envoie le résultat", async () => {
    const { hasResultBlock } = await import("./testHost");
    expect(hasResultBlock(`parent.postMessage({ type: "presence:test-result" }, "*")`)).toBe(true);
    expect(hasResultBlock("<html><body>Bonjour</body></html>")).toBe(false);
  });

  it("refuse ce qui n'est pas une page", async () => {
    const { looksLikeHtml } = await import("./testHost");
    expect(looksLikeHtml("<!doctype html><html></html>")).toBe(true);
    expect(looksLikeHtml("<div>Sans en-tête</div>")).toBe(true);
    expect(looksLikeHtml("juste du texte")).toBe(false);
    expect(looksLikeHtml("%PDF-1.7 <<")).toBe(false);
  });

  it("place son script avant le code du test", async () => {
    const { withBootstrap } = await import("./testHost");
    const withHead = withBootstrap(`<!doctype html><html><head lang="fr"><script>code()</script></head></html>`);
    expect(withHead.indexOf("presence:test-height")).toBeGreaterThan(withHead.indexOf("<head"));
    expect(withHead.indexOf("presence:test-height")).toBeLessThan(withHead.indexOf("code()"));
    const noHead = withBootstrap("<!doctype html><script>code()</script>");
    expect(noHead.startsWith("<!doctype html>")).toBe(true);
    expect(noHead.indexOf("presence:test-height")).toBeLessThan(noHead.indexOf("code()"));
    expect(withBootstrap("<script>code()</script>").indexOf("presence:test-height")).toBeLessThan(withBootstrap("<script>code()</script>").indexOf("code()"));
  });
});

describe("le catalogue", () => {
  const base = { htmlPath: "f.html", linkUrl: "", savesResult: true, htmlHasResultBlock: true, issues: [] as string[] };

  it("ce que les autres membres peuvent voir : un titre, jamais le texte", async () => {
    const { outcomeTitle } = await import("./testCatalog");
    expect(outcomeTitle({ label: " Stratège ", summary: "Texte privé", score: 82 })).toBe("Stratège");
    expect(outcomeTitle({ summary: "Texte privé", score: 82 })).toBe("82");
    expect(outcomeTitle({ summary: "Texte privé" })).toBe("");
    expect(outcomeTitle({ score: 0 })).toBe("0");
    expect(outcomeTitle(null)).toBe("");
  });

  it("un passage sans résultat reste sans résultat", async () => {
    const { parseOutcome } = await import("./testCatalog");
    expect(parseOutcome(null)).toBeNull();
    expect(parseOutcome("")).toBeNull();
    expect(parseOutcome(`{"label":"A"}`)).toEqual({ label: "A" });
    expect(parseOutcome("texte ancien")).toEqual({ summary: "texte ancien" });
  });

  it("signale ce qui empêche un test de fonctionner", async () => {
    const { testIssues } = await import("./testCatalog");
    expect(testIssues(base, 1)).toEqual([]);
    expect(testIssues({ ...base, htmlPath: "" }, 1).join()).toMatch(/Aucun fichier/);
    expect(testIssues(base, 0).join()).toMatch(/Aucun thème/);
    expect(testIssues({ ...base, htmlHasResultBlock: false }, 1).join()).toMatch(/n’envoie aucun résultat/);
    expect(testIssues({ ...base, savesResult: false }, 1).join()).toMatch(/cochez « Résultat enregistré »/);
  });

  it("un fichier déposé passe avant le lien, qui n'est alors plus contrôlé", async () => {
    const { testIssues, testOpens } = await import("./testCatalog");
    expect(testOpens({ htmlPath: "f.html", linkUrl: "" })).toBe(true);
    expect(testOpens({ htmlPath: "", linkUrl: "https://tests.example.com/a.html" })).toBe(true);
    expect(testOpens({ htmlPath: "", linkUrl: "http://exemple.com/a.html" })).toBe(false);
    expect(testOpens({ htmlPath: "", linkUrl: "" })).toBe(false);
    expect(testIssues({ ...base, linkUrl: "http://exemple.com/a.html" }, 1)).toEqual([]);
  });

  it("repère le thème qui appelle la mention médicale", async () => {
    const { isStressTheme } = await import("./testCatalog");
    expect(isStressTheme({ name: "Stress" })).toBe(true);
    expect(isStressTheme({ name: "Gestion du stress" })).toBe(true);
    expect(isStressTheme({ name: "Personnalité" })).toBe(false);
  });
});
