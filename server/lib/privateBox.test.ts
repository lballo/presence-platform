import { beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => { vi.stubEnv("PRIVATE_DATA_KEY", Buffer.alloc(32, 7).toString("base64")); });

describe("le coffre", () => {
  it("rend le texte à son membre, et à lui seul", async () => {
    const { open, seal } = await import("./privateBox");
    const sealed = seal(3, "Mon secret");
    expect(sealed).not.toContain("secret");
    expect(open(3, sealed)).toBe("Mon secret");
    expect(open(4, sealed)).toBeNull();
  });
  it("deux chiffrements du même texte diffèrent", async () => {
    const { seal } = await import("./privateBox");
    expect(seal(3, "x")).not.toBe(seal(3, "x"));
  });
  it("un texte altéré est refusé, sans erreur", async () => {
    const { open, seal } = await import("./privateBox");
    const sealed = seal(3, "Mon secret");
    expect(open(3, `${sealed.slice(0, -2)}AA`)).toBeNull();
    expect(open(3, "n'importe quoi")).toBeNull();
  });
});
