import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { MessageCircle } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { Avatar } from "@/components/Avatar";
import { ago } from "@/lib/format";

/** Bouton rond de l'en-tête, avec le nombre de non-lus : la bulle des messages et la cloche le partagent. */
export function HeaderButton({ label, count, open, onClick, children }: { label: string; count: number; open: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} aria-expanded={open} className="relative w-10 h-10 flex items-center justify-center rounded-full" style={{ color: "var(--p-ink)", background: open ? "var(--p-accent-soft)" : "var(--p-surface-2)" }} onClick={onClick}>
      {children}
      {count > 0 && <span className="absolute -top-1 -right-1 min-w-[19px] h-[19px] px-1 rounded-full text-[10.5px] font-semibold flex items-center justify-center text-white" style={{ background: "var(--p-accent)", boxShadow: "0 0 0 2px var(--p-bg)" }}>{count > 99 ? "99+" : count}</span>}
    </button>
  );
}

/** Le panneau qui s'ouvre sous un bouton de l'en-tête : pleine largeur sur téléphone, accroché au bouton ailleurs. */
export const HEADER_PANEL = "fixed z-[45] left-3 right-3 top-[62px] sm:absolute sm:left-auto sm:right-0 sm:top-12 sm:w-[360px] max-h-[70vh] overflow-y-auto rounded-2xl shadow-xl";

/** Bulle des messages : les dernières conversations en aperçu, la messagerie complète à un clic. */
export function MessagesBubble({ unread }: { unread: number }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const conv = trpc.messages.conversations.useQuery(undefined, { enabled: open, refetchInterval: open ? 8000 : false });
  const close = () => setOpen(false);
  return (
    <span className="relative flex-none">
      <HeaderButton label={unread ? `Messages, ${unread} non lu${unread > 1 ? "s" : ""}` : "Messages"} count={unread} open={open} onClick={() => setOpen(!open)}>
        <MessageCircle size={19} strokeWidth={1.7} />
      </HeaderButton>
      {open && (
        <>
          <button type="button" aria-label="Fermer les messages" className="fixed inset-0 z-[44] cursor-default" onClick={close} />
          <div className={HEADER_PANEL} style={{ background: "var(--p-surface)", border: "1px solid var(--p-line)", color: "var(--p-ink)" }}>
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b" style={{ borderColor: "var(--p-line)" }}>
              <span className="serif text-[20px]">Messages</span>
            </div>
            {conv.data?.slice(0, 6).map((c) => (
              <button key={c.peer.id} type="button" className="w-full flex items-center gap-3 px-4 py-2.5 text-left border-b hover:bg-black/5 dark:hover:bg-white/5" style={{ borderColor: "var(--p-line)" }} onClick={() => { close(); navigate(`/messages?to=${c.peer.id}`); }}>
                <Avatar m={c.peer} size={40} />
                <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <span className="flex items-baseline justify-between gap-2"><span className={`truncate text-[14.5px] ${c.unread ? "font-semibold" : "font-medium"}`}>{c.peer.name}</span><span className="text-[11.5px] p-faint flex-none">{c.lastAt ? ago(new Date(c.lastAt)) : ""}</span></span>
                  <span className="flex items-center justify-between gap-2"><span className={`truncate text-[13px] ${c.unread ? "" : "p-muted"}`}>{c.lastMine ? "Vous : " : ""}{c.lastText}</span>{!!c.unread && <span className="min-w-[19px] h-[19px] px-1 rounded-full text-[10.5px] font-semibold text-white flex items-center justify-center flex-none" style={{ background: "var(--p-accent)" }}>{c.unread}</span>}</span>
                </span>
              </button>
            ))}
            {conv.isLoading && <p className="m-0 p-6 text-center text-[14px] p-muted">Chargement…</p>}
            {conv.data?.length === 0 && <p className="m-0 p-6 text-center text-[14px] p-muted">Aucune conversation pour l’instant.</p>}
            <Link to="/messages" onClick={close} className="block px-4 py-3 text-center text-[14px] font-medium no-underline" style={{ color: "var(--p-accent-text)" }}>Voir toute la messagerie</Link>
          </div>
        </>
      )}
    </span>
  );
}
