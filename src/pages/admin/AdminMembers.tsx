import { useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { Copy, Search, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { trpc, type RouterOutputs } from "@/providers/trpc";
import { Avatar } from "@/components/Avatar";
import { parisToDate } from "@/lib/format";
import { Badge, Rows, Select, type Column } from "./shared";
import { ACCESS_LABEL, ROLE_LABEL, STATE_LABEL, fullDate, stateTone, type MemberState } from "./labels";

type Row = RouterOutputs["admin"]["members"][number];
const DAY = 86400000;
const recent = (d: Date | null, days: number) => !!d && Date.now() - +new Date(d) < days * DAY;

/** Les listes prêtes à l'emploi, depuis les compteurs de l'accueil. */
const VIEWS: Record<string, { label: string; test: (m: Row) => boolean }> = {
  actifs: { label: "Membres actifs", test: (m) => m.state === "actif" },
  nouveaux: { label: "Nouveaux membres sur 30 jours", test: (m) => m.state === "actif" && recent(m.joinedAt, 30) },
  fin: { label: "Accès qui se terminent dans les 15 jours", test: (m) => m.state === "actif" && !!m.accessEndsAt && +new Date(m.accessEndsAt) - Date.now() < 15 * DAY },
  sans_bienvenue: { label: "Nouveaux membres pas encore inscrits à une réunion de bienvenue", test: (m) => needsWelcome(m) },
};
const needsWelcome = (m: Row) => (m.state === "actif" || m.state === "invite") && !m.welcomeRegistered && (recent(m.joinedAt, 90) || recent(m.invitedAt, 90));

const columns: Column<Row>[] = [
  { key: "name", label: "Membre", cell: (m) => <span className="flex items-center gap-3 min-w-0"><Avatar m={m} size={36} /><span className="flex flex-col min-w-0"><span className="font-semibold truncate">{m.name}</span><span className="text-[12.5px] p-muted truncate">{m.email ?? m.jobTitle ?? ""}</span></span></span> },
  { key: "role", label: "Rôle", cell: (m) => ROLE_LABEL[m.role] },
  { key: "access", label: "Accès", cell: (m) => <span className="flex flex-col">{ACCESS_LABEL[m.accessType]}{m.accessEndsAt && <span className="text-[12.5px] p-muted">jusqu’au {fullDate(m.accessEndsAt)}</span>}</span> },
  { key: "state", label: "Statut", cell: (m) => <Badge tone={stateTone(m.state)}>{STATE_LABEL[m.state]}</Badge> },
  { key: "onboarding", label: "Parcours d’accueil", short: "Accueil", cell: (m) => (m.onboardingDone ? "Fait" : "Pas encore") },
  { key: "welcome", label: "Réunion de bienvenue", short: "Bienvenue", cell: (m) => (m.welcomeAttended ? "Présent·e" : m.welcomeRegistered ? "Inscrit·e" : "Pas inscrit·e") },
];

export default function AdminMembers() {
  const [params, setParams] = useSearchParams();
  const view = VIEWS[params.get("vue") ?? ""] ? params.get("vue")! : "";
  const list = trpc.admin.members.useQuery();
  const [q, setQ] = useState("");
  const [role, setRole] = useState<"" | Row["role"]>("");
  const [access, setAccess] = useState<"" | Row["accessType"]>("");
  const [state, setState] = useState<"visibles" | MemberState>("visibles");
  const [onboarding, setOnboarding] = useState<"" | "fait" | "non">("");
  const [welcome, setWelcome] = useState<"" | "present" | "inscrit" | "non">("");
  const [inviting, setInviting] = useState(false);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (list.data ?? []).filter((m) =>
      (!view || VIEWS[view].test(m)) &&
      (!term || m.name.toLowerCase().includes(term) || (m.email ?? "").toLowerCase().includes(term)) &&
      (!role || m.role === role) && (!access || m.accessType === access) &&
      (state === "visibles" ? m.state !== "supprime" : m.state === state) &&
      (!onboarding || m.onboardingDone === (onboarding === "fait")) &&
      (!welcome || (welcome === "present" ? m.welcomeAttended : welcome === "inscrit" ? m.welcomeRegistered && !m.welcomeAttended : !m.welcomeRegistered))
    );
  }, [list.data, q, role, access, state, onboarding, welcome, view]);
  const waiting = (list.data ?? []).filter(needsWelcome).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="m-0 text-[30px]">{list.data ? `${rows.length} membre${rows.length > 1 ? "s" : ""}` : "Membres"}</h2>
        <button type="button" className="p-btn-primary p-btn-sm" onClick={() => setInviting(!inviting)}><UserPlus size={15} /> Inviter un membre</button>
      </div>
      {inviting && <InviteForm onClose={() => setInviting(false)} />}
      {view ? (
        <div className="p-soft px-4 py-3 flex items-center justify-between gap-3 text-[14px]">
          <span>{VIEWS[view].label}</span>
          <button type="button" aria-label="Retirer ce filtre" className="w-9 h-9 flex-none rounded-full flex items-center justify-center" onClick={() => setParams({})}><X size={16} /></button>
        </div>
      ) : waiting > 0 && (
        <button type="button" className="p-soft px-4 py-3 text-left text-[14px] font-medium" onClick={() => setParams({ vue: "sans_bienvenue" })}>{waiting} nouveau{waiting > 1 ? "x" : ""} membre{waiting > 1 ? "s" : ""} pas encore inscrit{waiting > 1 ? "s" : ""} à une réunion de bienvenue →</button>
      )}
      <label className="relative block">
        <span className="sr-only">Rechercher un membre</span>
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 p-faint" />
        <input className="p-field w-full !pl-10" type="search" placeholder="Nom ou adresse e-mail" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <div className="grid gap-2.5 grid-cols-2 lg:grid-cols-5">
        <Select label="Rôle" value={role} onChange={setRole} options={[["", "Tous"], ["membre", "Membre"], ["organisateur", "Organisateur"], ["administrateur", "Administrateur"]]} />
        <Select label="Type d’accès" value={access} onChange={setAccess} options={[["", "Tous"], ["collectif", "Collectif"], ["individuel", "Individuel"], ["les_deux", "Les deux"]]} />
        <Select label="Statut" value={state} onChange={setState} options={[["visibles", "Tous"], ...(Object.entries(STATE_LABEL) as [MemberState, string][])]} />
        <Select label="Parcours d’accueil" value={onboarding} onChange={setOnboarding} options={[["", "Tous"], ["fait", "Fait"], ["non", "Pas encore"]]} />
        <Select label="Réunion de bienvenue" value={welcome} onChange={setWelcome} options={[["", "Tous"], ["present", "Présent·e"], ["inscrit", "Inscrit·e"], ["non", "Pas inscrit·e"]]} />
      </div>
      {list.isLoading ? <p className="p-muted text-center py-10 m-0">Chargement…</p> : <Rows rows={rows} columns={columns} keyOf={(m) => m.id} hrefOf={(m) => `/admin/membres/${m.id}`} empty="Aucun membre ne correspond à ces filtres." />}
    </div>
  );
}

