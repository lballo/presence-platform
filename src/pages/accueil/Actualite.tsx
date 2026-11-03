import { Link, useNavigate } from "react-router";
import { trpc, type RouterOutputs } from "@/providers/trpc";
import { Avatar } from "@/components/Avatar";
import { PinnedAnnouncements } from "@/components/forum/PinnedAnnouncements";
import { CoachingBand, MiracleRoutine } from "@/pages/Dashboard";
import { ago, parisLongDate } from "@/lib/format";

type News = RouterOutputs["dashboard"]["news"][number];

/** Actualité : le prochain coaching, ce qui se passe dans le cercle, mes messages, mes proches, Miracle Routine. */
export default function Actualite() {
  const coaching = trpc.dashboard.coaching.useQuery().data;
  return (
    <div className="flex flex-col">
      <PinnedAnnouncements />
      {coaching && <CoachingBand c={coaching} />}
      <section className="mt-6 flex flex-wrap gap-[22px] items-start">
        <Circle />
        <LastMessages />
      </section>
      <People />
      <div className="mt-[22px]"><MiracleRoutine /></div>
      <p className="mt-[52px] mb-0 text-center font-['Newsreader'] italic text-[18px]" style={{ color: "var(--p-ink-warm)" }}>Bienveillance, courtoisie et confidentialité.</p>
    </div>
  );
}

/** « Ce qui se passe dans le cercle » : l'événement à la une, puis talks, ruches, forum. */
function Circle() {
  const news = trpc.dashboard.news.useQuery().data ?? [];
  const hero = news.find((n) => n.image) ?? news[0];
  const rest = news.filter((n) => n !== hero);
  return (
    <div className="flex-[1.45_1_460px] min-w-0">
      <p className="m-0 p-kicker">L’actualité de Présence</p>
      <h2 className="mt-2 mb-[18px] font-['Newsreader'] font-normal text-[30px] leading-[1.1] tracking-[-0.02em]" style={{ color: "var(--p-ink)" }}>Ce qui se passe <em className="p-title-em">dans le cercle</em></h2>
      {hero && <Hero n={hero} />}
      <div className="mt-1.5">
        {rest.map((n, i) => (
          <Link key={i} to={n.href} className="flex items-baseline gap-4 py-3.5 px-1 border-b no-underline" style={{ borderColor: "var(--p-surface-2)", color: "var(--p-ink)" }}>
            <span className="w-[92px] flex-none text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--p-accent-text)" }}>{n.cat}</span>
            <span className="flex-1 min-w-0"><span className="block font-['Newsreader'] text-[17px] leading-snug">{n.title}</span><span className="block mt-0.5 text-[12.5px] p-muted line-clamp-2">{n.sub}</span></span>
          </Link>
        ))}
      </div>
      <Link to="/forum" className="inline-block mt-3.5 text-[13px] font-medium no-underline" style={{ color: "var(--p-accent-text)" }}>Toute l’actualité →</Link>
    </div>
  );
}

function Hero({ n }: { n: News }) {
  return (
    <Link to={n.href} className="block rounded-[22px] overflow-hidden border no-underline" style={{ borderColor: "var(--p-line)", color: "var(--p-ink)" }}>
      {n.image ? <img src={n.image} alt="" className="w-full h-[210px] object-cover block" style={{ objectPosition: n.imagePosition ?? "50% 40%" }} /> : <span aria-hidden="true" className="block h-[120px]" style={{ background: "var(--p-band)" }} />}
      <span className="block px-[22px] pt-[18px] pb-5">
        <span className="block p-kicker">À la une{n.date ? ` · ${parisLongDate(new Date(n.date))}` : ""}</span>
        <span className="block mt-1.5 font-['Newsreader'] text-[24px] leading-[1.2]">{n.title}</span>
        {n.sub && <span className="block mt-1.5 text-[14px] leading-[1.65] p-muted">{n.sub}</span>}
      </span>
    </Link>
  );
}

