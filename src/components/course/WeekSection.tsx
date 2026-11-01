import { Link } from "react-router";
import { ArrowRight } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { CoachMascot } from "@/components/CoachMascot";
import { parisLongDate } from "@/lib/format";

/** Le coach rouge annonce la section de la semaine sur le tableau de bord. */
export function WeekSection() {
  const w = trpc.courses.weekSection.useQuery().data;
  if (!w) return null;
  const isSection = w.kind === "section";
  const href = w.kind === "start" ? `/parcours/${w.courseId}` : `/parcours/${w.courseId}#section-${w.sectionId}`;
  const eyebrow = isSection ? "Votre section de la semaine" : w.kind === "next" ? "Votre prochaine section" : "Votre formation vous attend";
  const title = w.kind === "start" ? w.courseTitle : w.title;
  const sub = isSection ? (w.nextLesson ? `Prochaine leçon : ${w.nextLesson.title}` : w.intention || w.courseTitle) : w.kind === "next" ? `Elle s’ouvre ${w.opensAt ? parisLongDate(new Date(w.opensAt)).toLowerCase() : "bientôt"}. Bravo pour celle de cette semaine.` : (w.tagline || "La première section s’ouvre le jour où vous commencez.");
  return (
    <section className="p-pop flex items-end gap-3 sm:gap-4 mb-6" aria-label={eyebrow}>
      <span className="flex-none p-mascot-bob"><CoachMascot size={64} /></span>
      <div className="flex-1 min-w-0 p-4 sm:p-5 rounded-3xl rounded-bl-md flex flex-wrap items-center gap-x-5 gap-y-3" style={{ background: "var(--p-accent-soft)", border: "1px solid var(--p-accent-line)" }}>
        <div className="flex-[1_1_260px] min-w-0 flex flex-col gap-1">
          <span className="text-[12px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--p-accent-text)" }}>{eyebrow}</span>
          <span className="serif text-[clamp(23px,2.8vw,28px)] leading-tight">{title}</span>
          <span className="text-[14px] p-muted leading-snug">{sub}</span>
        </div>
        <Link to={href} className="p-btn-primary p-btn-sm no-underline flex-none">{isSection ? "Ouvrir ma section" : w.kind === "next" ? "Voir ma formation" : "Découvrir"} <ArrowRight size={15} /></Link>
      </div>
    </section>
  );
}