/** Formulaire d'invitation : envoie un vrai e-mail. */
export function InviteForm({ onClose, fiche }: { onClose?: () => void; fiche?: { id: number; firstName: string; lastName: string; role: Row["role"]; accessType: Row["accessType"]; accessEndsAt: Date | null } }) {
  const utils = trpc.useUtils();
  const [f, setF] = useState({ firstName: fiche?.firstName ?? "", lastName: fiche?.lastName ?? "", email: "", role: fiche?.role ?? ("membre" as Row["role"]), accessType: fiche?.accessType ?? ("collectif" as Row["accessType"]), ends: "" });
  const [sent, setSent] = useState<{ url: string; email: string } | null>(null);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const invite = trpc.admin.invite.useMutation({
    onSuccess: (r) => { utils.admin.invalidate(); setSent({ url: r.url, email: f.email }); toast.success("Invitation envoyée"); },
    onError: (e) => toast.error(e.message),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    invite.mutate({ firstName: f.firstName, lastName: f.lastName, email: f.email, role: f.role, accessType: f.accessType, accessEndsAt: f.ends ? parisToDate(f.ends, "23:59") : (fiche?.accessEndsAt ?? null), ficheId: fiche?.id });
  };
  if (sent) {
    return (
      <div className="p-soft p-4 flex flex-col gap-2.5 text-[14.5px]">
        <span>Invitation envoyée à <b>{sent.email}</b>. Le lien reste valable 7 jours.</span>
        <span className="flex flex-wrap gap-2">
          <button type="button" className="p-btn-outline p-btn-sm" onClick={() => { void navigator.clipboard.writeText(sent.url); toast.success("Lien copié"); }}><Copy size={14} /> Copier le lien</button>
          {onClose && <button type="button" className="p-btn-ghost" onClick={onClose}>Fermer</button>}
        </span>
      </div>
    );
  }
  return (
    <form className="p-card p-4 sm:p-5 flex flex-col gap-3.5" onSubmit={submit} aria-label="Inviter un membre">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-[13px] p-muted"><span>Prénom</span><input className="p-field" required maxLength={80} value={f.firstName} onChange={(e) => set({ firstName: e.target.value })} /></label>
        <label className="flex flex-col gap-1 text-[13px] p-muted"><span>Nom</span><input className="p-field" maxLength={80} value={f.lastName} onChange={(e) => set({ lastName: e.target.value })} /></label>
        <label className="flex flex-col gap-1 text-[13px] p-muted sm:col-span-2"><span>Adresse e-mail</span><input className="p-field" type="email" required maxLength={255} value={f.email} onChange={(e) => set({ email: e.target.value })} /></label>
        <Select label="Rôle" value={f.role} onChange={(role) => set({ role })} options={Object.entries(ROLE_LABEL) as [Row["role"], string][]} />
        <Select label="Type d’accès" value={f.accessType} onChange={(accessType) => set({ accessType })} options={Object.entries(ACCESS_LABEL) as [Row["accessType"], string][]} />
        <label className="flex flex-col gap-1 text-[13px] p-muted"><span>Date de fin d’accès (facultative)</span><input className="p-field" type="date" value={f.ends} onChange={(e) => set({ ends: e.target.value })} /></label>
      </div>
      <p className="m-0 text-[13px] p-muted">La personne reçoit un e-mail d’invitation valable 7 jours.</p>
      <span className="flex flex-wrap gap-2">
        <button type="submit" className="p-btn-primary p-btn-sm" disabled={invite.isPending}>{invite.isPending ? "Envoi…" : "Envoyer l’invitation"}</button>
        {onClose && <button type="button" className="p-btn-outline p-btn-sm" onClick={onClose}>Annuler</button>}
      </span>
    </form>
  );
}
