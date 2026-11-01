import { useState, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { trpc, type RouterInputs, type RouterOutputs } from "@/providers/trpc";
import { Brand, useTheme } from "@/components/Layout";
import { CoachMascot } from "@/components/CoachMascot";
import { VideoEmbed } from "@/components/VideoEmbed";
import { PANELS } from "@/content/accueil";

type State = RouterOutputs["onboarding"]["state"];
const LAST = 2;
// Choix déjà cochés au panneau suivant, d'après ce qui amène la personne
const FROM_GOALS: Record<string, string> = { pairs: "pairs:sym", partenaires: "associe:sym" };

/** Panneaux d'accueil, plein écran, tant que l'accueil n'est pas terminé, quelle que soit la page demandée. */
export default function Accueil() {
  useTheme();
  const state = trpc.onboarding.state.useQuery(undefined, { refetchOnWindowFocus: false });
  if (!state.data) return <div className="min-h-screen flex items-center justify-center p-muted text-[15px]">Un instant…</div>;
  return <Panels s={state.data} />;
}

function Chips({ options, value, onChange, limit, single }: { options: readonly (readonly [string, string])[]; value: string[]; onChange: (v: string[]) => void; limit?: number; single?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(([code, label]) => {
        const on = value.includes(code);
        const off = !on && !single && limit !== undefined && value.length >= limit;
        return <button key={code} type="button" aria-pressed={on} disabled={off} className="inline-flex items-center min-h-11 px-4 rounded-full border text-[14.5px] font-medium disabled:opacity-40" style={on ? { background: "var(--p-accent-soft)", color: "var(--p-accent-text)", borderColor: "var(--p-accent)" } : { background: "var(--p-surface)", borderColor: "var(--p-line-2)" }} onClick={() => onChange(single ? (on ? [] : [code]) : on ? value.filter((x) => x !== code) : [...value, code])}>{label}</button>;
      })}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <div className="flex flex-col gap-2"><span className="text-[15px] font-semibold">{label}{hint && <span className="block text-[13px] font-normal p-muted">{hint}</span>}</span>{children}</div>;
}

function Panels({ s }: { s: State }) {
  const utils = trpc.useUtils();
  const [step, setStep] = useState(Math.min(s.step, LAST));
  const [f, setF] = useState({ goals: s.goals, goalsOther: s.goalsOther, matchProfiles: s.matchProfiles, matchSectors: s.matchSectors, intents: s.intents as string[], profileType: s.profileType, sector: s.sector });
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const save = trpc.onboarding.save.useMutation({ onSuccess: () => utils.onboarding.state.invalidate(), onError: (e) => toast.error(e.message) });
  const complete = trpc.onboarding.complete.useMutation({ onError: (e) => toast.error(e.message) });
  const busy = save.isPending || complete.isPending;

  const go = async (next: number) => {
    const intents = next === LAST && !f.intents.length ? f.goals.map((g) => FROM_GOALS[g]).filter(Boolean) : f.intents;
    try { await save.mutateAsync({ step: Math.min(next, LAST), ...f, intents: intents as RouterInputs["onboarding"]["save"]["intents"] }); } catch { return; }
    set({ intents });
    window.scrollTo(0, 0);
    if (next <= LAST) return setStep(next);
    await complete.mutateAsync();
    await Promise.all([utils.auth.status.invalidate(), utils.members.me.invalidate(), utils.honey.invalidate()]);
  };

  const { seek, offer } = s.options;
  const pickIntents = (codes: readonly (readonly [string, string])[]) => (v: string[]) => set({ intents: [...f.intents.filter((x) => !codes.some(([c]) => c === x)), ...v] });
  const remaining = 3 - f.intents.length;

  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ background: "var(--p-bg)" }}>
      <header className="flex items-center justify-between h-14 px-4 sm:px-8 flex-none">
        <Brand compact />
        <div className="flex items-center gap-2" role="progressbar" aria-valuemin={1} aria-valuemax={3} aria-valuenow={step + 1} aria-label={`Étape ${step + 1} sur 3`}>
          {[0, 1, 2].map((i) => <span key={i} className="w-2.5 h-2.5 rounded-full transition-colors" style={{ background: i <= step ? "var(--p-accent)" : "var(--p-line-2)" }} />)}
        </div>
      </header>

      <main className="flex-1 w-full max-w-[680px] mx-auto px-5 sm:px-8 pt-4 pb-8 flex flex-col gap-6">
        {step === 0 && (
          <>
            <span className="p-mascot-bob self-start"><CoachMascot size={68} /></span>
            <div className="flex flex-col gap-3">
              <span className="p-eyebrow">{PANELS.esprit.eyebrow}</span>
              <h1 className="m-0 text-[clamp(36px,7vw,54px)] leading-[1.05]">{PANELS.esprit.title(s.firstName)}</h1>
            </div>
            {s.videoUrl && <VideoEmbed url={s.videoUrl} title="Un mot de Laura" />}
            <div className="flex flex-col gap-3 text-[17px] leading-relaxed">{PANELS.esprit.lines.map((l) => <p key={l} className="m-0">{l}</p>)}</div>
          </>
        )}
        {step === 1 && (
          <>
            <div className="flex flex-col gap-2">
              <span className="p-eyebrow">{PANELS.objectifs.eyebrow}</span>
              <h1 className="m-0 text-[clamp(34px,6vw,48px)] leading-[1.08]">{PANELS.objectifs.title}</h1>
              <p className="m-0 text-[15.5px] p-muted">{PANELS.objectifs.hint}</p>
            </div>
            <Chips options={s.options.goals} value={f.goals} onChange={(goals) => set({ goals })} />
            <textarea className="p-field" rows={3} maxLength={500} value={f.goalsOther} onChange={(e) => set({ goalsOther: e.target.value })} placeholder={PANELS.objectifs.other} aria-label={PANELS.objectifs.other} />
          </>
        )}
        {step === 2 && (
          <>
            <div className="flex flex-col gap-2">
              <span className="p-eyebrow">{PANELS.matching.eyebrow}</span>
              <h1 className="m-0 text-[clamp(34px,6vw,48px)] leading-[1.08]">{PANELS.matching.title}</h1>
              <p className="m-0 text-[15.5px] p-muted">{PANELS.matching.hint}</p>
            </div>
            <Field label={PANELS.matching.profiles}><Chips options={s.options.profileTypes} value={f.matchProfiles} onChange={(matchProfiles) => set({ matchProfiles })} /></Field>
            <Field label={PANELS.matching.sectors}><Chips options={s.options.sectors} value={f.matchSectors} onChange={(matchSectors) => set({ matchSectors })} /></Field>
            <Field label={PANELS.matching.seek} hint={PANELS.matching.limit}><Chips options={seek} value={f.intents.filter((x) => seek.some(([c]) => c === x))} onChange={pickIntents(seek)} limit={f.intents.filter((x) => seek.some(([c]) => c === x)).length + remaining} /></Field>
            <Field label={PANELS.matching.offer}><Chips options={offer} value={f.intents.filter((x) => offer.some(([c]) => c === x))} onChange={pickIntents(offer)} limit={f.intents.filter((x) => offer.some(([c]) => c === x)).length + remaining} /></Field>
            <Field label={PANELS.matching.me}><Chips single options={s.options.profileTypes} value={f.profileType ? [f.profileType] : []} onChange={(v) => set({ profileType: v[0] ?? "" })} /></Field>
            <Field label={PANELS.matching.mySector}><Chips single options={s.options.sectors} value={f.sector ? [f.sector] : []} onChange={(v) => set({ sector: v[0] ?? "" })} /></Field>
          </>
        )}
      </main>

      <footer className="sticky bottom-0 flex items-center justify-between gap-3 px-5 sm:px-8 pt-3 border-t flex-none" style={{ background: "var(--p-bg)", borderColor: "var(--p-line)", paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
        {step > 0 ? <button type="button" className="p-btn-outline p-btn-sm" disabled={busy} onClick={() => void go(step - 1)}><ArrowLeft size={15} /> {PANELS.buttons.back}</button> : <span />}
        <button type="button" className="p-btn-primary" disabled={busy} onClick={() => void go(step + 1)}>{step === LAST ? PANELS.buttons.finish : PANELS.buttons.next}</button>
      </footer>
    </div>
  );
}
