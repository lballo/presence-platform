import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { CoachMascot } from "@/components/CoachMascot";
import { REPLAY_TOUR, SECTION_BUBBLES, TOUR_BUTTONS, TOUR_STEPS, sectionToShow } from "@/content/accueil";

/** Met une rubrique en surbrillance. Sur téléphone, si elle n'est pas dans les onglets, c'est le bouton « Menu ». */
function useHighlight(target: string | null | undefined) {
  const [folded, setFolded] = useState<string | null>(null);
  useEffect(() => {
    if (!target) return;
    const shown = (sel: string) => [...document.querySelectorAll<HTMLElement>(`[data-tour="${sel}"]`)].find((el) => el.getClientRects().length > 0);
    const visible = shown(target);
    const el = visible ?? shown("menu");
    el?.classList.add("p-tour-target");
    const frame = requestAnimationFrame(() => setFolded(!visible && el ? target : null));
    return () => { cancelAnimationFrame(frame); el?.classList.remove("p-tour-target"); };
  }, [target]);
  return !!target && folded === target;
}

function Bubble({ text, hint, step, children }: { text: string; hint?: string; step?: string; children: React.ReactNode }) {
  return (
    <div role="status" className="p-pop fixed z-[60] left-3 right-3 bottom-[146px] sm:left-auto sm:right-6 sm:w-[360px] lg:bottom-[104px] p-4 rounded-2xl rounded-br-md shadow-2xl flex flex-col gap-3" style={{ background: "var(--p-surface)", border: "1px solid var(--p-accent-line)", color: "var(--p-ink)", marginBottom: "env(safe-area-inset-bottom)" }}>
      <div className="flex gap-3">
        <span className="flex-none"><CoachMascot size={44} /></span>
        <span className="flex flex-col gap-1 min-w-0"><span className="text-[15px] leading-snug">{text}</span>{hint && <span className="text-[12.5px] p-muted">{hint}</span>}</span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] p-faint">{step}</span>
        <span className="flex items-center gap-2">{children}</span>
      </div>
    </div>
  );
}

/** Le tuto du coach, puis la bulle de chaque rubrique à la première visite. */
export function Tour() {
  const utils = trpc.useUtils();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const me = trpc.members.me.useQuery();
  const tour = me.data?.tour;
  const refresh = () => { utils.members.me.invalidate(); utils.honey.invalidate(); };
  const saveStep = trpc.onboarding.tourStep.useMutation();
  const finish = trpc.onboarding.tourFinish.useMutation({ onSuccess: refresh, onError: (e) => toast.error(e.message) });
  const seen = trpc.onboarding.sectionSeen.useMutation({ onSuccess: () => utils.members.me.invalidate() });

  const running = tour?.status === "pending";
  const current = Math.min(tour?.step ?? 0, TOUR_STEPS.length - 1);
  const section = !running && tour ? sectionToShow(pathname, tour.seen) : undefined;
  const target = running ? TOUR_STEPS[current].target : section ?? null;
  const inMenu = useHighlight(target);

  const next = () => {
    const step = current + 1;
    utils.members.me.setData(undefined, (m) => (m ? { ...m, tour: { ...m.tour, step } } : m));
    saveStep.mutate({ step });
  };

  if (running) {
    const isLast = current === TOUR_STEPS.length - 1;
    const label = `${current + 1} sur ${TOUR_STEPS.length}`;
    return (
      <Bubble text={TOUR_STEPS[current].text} hint={inMenu ? TOUR_BUTTONS.inMenu : undefined} step={label}>
        {isLast ? (
          <>
            <button type="button" className="p-btn-ghost px-2" disabled={finish.isPending} onClick={() => finish.mutate({ followed: true })}>{TOUR_BUTTONS.later}</button>
            <button type="button" className="p-btn-primary p-btn-sm" disabled={finish.isPending} onClick={() => { finish.mutate({ followed: true }); navigate("/?profil=1"); }}>{TOUR_BUTTONS.profile}</button>
          </>
        ) : (
          <>
            <button type="button" className="p-btn-ghost px-2" disabled={finish.isPending} onClick={() => finish.mutate({ followed: false })}>{TOUR_BUTTONS.skip}</button>
            <button type="button" className="p-btn-primary p-btn-sm" onClick={next}>{TOUR_BUTTONS.next}</button>
          </>
        )}
      </Bubble>
    );
  }
  if (section) return <Bubble text={SECTION_BUBBLES[section]} hint={inMenu ? TOUR_BUTTONS.inMenu : undefined}><button type="button" className="p-btn-primary p-btn-sm" disabled={seen.isPending} onClick={() => seen.mutate({ key: section })}>{TOUR_BUTTONS.gotIt}</button></Bubble>;
  return null;
}

/** Bouton « Revoir le tuto » du profil. */
export function ReplayTour({ className = "p-btn-outline p-btn-sm" }: { className?: string }) {
  const utils = trpc.useUtils();
  const restart = trpc.onboarding.tourRestart.useMutation({ onSuccess: () => utils.members.me.invalidate(), onError: (e) => toast.error(e.message) });
  return <button type="button" className={className} disabled={restart.isPending} onClick={() => restart.mutate()}><RotateCcw size={15} /> {REPLAY_TOUR}</button>;
}
