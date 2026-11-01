import { Link } from "react-router";
import { ArrowRight, Eye, EyeOff, Lock } from "lucide-react";
import { toast } from "sonner";
import { trpc, type RouterOutputs } from "@/providers/trpc";
import { parisLongDate } from "@/lib/format";

const gold = { color: "var(--p-gold)" };

/** Sur mon profil : chaque thème, son résultat le plus récent, et ce que je montre aux autres. Privé par défaut. */
export function MyThemeResults() {
  const utils = trpc.useUtils();
  const q = trpc.resources.myProfile.useQuery(undefined, { retry: false });
  const set = trpc.resources.setThemePublic.useMutation({
    onSuccess: async (_r, v) => { await Promise.all([utils.resources.myProfile.invalidate(), utils.members.profile.invalidate()]); toast.success(v.public ? "Ce résultat est maintenant visible des autres membres" : "Ce résultat redevient privé"); },
    onError: (e) => toast.error(e.message),
  });
  const d = q.data;
  if (!d || !d.themes.length) return null;
  return (
    <section className="p-card p-6 flex flex-col gap-4" aria-label="Mes résultats de tests">
      <div className="flex flex-col gap-1.5">
        <span className="text-[12px] font-semibold uppercase tracking-[0.24em]" style={gold}>Mes résultats de tests</span>
        <span className="flex items-start gap-1.5 text-[13.5px] p-muted"><Lock size={13} className="flex-none mt-1" /> Privés par défaut. Vous choisissez, thème par thème, ce que les autres membres voient : le titre du résultat, jamais son explication.</span>
      </div>
      <ul className="list-none m-0 p-0 flex flex-col">
        {d.themes.map((t) => <ThemeRow key={t.id} t={t} shown={set.isPending && set.variables.themeId === t.id ? set.variables.public : t.public} busy={set.isPending} onToggle={(on) => set.mutate({ themeId: t.id, public: on })} />)}
      </ul>
      {d.untaken > 0 && <Link to="/parcours/ressources?filtre=a-faire" className="p-btn-outline p-btn-sm no-underline self-start">{d.untaken > 1 ? `Passer les ${d.untaken} tests qui restent` : "Passer le test qui reste"} <ArrowRight size={14} /></Link>}
    </section>
  );
}

function ThemeRow({ t, shown, busy, onToggle }: { t: RouterOutputs["resources"]["myProfile"]["themes"][number]; shown: boolean; busy: boolean; onToggle: (on: boolean) => void }) {
  const r = t.result;
  return (
    <li className="py-3.5 first:pt-0 last:pb-0 border-b last:border-b-0 flex flex-col gap-1.5" style={{ borderColor: "var(--p-line)" }}>
      <span className="text-[13px] p-muted">{t.emoji && <span aria-hidden="true">{t.emoji} </span>}{t.title} · {t.profileLabel}</span>
      {r ? (
        <>
          {r.title ? <span className="serif text-[23px] leading-tight">{r.title}</span> : <span className="text-[14.5px] font-medium">Résultat sans titre</span>}
          {r.summary && <p className="m-0 text-[14.5px] leading-relaxed p-muted whitespace-pre-line">{r.summary}</p>}
          <span className="text-[12.5px] p-faint">{r.testTitle} · {parisLongDate(new Date(r.passedAt)).toLowerCase()}</span>
          {r.title
            ? <label className="flex items-center gap-2.5 text-[14px] font-medium cursor-pointer min-h-[32px]"><input type="checkbox" checked={shown} disabled={busy} className="w-[18px] h-[18px] flex-none" style={{ accentColor: "var(--p-accent)" }} onChange={(e) => onToggle(e.target.checked)} />{shown ? <><Eye size={14} /> Visible des autres membres</> : <><EyeOff size={14} /> Privé : montrer aux autres membres</>}</label>
            : <span className="text-[13px] p-muted">Ce test ne renvoie pas de titre : rien à montrer aux autres membres.</span>}
        </>
      ) : t.testCount > 0
        ? <Link to="/parcours/ressources?filtre=a-faire" className="p-link text-[14.5px] self-start">Pas encore de résultat : voir les tests à passer</Link>
        : <span className="text-[14px] p-muted">Les tests de ce thème arrivent bientôt.</span>}
    </li>
  );
}

/** Sur le profil d'un autre membre : seulement ce qu'il a choisi de montrer. */
export function PublicThemeResults({ items, firstName }: { items: { themeId: number; profileLabel: string; title: string }[]; firstName: string }) {
  if (!items.length) return null;
  return (
    <section className="p-card p-6 flex flex-col gap-3" aria-label={`Les résultats de tests de ${firstName}`}>
      <span className="text-[12px] font-semibold uppercase tracking-[0.24em]" style={gold}>Résultats de tests</span>
      <dl className="m-0 grid gap-x-4 gap-y-2 text-[15px]" style={{ gridTemplateColumns: "auto 1fr" }}>
        {items.map((r) => <div key={r.themeId} className="contents"><dt className="p-muted">{r.profileLabel}</dt><dd className="m-0 font-medium">{r.title}</dd></div>)}
      </dl>
    </section>
  );
}
