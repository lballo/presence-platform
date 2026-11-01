import { beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => { vi.stubEnv("PRIVATE_DATA_KEY", Buffer.alloc(32, 9).toString("base64")); });

describe("modèles", () => {
  it("remplace les variables, une inconnue disparaît", async () => {
    const { fillTemplate } = await import("./email");
    expect(fillTemplate("Bonjour {{prenom}}, {{module}} {{rien}}!", { prenom: "Sofia", module: "Valeurs" })).toBe("Bonjour Sofia, Valeurs !");
  });
});

describe("mise en page", () => {
  const base = { body: "Bonjour <b>Sofia</b>,\n\nDeux lignes\nici.", cta: { label: "Ouvrir", href: "https://exemple.org/a?x=1&y=2" }, reason: "Raison", unsubscribeUrl: "https://exemple.org/stop?t=a&m=1" };
  it("échappe le texte et les liens", async () => {
    const { renderEmail } = await import("./email");
    const { html } = renderEmail(base);
    expect(html).not.toContain("<b>Sofia</b>");
    expect(html).toContain("&lt;b&gt;Sofia");
    expect(html).toContain("x=1&amp;y=2");
  });
  it("garde les paragraphes et les retours à la ligne", async () => {
    const { renderEmail } = await import("./email");
    const { html } = renderEmail(base);
    expect(html.match(/<p style="margin:0 0 16px/g)).toHaveLength(2);
    expect(html).toContain("Deux lignes<br>ici.");
  });
  it("donne toujours une version texte et le lien de désinscription", async () => {
    const { renderEmail } = await import("./email");
    const { html, text } = renderEmail(base);
    expect(text).toContain("Ouvrir : https://exemple.org/a?x=1&y=2");
    expect(text).toContain("Ne plus recevoir ces e-mails : https://exemple.org/stop?t=a&m=1");
    expect(html).toContain("Ne plus recevoir ces e-mails");
  });
});

describe("lien de désinscription", () => {
  it("n'est valable que pour ce membre et ce type", async () => {
    const { unsubscribeToken, validUnsubscribe } = await import("./email");
    const t = unsubscribeToken(3, "formations");
    expect(validUnsubscribe(3, "formations", t)).toBe(true);
    expect(validUnsubscribe(4, "formations", t)).toBe(false);
    expect(validUnsubscribe(3, "marketing", t)).toBe(false);
    expect(validUnsubscribe(3, "inconnu", t)).toBe(false);
    expect(validUnsubscribe(3, "formations", "faux")).toBe(false);
    expect(validUnsubscribe(3, "formations", undefined)).toBe(false);
  });
});
