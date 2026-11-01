import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("./env", () => ({ env: { supabaseUrl: "https://stock.example" } }));

let cleanHtml: typeof import("./richText").cleanHtml;
let htmlToText: typeof import("./richText").htmlToText;
beforeAll(async () => ({ cleanHtml, htmlToText } = await import("./richText")));

describe("nettoyage du texte mis en forme", () => {
  it("garde la mise en forme prévue", () => {
    const html = "<h2>Titre</h2><p><strong>gras</strong> et <em>italique</em></p><ul><li>un</li></ul><blockquote>cité</blockquote>";
    expect(cleanHtml(html)).toBe(html);
  });
  it("retire les scripts, les événements et les styles", () => {
    expect(cleanHtml('<p onclick="vol()" style="color:red">texte</p><script>vol()</script>')).toBe("<p>texte</p>");
    expect(cleanHtml('<iframe src="https://x.example"></iframe><p>ok</p>')).toBe("<p>ok</p>");
    expect(cleanHtml('<svg onload="vol()"></svg><p>ok</p>')).toBe("<p>ok</p>");
  });
  it("refuse les liens javascript et ouvre les autres dans un nouvel onglet", () => {
    expect(cleanHtml('<a href="javascript:vol()">x</a>')).not.toContain("javascript");
    expect(cleanHtml('<a href="https://site.example" onclick="vol()">x</a>')).toBe('<a href="https://site.example" target="_blank" rel="noopener noreferrer nofollow">x</a>');
  });
  it("n'accepte que les images de notre stockage", () => {
    const ok = "https://stock.example/storage/v1/object/public/forum-images/membre-1/a.png";
    expect(cleanHtml(`<img src="${ok}" alt="photo" onerror="vol()">`)).toBe(`<img src="${ok}" alt="photo" />`);
    expect(cleanHtml('<p>x</p><img src="https://pisteur.example/p.gif">')).toBe("<p>x</p>");
    expect(cleanHtml('<p>x</p><img src="https://stock.example/storage/v1/object/public/forum/a.png">')).toBe("<p>x</p>");
  });
});

describe("version sans mise en forme", () => {
  it("garde les retours à la ligne et rétablit les caractères", () => {
    expect(htmlToText("<p>Un &amp; deux</p><ul><li><p>trois</p></li></ul>")).toBe("Un & deux\ntrois");
    expect(htmlToText('<p></p><img src="x">')).toBe("");
  });
});
