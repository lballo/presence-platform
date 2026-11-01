import { describe, expect, it } from "vitest";
import { audiencesOf, canReadPost, postState, type AccessType } from "./forumAccess";
import type { MemberRole } from "./permissions";

const person = (role: MemberRole, accessType: AccessType = "collectif", id = 1) => ({ id, role, status: "actif" as const, accessEndsAt: null, accessType });
const hier = new Date(Date.now() - 86400000);
const demain = new Date(Date.now() + 86400000);
const post = (over: Partial<Parameters<typeof canReadPost>[1]> = {}) => ({ authorId: 99, hiveId: null, status: "published" as const, audience: "tous" as const, publishedAt: hier, endsAt: null, ...over });

describe("public visé", () => {
  it("relie chaque type d'accompagnement à ses publics", () => {
    expect(audiencesOf("collectif")).toEqual(["tous", "collectif"]);
    expect(audiencesOf("individuel")).toEqual(["tous", "accompagnement"]);
    expect(audiencesOf("les_deux")).toEqual(["tous", "collectif", "accompagnement"]);
  });
  it("une annonce réservée n'est lue que par les personnes concernées", () => {
    expect(canReadPost(person("membre", "collectif"), post({ audience: "accompagnement" }))).toBe(false);
    expect(canReadPost(person("membre", "individuel"), post({ audience: "accompagnement" }))).toBe(true);
    expect(canReadPost(person("membre", "individuel"), post({ audience: "collectif" }))).toBe(false);
    expect(canReadPost(person("membre", "les_deux"), post({ audience: "collectif" }))).toBe(true);
    expect(canReadPost(person("administrateur", "collectif"), post({ audience: "accompagnement" }))).toBe(true);
  });
});

describe("état d'une publication", () => {
  it("programmée, en ligne, terminée, en relecture", () => {
    expect(postState(post({ publishedAt: demain }))).toBe("scheduled");
    expect(postState(post())).toBe("live");
    expect(postState(post({ endsAt: hier }))).toBe("ended");
    expect(postState(post({ endsAt: demain }))).toBe("live");
    expect(postState(post({ status: "pending" }))).toBe("pending");
    expect(postState(post({ status: "rejected" }))).toBe("rejected");
  });
  it("programmée, en relecture ou terminée : seuls l'auteur et l'équipe la voient", () => {
    for (const over of [{ publishedAt: demain }, { status: "pending" as const }, { status: "rejected" as const }, { endsAt: hier }]) {
      expect(canReadPost(person("membre"), post(over))).toBe(false);
      expect(canReadPost(person("membre", "collectif", 99), post(over))).toBe(true);
      expect(canReadPost(person("administrateur"), post(over))).toBe(true);
    }
  });
});

describe("annonces de ruche", () => {
  const annonce = (over = {}) => post({ hiveId: 3, ...over });
  it("ruche sur validation : réservée à ses membres", () => {
    expect(canReadPost(person("membre"), annonce(), { hiveRole: "", hiveOpen: false })).toBe(false);
    expect(canReadPost(person("membre"), annonce(), { hiveRole: "pending", hiveOpen: false })).toBe(false);
    expect(canReadPost(person("membre"), annonce(), { hiveRole: "member", hiveOpen: false })).toBe(true);
  });
  it("ruche en adhésion libre : lisible par tout membre du réseau", () => {
    expect(canReadPost(person("membre"), annonce(), { hiveRole: "", hiveOpen: true })).toBe(true);
  });
  it("programmée : visible des leaders, pas des membres de la ruche", () => {
    const later = annonce({ publishedAt: demain });
    expect(canReadPost(person("membre"), later, { hiveRole: "member", hiveOpen: true })).toBe(false);
    expect(canReadPost(person("membre"), later, { hiveRole: "leader", hiveOpen: true })).toBe(true);
    expect(canReadPost(person("membre"), later, { hiveRole: "founder", hiveOpen: false })).toBe(true);
  });
});
