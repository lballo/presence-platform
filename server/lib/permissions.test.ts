import { describe, expect, it } from "vitest";
import { accountBlock, can, type Actor, type MemberRole } from "./permissions";

const actor = (role: MemberRole, id = 1): Actor => ({ id, role, status: "actif", accessEndsAt: null });
const membre = actor("membre");
const orga = actor("organisateur");
const admin = actor("administrateur");

describe("compte", () => {
  it("refuse un compte suspendu, terminé ou dont l'accès est dépassé", () => {
    expect(accountBlock({ status: "suspendu", accessEndsAt: null })).toBe("suspendu");
    expect(accountBlock({ status: "termine", accessEndsAt: null })).toBe("termine");
    expect(accountBlock({ status: "actif", accessEndsAt: new Date(Date.now() - 1000) })).toBe("expire");
    expect(accountBlock({ status: "actif", accessEndsAt: new Date(Date.now() + 60000) })).toBeNull();
    expect(can({ ...admin, status: "suspendu" }, "profile.use")).toBe(false);
    expect(can({ ...admin, accessEndsAt: new Date(0) }, "moderate")).toBe(false);
    expect(can(null, "profile.use")).toBe(false);
  });
});

describe("tous les rôles", () => {
  it.each(["profile.use", "forum.use", "messages.use", "matching.use", "events.register", "hive.create", "event.propose"] as const)("%s", (action) => {
    for (const m of [membre, orga, admin]) expect(can(m, action)).toBe(true);
  });
});

describe("événements Présence", () => {
  it("publication directe : organisateur et administrateur", () => {
    expect(can(membre, "event.publish_directly")).toBe(false);
    expect(can(orga, "event.publish_directly")).toBe(true);
    expect(can(admin, "event.publish_directly")).toBe(true);
  });
  it("gérer : celui qui l'a créé et l'administrateur", () => {
    expect(can(orga, "event.edit", { ownerId: orga.id })).toBe(true);
    expect(can(orga, "event.edit", { ownerId: 99 })).toBe(false);
    expect(can(admin, "event.edit", { ownerId: 99 })).toBe(true);
    expect(can(membre, "event.edit", { ownerId: membre.id })).toBe(true);
    expect(can(membre, "event.edit", { ownerId: 99 })).toBe(false);
  });
  it("un membre retire sa proposition, pas un événement publié", () => {
    expect(can(membre, "event.withdraw", { ownerId: membre.id, status: "pending" })).toBe(true);
    expect(can(membre, "event.withdraw", { ownerId: membre.id, status: "published" })).toBe(false);
    expect(can(membre, "event.withdraw", { ownerId: 99, status: "pending" })).toBe(false);
  });
});

describe("ruches", () => {
  it("fondatrice et leaders valident, créent des événements et nomment des leaders", () => {
    for (const action of ["hive.validate_member", "hive.create_event", "hive.name_leader"] as const) {
      expect(can(membre, action, { hiveRole: "founder" })).toBe(true);
      expect(can(membre, action, { hiveRole: "leader" })).toBe(true);
      expect(can(membre, action, { hiveRole: "member" })).toBe(false);
      expect(can(orga, action, { hiveRole: "" })).toBe(false);
      expect(can(admin, action, { hiveRole: "" })).toBe(true);
    }
  });
  it("retirer un leader : fondatrice et administrateur", () => {
    expect(can(membre, "hive.remove_leader", { hiveRole: "leader" })).toBe(false);
    expect(can(membre, "hive.remove_leader", { hiveRole: "founder" })).toBe(true);
    expect(can(admin, "hive.remove_leader", { hiveRole: "" })).toBe(true);
  });
  it("supprimer une ruche : administrateur seulement, même pas la fondatrice", () => {
    expect(can(membre, "hive.delete", { hiveRole: "founder" })).toBe(false);
    expect(can(orga, "hive.delete", { hiveRole: "founder" })).toBe(false);
    expect(can(admin, "hive.delete")).toBe(true);
  });
  it("créer une annonce de ruche : fondatrice, leaders et administrateur", () => {
    expect(can(membre, "hive.announce", { hiveRole: "founder" })).toBe(true);
    expect(can(membre, "hive.announce", { hiveRole: "leader" })).toBe(true);
    expect(can(membre, "hive.announce", { hiveRole: "member" })).toBe(false);
    expect(can(orga, "hive.announce", { hiveRole: "" })).toBe(false);
    expect(can(admin, "hive.announce", { hiveRole: "" })).toBe(true);
  });
  it("un événement de ruche se modifie par le leader qui l'a créé", () => {
    expect(can(membre, "event.edit", { ownerId: membre.id, hiveId: 3, hiveRole: "leader" })).toBe(true);
    expect(can(membre, "event.edit", { ownerId: membre.id, hiveId: 3, hiveRole: "member" })).toBe(false);
    expect(can(orga, "event.edit", { ownerId: orga.id, hiveId: 3, hiveRole: "member" })).toBe(false);
  });
});

describe("administrateur seulement", () => {
  it.each(["event.validate", "talk.validate", "opportunity.validate", "organizer.validate", "members.manage", "admin.panel", "moderate", "hive.delete", "forum.manage", "forum.post_restricted", "course.build"] as const)("%s", (action) => {
    expect(can(membre, action)).toBe(false);
    expect(can(orga, action)).toBe(false);
    expect(can(admin, action)).toBe(true);
  });
  it("modération : supprimer le contenu d'un autre", () => {
    expect(can(membre, "content.delete", { ownerId: 99 })).toBe(false);
    expect(can(orga, "content.delete", { ownerId: 99 })).toBe(false);
    expect(can(admin, "content.delete", { ownerId: 99 })).toBe(true);
    expect(can(admin, "content.edit", { ownerId: 99 })).toBe(false);
  });
});