/** Mes derniers messages reçus, comme une boîte de réception. */
function LastMessages() {
  const navigate = useNavigate();
  const conv = trpc.messages.conversations.useQuery().data;
  const unread = trpc.messages.unreadCount.useQuery().data ?? 0;
  return (
    <aside className="flex-[1_1_300px] min-w-0 rounded-[26px] p-[22px]" style={{ background: "var(--p-surface-2)" }} aria-label="Mes derniers messages reçus">
      <div className="flex items-center justify-between gap-2">
        <p className="m-0 p-kicker">Mes messages</p>
        {unread > 0 && <span className="h-5 px-2 rounded-full text-[10.5px] font-semibold flex items-center" style={{ background: "var(--p-accent)", color: "#FFFFFF" }}>{unread} non lu{unread > 1 ? "s" : ""}</span>}
      </div>
      <h2 className="mt-2 mb-4 font-['Newsreader'] font-normal text-[26px] leading-[1.1] tracking-[-0.02em]" style={{ color: "var(--p-ink)" }}>Mes derniers <em className="p-title-em">messages reçus</em></h2>
      <div className="flex flex-col gap-2">
        {conv?.slice(0, 5).map((c) => (
          <button key={c.peer.id} type="button" onClick={() => navigate(`/messages?to=${c.peer.id}`)} className="w-full flex items-center gap-3 rounded-[16px] px-3 py-2.5 text-left" style={{ background: "var(--p-surface)" }}>
            <Avatar m={c.peer} size={34} />
            <span className="flex-1 min-w-0">
              <span className="flex items-baseline justify-between gap-2"><span className={`truncate text-[13px] ${c.unread ? "font-semibold" : "font-medium"}`} style={{ color: "var(--p-ink)" }}>{c.peer.name}</span><span className="text-[10.5px] p-muted flex-none">{c.lastAt ? ago(new Date(c.lastAt)) : ""}</span></span>
              <span className="flex items-center gap-2"><span className="flex-1 truncate text-[12px] p-muted">{c.lastMine ? "Vous : " : ""}{c.lastText}</span>{!!c.unread && <span aria-label="Non lu" className="w-[7px] h-[7px] rounded-full flex-none" style={{ background: "var(--p-accent)" }} />}</span>
            </span>
          </button>
        ))}
        {conv?.length === 0 && <p className="m-0 py-4 text-center text-[13.5px] p-muted">Aucun message pour l’instant.</p>}
      </div>
      <Link to="/messages" className="inline-block mt-3.5 text-[13px] font-medium no-underline" style={{ color: "var(--p-accent-text)" }}>Ouvrir ma messagerie →</Link>
    </aside>
  );
}

/** Les personnes qui comptent pour moi ici, et de quoi élargir mon réseau. */
function People() {
  const me = trpc.members.me.useQuery().data;
  const rels = trpc.members.relations.useQuery().data ?? [];
  const dir = trpc.members.directory.useQuery().data ?? [];
  const mine = new Set((me?.values ?? []).map((v) => v.toLowerCase()));
  const known = new Set(rels.map((r) => r.id));
  const alike = dir.filter((m) => !known.has(m.id) && (m.values ?? []).some((v: string) => mine.has(v.toLowerCase())));
  const week = Date.now() - 7 * 86400000;
  const fresh = alike.filter((m) => new Date(m.createdAt).getTime() >= week);
  const line = fresh.length ? `${fresh.length} nouveau${fresh.length > 1 ? "x" : ""} profil${fresh.length > 1 ? "s" : ""} partage${fresh.length > 1 ? "nt" : ""} vos valeurs cette semaine.`
    : alike.length ? `${alike.length} profil${alike.length > 1 ? "s" : ""} partage${alike.length > 1 ? "nt" : ""} vos valeurs.`
    : "Des membres qui vous ressemblent vous attendent.";
  return (
    <section className="mt-[22px] rounded-[26px] border px-7 py-[26px] flex flex-wrap gap-[26px] items-center" style={{ borderColor: "var(--p-line)" }} aria-label="Mes proches">
      <div className="flex-[1.5_1_440px] min-w-0">
        <p className="m-0 p-kicker">Mes amis · {rels.length}</p>
        <h2 className="mt-2 mb-4 font-['Newsreader'] font-normal text-[30px] leading-[1.1] tracking-[-0.02em]" style={{ color: "var(--p-ink)" }}>Les personnes <em className="p-title-em">qui comptent pour moi ici</em></h2>
        <div className="flex flex-wrap gap-4">
          {rels.slice(0, 5).map((r) => (
            <Link key={r.id} to={`/membres/${r.id}`} className="w-[74px] flex flex-col items-center gap-1.5 text-[12px] text-center no-underline" style={{ color: "var(--p-ink)" }}>
              <Avatar m={r} size={58} /><span className="truncate w-full">{r.firstName}</span>
            </Link>
          ))}
          {rels.length === 0 && <p className="m-0 text-[14px] p-muted max-w-[380px]">Les membres avec qui vous échangez ou avez matché apparaîtront ici.</p>}
          <Link to="/membres" className="w-[74px] flex flex-col items-center gap-1.5 text-[12px] text-center no-underline p-muted">
            <span className="w-14 h-14 rounded-full border border-dashed flex items-center justify-center text-[20px]" style={{ borderColor: "var(--p-ink-3)", color: "var(--p-ink-3)" }}>→</span>Tous
          </Link>
        </div>
      </div>
      <div className="flex-[1_1_300px] min-w-0 rounded-[22px] px-6 pt-6 pb-[22px] flex flex-col gap-2" style={{ background: "linear-gradient(115deg, #4A3B30 0%, #2A211B 55%, #1A1A1A 100%)", color: "#E8DDD6" }}>
        <p className="m-0 text-[10px] font-semibold uppercase tracking-[0.22em]" style={{ color: "#AFA098" }}>Élargir mon réseau</p>
        <p className="m-0 font-['Newsreader'] text-[21px] leading-[1.3]" style={{ color: "#FFFFFF" }}>{line}</p>
        <Link to="/membres/binome" className="self-start mt-2 inline-flex items-center h-10 px-4 rounded-full text-[13px] font-medium no-underline" style={{ background: "#F3ECE8", color: "#1A1A1A" }}>Découvrir des membres</Link>
      </div>
    </section>
  );
}
