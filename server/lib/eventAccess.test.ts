import { describe, expect, it } from "vitest";
import { canViewEvent, eventAccess, eventDenial, slugify } from "./eventAccess";
import type { MemberRole } from "./permissions";

const person = (role: MemberRole = "membre", id = 1) => ({ id, role, status: "actif" as const, accessEndsAt: null });
const reseau = (over = {}) => ({ hostId: 99, hiveId: null, status: "published", visibility: "membres", ...over });
const ruche = (over = {}) => ({ ...reseau(), hiveId: 3, ...over });

describe("voir un événement du réseau", () => {
  it("public : tout le monde, même sans compte", () => {
    expect(canViewEvent(null, reseau({ visibility: "public" }))).toBe(true);
  });
  it("membres : uniquement les membres connectés et actifs", () => {
    expect(canViewEvent(null, reseau())).toBe(false);
    expect(canViewEvent(person(), reseau())).toBe(true);
    expect(canViewEvent({ ...person(), status: "suspendu" }, reseau())).toBe(false);
    expect(canViewEvent({ ...person(), status: "suspendu" }, reseau({ visibility: "public" }))).toBe(true);
  });
  it("non publié : celui qui l'a créé et l'administrateur", () => {
    expect(canViewEvent(person(), reseau({ status: "pending" }))).toBe(false);
    expect(canViewEvent(person(), reseau({ status: "pending", visibility: "public" }))).toBe(false);
    expect(canViewEvent(null, reseau({ status: "pending", visibility: "public" }))).toBe(false);
    expect(canViewEvent(person("membre", 99), reseau({ status: "pending" }))).toBe(true);
    expect(canViewEvent(person("administrateur"), reseau({ status: "pending" }))).toBe(true);
  });
});

describe("voir un événement de ruche", () => {
  it("réservé aux membres de la ruche, jamais public", () => {
    expect(canViewEvent(null, ruche({ visibility: "public" }))).toBe(false);
    expect(canViewEvent(person(), ruche({ visibility: "public" }), "")).toBe(false);
    expect(canViewEvent(person(), ruche(), "pending")).toBe(false);
    expect(canViewEvent(person(), ruche(), "member")).toBe(true);
    expect(canViewEvent(person(), ruche(), "leader")).toBe(true);
    expect(canViewEvent(person("organisateur"), ruche(), "")).toBe(false);
    expect(canViewEvent(person("administrateur"), ruche(), "")).toBe(true);
  });
  it("le visiteur n'apprend rien de la ruche", () => {
    expect(eventDenial(null, ruche())).toBe("connexion");
    expect(eventDenial(person(), ruche())).toBe("ruche");
    expect(eventDenial(person(), ruche({ status: "pending" }))).toBe("introuvable");
  });
});

describe("adresse et lien de visio", () => {
  it("n'apparaissent que si la personne y a droit", () => {
    const e = { address: "12 rue Mercière", meetingUrl: "", kind: "onsite" };
    expect(eventAccess(e, false)).toEqual({ hasAccessInfo: true, address: "", meetingUrl: "" });
    expect(eventAccess(e, true).address).toBe("12 rue Mercière");
    const v = { address: "", meetingUrl: "https://visio.example/x", kind: "online" };
    expect(eventAccess(v, false).meetingUrl).toBe("");
    expect(eventAccess(v, true).meetingUrl).toBe("https://visio.example/x");
  });
});

describe("adresse de la page", () => {
  it("se déduit du titre", () => {
    expect(slugify("Dîner du Cercle : oser son autorité")).toBe("diner-du-cercle-oser-son-autorite");
    expect(slugify("  Été & Œuvres !  ")).toBe("ete-oeuvres");
    expect(slugify("???")).toBe("evenement");
  });
});
