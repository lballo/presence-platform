import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { ArrowLeft, Send, PenSquare, Search, Check, CheckCheck, Paperclip, X, FileText, Download, Pencil, Trash2, Ban } from "lucide-react";
import { useUpload, fileSize } from "@/lib/upload";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { PageHeader } from "@/components/Layout";
import { Avatar } from "@/components/Avatar";
import { hour, monthAbr, dayNum, iso } from "@/lib/format";

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const when = (d: Date) => {
  const now = new Date();
  if (iso(d) === iso(now)) return hour(d);
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (iso(d) === iso(y)) return "hier";
  return `${dayNum(d)} ${monthAbr(d)}`;
};

export default function Messages() {
  const [params, setParams] = useSearchParams();
  const withId = Number(params.get("to")) || null;
  const [picking, setPicking] = useState(false);
  const conv = trpc.messages.conversations.useQuery(undefined, { refetchInterval: 4000 });
  const open = (id: number) => { setPicking(false); setParams({ to: String(id) }); };

  return (
    <>
      <PageHeader eyebrow="Le cercle" title="Messages" intro="Écrivez à n’importe quel membre du cercle, pas seulement à vos relations. Les messages arrivent en quelques secondes, et vous pouvez joindre des fichiers." />
      <div className="p-card overflow-hidden flex" style={{ height: "min(72vh, 760px)", minHeight: 460 }}>
        {/* Liste des conversations */}
        <section className={`${withId ? "hidden md:flex" : "flex"} w-full md:w-[340px] md:flex-none flex-col border-r min-w-0`} style={{ borderColor: "var(--p-line)" }}>
          <div className="flex items-center justify-between gap-2 px-4 h-[62px] border-b" style={{ borderColor: "var(--p-line)" }}>
            <span className="serif text-[24px]">Conversations</span>
            <button type="button" className="p-btn-ghost text-[13.5px]" onClick={() => setPicking(!picking)}><PenSquare size={16} /> Nouveau</button>
          </div>
          {picking && <MemberPicker onPick={open} />}
          <div className="flex-1 overflow-y-auto">
            {conv.data?.map((c) => (
              <button key={c.peer.id} type="button" onClick={() => open(c.peer.id)} className="w-full flex items-center gap-3 px-4 py-3 text-left border-b" style={{ borderColor: "var(--p-line)", background: c.peer.id === withId ? "var(--p-surface-2)" : undefined }}>
                <Avatar m={c.peer} size={46} />
                <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <span className="flex items-baseline justify-between gap-2"><span className={`truncate text-[15px] ${c.unread ? "font-semibold" : "font-medium"}`}>{c.peer.name}</span><span className="text-[12px] p-faint flex-none">{c.lastAt ? when(new Date(c.lastAt)) : ""}</span></span>
                  <span className="flex items-center justify-between gap-2"><span className={`truncate text-[13.5px] ${c.unread ? "" : "p-muted"}`} style={c.unread ? { color: "var(--p-ink)" } : undefined}>{c.lastMine ? "Vous : " : ""}{c.lastText}</span>{!!c.unread && <span className="min-w-[20px] h-5 px-1.5 rounded-full text-[11.5px] font-semibold text-white flex items-center justify-center flex-none" style={{ background: "var(--p-accent)" }}>{c.unread}</span>}</span>
                </span>
              </button>
            ))}
            {conv.data?.length === 0 && !picking && (
              <div className="p-8 text-center flex flex-col items-center gap-3">
                <span className="text-[14.5px] p-muted">Aucune conversation pour l’instant.</span>
                <button type="button" className="p-btn-outline p-btn-sm" onClick={() => setPicking(true)}><PenSquare size={15} /> Écrire à un membre</button>
              </div>
            )}
          </div>
        </section>

        {/* Fil */}
        <section className={`${withId ? "flex" : "hidden md:flex"} flex-1 min-w-0 flex-col`}>
          {withId ? <Thread withId={withId} onBack={() => setParams({})} /> : (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 p-8 text-center" style={{ background: "var(--p-surface-2)" }}>
              <span className="serif text-[28px]">Choisissez une conversation</span>
              <span className="text-[14.5px] p-muted max-w-[360px]">ou écrivez à un membre depuis l’annuaire, vos matchs, ou le bouton « Nouveau ».</span>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function MemberPicker({ onPick }: { onPick: (id: number) => void }) {
  const dir = trpc.members.directory.useQuery();
  const me = trpc.members.me.useQuery();
  const [q, setQ] = useState("");
  const list = (dir.data ?? []).filter((m) => m.id !== me.data?.id && (!q || norm(`${m.name} ${m.role} ${m.city}`).includes(norm(q)))).slice(0, 8);
  return (
    <div className="border-b p-3 flex flex-col gap-2" style={{ borderColor: "var(--p-line)", background: "var(--p-surface-2)" }}>
      <label className="flex items-center gap-2 h-10 px-3 rounded-full border p-muted" style={{ borderColor: "var(--p-line-2)", background: "var(--p-surface)" }}>
        <Search size={15} /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un membre…" className="bg-transparent outline-none w-full text-[14px]" style={{ color: "var(--p-ink)" }} />
      </label>
      <div className="flex flex-col max-h-[260px] overflow-y-auto">
        {list.map((m) => (
          <button key={m.id} type="button" onClick={() => onPick(m.id)} className="flex items-center gap-2.5 px-2 py-2 rounded-xl text-left hover:bg-black/5 dark:hover:bg-white/5">
            <Avatar m={m} size={34} /><span className="flex flex-col min-w-0"><span className="text-[14px] font-medium truncate">{m.name}</span><span className="text-[12px] p-muted truncate">{m.role} · {m.city}</span></span>
          </button>
        ))}
        {list.length === 0 && <span className="text-[13px] p-muted px-2 py-2">Aucun membre trouvé.</span>}
      </div>
    </div>
  );
}

function Thread({ withId, onBack }: { withId: number; onBack: () => void }) {
  const utils = trpc.useUtils();
  // Rafraîchissement toutes les 2 s : les nouveaux messages apparaissent quasi instantanément.
  const thread = trpc.messages.thread.useQuery({ withId }, { refetchInterval: 2000, refetchIntervalInBackground: false });
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState<{ key: number; text: string }[]>([]);
  const cfg = trpc.uploads.config.useQuery();
  const { upload, progress } = useUpload("message");
  const fileInput = useRef<HTMLInputElement>(null);
  const send = trpc.messages.send.useMutation({
    onSuccess: () => { utils.messages.thread.invalidate({ withId }); utils.messages.conversations.invalidate(); },
    onError: (e, v) => { toast.error(e.message); setText(v.text ?? ""); },
    onSettled: (_d, _e, v) => setPending((p) => p.filter((x) => x.text !== (v.text ?? ""))),
  });
  const maxMb = cfg.data?.maxMb.message ?? 50;
  // Modifier / supprimer ses propres messages
  const [editing, setEditing] = useState<{ id: number; text: string } | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [confirmDel, setConfirmDel] = useState<number | null>(null);
  const refreshThread = () => { utils.messages.thread.invalidate({ withId }); utils.messages.conversations.invalidate(); };
  const update = trpc.messages.update.useMutation({ onSuccess: () => { refreshThread(); setEditing(null); setText(""); }, onError: (e) => toast.error(e.message) });
  const remove = trpc.messages.remove.useMutation({ onSuccess: () => { refreshThread(); setConfirmDel(null); setSelected(null); }, onError: (e) => toast.error(e.message) });
  const startEdit = (id: number, t: string) => { setEditing({ id, text: t }); setText(t); setSelected(null); setFile(null); };
  const cancelEdit = () => { setEditing(null); setText(""); };
  const pick = (f: File | undefined) => {
    if (!f) return;
    if (f.size > maxMb * 1024 * 1024) { toast.error(`Le fichier dépasse ${maxMb} Mo.`); return; }
    setFile(f);
  };
  const bottom = useRef<HTMLDivElement>(null);
  const count = (thread.data?.messages.length ?? 0) + pending.length;
  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [count, withId]);
  useEffect(() => { utils.messages.unreadCount.invalidate(); utils.messages.conversations.invalidate(); }, [thread.data?.messages.length, utils]);

  const go = async () => {
    const t = text.trim();
    if (editing) { if (t && t !== editing.text) update.mutate({ id: editing.id, text: t }); else cancelEdit(); return; }
    if (!t && !file) return;
    if (file) {
      try {
        const up = await upload(file);
        setPending((p) => [...p, { key: Date.now(), text: t || `Pièce jointe : ${file.name}` }]);
        setText(""); setFile(null);
        send.mutate({ toId: withId, text: t, attachment: { path: up.path, name: up.name, type: up.type, size: up.size } });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Envoi impossible");
      }
      return;
    }
    setPending((p) => [...p, { key: Date.now(), text: t }]);
    setText("");
    send.mutate({ toId: withId, text: t });
  };

  // Regroupement par jour
  const groups = useMemo(() => {
    const out: { day: string; items: NonNullable<typeof thread.data>["messages"] }[] = [];
    for (const m of thread.data?.messages ?? []) {
      const d = new Date(m.at);
      const label = iso(d) === iso(new Date()) ? "Aujourd’hui" : `${dayNum(d)} ${monthAbr(d)}`;
      const last = out[out.length - 1];
      if (last?.day === label) last.items.push(m); else out.push({ day: label, items: [m] });
    }
    return out;
  }, [thread.data]);

  const peer = thread.data?.peer;
  return (
    <>
      <div className="flex items-center gap-3 px-4 h-[62px] border-b flex-none" style={{ borderColor: "var(--p-line)" }}>
        <button type="button" className="md:hidden w-9 h-9 rounded-full flex items-center justify-center" onClick={onBack} aria-label="Retour"><ArrowLeft size={18} /></button>
        {peer && <><Avatar m={peer} size={38} /><span className="flex flex-col min-w-0"><span className="font-semibold text-[15px] truncate">{peer.name}</span><span className="text-[12.5px] p-muted truncate">{peer.role} · {peer.city}</span></span></>}
        {peer && <Link to={`/membres/${peer.id}`} className="ml-auto p-btn-ghost text-[13px] no-underline">Voir le profil</Link>}
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-1" style={{ background: "var(--p-surface-2)" }}>
        {thread.data && thread.data.messages.length === 0 && pending.length === 0 && (
          <div className="m-auto text-center flex flex-col gap-1 max-w-[340px]"><span className="serif text-[24px]">Premier message</span><span className="text-[14px] p-muted">Présentez-vous en quelques mots et dites ce qui vous donne envie d’échanger avec {peer?.firstName}.</span></div>
        )}
        {groups.map((g) => (
          <div key={g.day} className="flex flex-col gap-1">
            <span className="self-center text-[11.5px] font-medium uppercase tracking-[0.18em] p-faint my-2">{g.day}</span>
            {g.items.map((m) => (
              <div key={m.id} className="flex flex-col">
                <Bubble
                  mine={m.mine} text={m.text} attachment={m.attachment} deleted={m.deleted}
                  highlighted={editing?.id === m.id}
                  meta={<>{m.edited ? "modifié · " : ""}{hour(new Date(m.at))}{m.mine && !m.deleted && (m.read ? <CheckCheck size={13} /> : <Check size={13} />)}</>}
                  onSelect={m.mine && !m.deleted ? () => setSelected(selected === m.id ? null : m.id) : undefined}
                  actions={m.mine && !m.deleted && (selected === m.id) ? (
                    <span className="flex items-center gap-1">
                      {m.text && <button type="button" className="h-8 px-2.5 rounded-full text-[12.5px] flex items-center gap-1.5 border" style={{ borderColor: "var(--p-line-2)", background: "var(--p-surface)" }} onClick={() => startEdit(m.id, m.text)}><Pencil size={12} /> Modifier</button>}
                      <button type="button" className="h-8 px-2.5 rounded-full text-[12.5px] flex items-center gap-1.5 border" style={{ borderColor: "var(--p-line-2)", background: "var(--p-surface)", color: "var(--p-accent-text)" }} onClick={() => { setConfirmDel(m.id); setSelected(null); }}><Trash2 size={12} /> Supprimer</button>
                      <button type="button" aria-label="Fermer" className="w-8 h-8 rounded-full flex items-center justify-center p-muted" onClick={() => setSelected(null)}><X size={14} /></button>
                    </span>
                  ) : undefined}
                />
                {confirmDel === m.id && (
                  <div className="self-end flex flex-wrap items-center justify-end gap-2 mt-1 text-[13px]">
                    <span className="p-muted">Supprimer ce message pour vous deux ?</span>
                    <button type="button" className="p-btn-primary p-btn-sm" disabled={remove.isPending} onClick={() => remove.mutate({ id: m.id })}>Supprimer</button>
                    <button type="button" className="p-btn-outline p-btn-sm" onClick={() => setConfirmDel(null)}>Annuler</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
        {pending.map((p) => <Bubble key={p.key} mine text={p.text} meta={<>envoi…</>} faded />)}
        <div ref={bottom} />
      </div>
      {editing && (
        <div className="flex items-center gap-3 px-4 pt-3 flex-none">
          <span className="flex-1 min-w-0 flex items-center gap-2 text-[13px]" style={{ color: "var(--p-accent-text)" }}><Pencil size={14} /> Modification du message <span className="p-muted truncate">· Entrée pour enregistrer</span></span>
          <button type="button" aria-label="Annuler la modification" className="w-9 h-9 rounded-full flex items-center justify-center" onClick={cancelEdit}><X size={16} /></button>
        </div>
      )}
      {(file || progress !== null) && (
        <div className="flex items-center gap-3 px-4 pt-3 flex-none">
          <span className="flex-1 min-w-0 flex items-center gap-2 h-11 px-3 rounded-xl border" style={{ borderColor: "var(--p-line-2)", background: "var(--p-surface-2)" }}>
            <FileText size={16} className="flex-none" style={{ color: "var(--p-accent-text)" }} />
            <span className="truncate text-[13.5px]">{file?.name}</span>
            <span className="text-[12px] p-faint flex-none">{file ? fileSize(file.size) : ""}{progress !== null ? ` · envoi ${progress}%` : ""}</span>
          </span>
          {progress === null && <button type="button" aria-label="Retirer le fichier" className="w-9 h-9 rounded-full flex items-center justify-center" onClick={() => setFile(null)}><X size={16} /></button>}
        </div>
      )}
      <form className="flex items-end gap-2 p-3 border-t flex-none" style={{ borderColor: "var(--p-line)" }} onSubmit={(e) => { e.preventDefault(); go(); }}>
        <input ref={fileInput} type="file" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
        <button type="button" aria-label="Joindre un fichier" title={cfg.data?.enabled ? `Joindre un fichier (jusqu’à ${maxMb} Mo)` : "L’envoi de fichiers sera disponible une fois le stockage configuré"} disabled={!cfg.data?.enabled || progress !== null || !!editing} className="w-12 h-12 rounded-full border flex items-center justify-center flex-none disabled:opacity-40" style={{ borderColor: "var(--p-line-2)" }} onClick={() => fileInput.current?.click()}><Paperclip size={18} /></button>
        <textarea
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); go(); } if (e.key === "Escape" && editing) cancelEdit(); }}
          placeholder={editing ? "Modifier le message…" : "Écrire un message…"}
          className="p-field flex-1 resize-none max-h-[140px]"
          style={{ minHeight: 46 }}
        />
        <button type="submit" className="p-btn-primary w-12 h-12 p-0 flex items-center justify-center rounded-full flex-none" disabled={(!text.trim() && !file) || progress !== null || update.isPending} aria-label={editing ? "Enregistrer" : "Envoyer"}>{editing ? <Check size={18} /> : <Send size={18} />}</button>
      </form>
    </>
  );
}

type Att = { name: string; type: string; size: number; url: string | null; downloadUrl: string | null } | null | undefined;

function Attachment({ a, mine }: { a: NonNullable<Att>; mine: boolean }) {
  if (a.url && a.type.startsWith("image/")) return <a href={a.url} target="_blank" rel="noopener" className="block -mx-1.5 -mt-0.5 mb-1"><img src={a.url} alt={a.name} className="max-h-[280px] w-auto rounded-xl" /></a>;
  if (a.url && a.type.startsWith("video/")) return <video src={a.url} controls playsInline className="max-h-[300px] w-full rounded-xl mb-1 bg-black" />;
  return (
    <a href={a.downloadUrl ?? a.url ?? "#"} target="_blank" rel="noopener" className="flex items-center gap-2.5 p-2.5 rounded-xl no-underline mb-1" style={mine ? { background: "rgba(255,255,255,0.15)", color: "#fff" } : { background: "var(--p-surface-2)", color: "var(--p-ink)" }}>
      <FileText size={20} className="flex-none" />
      <span className="flex flex-col min-w-0"><span className="text-[14px] font-medium truncate">{a.name}</span><span className={`text-[12px] ${mine ? "text-white/70" : "p-muted"}`}>{fileSize(a.size)}{a.url ? "" : " · lien indisponible"}</span></span>
      <Download size={16} className="flex-none ml-auto" />
    </a>
  );
}

function Bubble({ mine, text, meta, faded, attachment, deleted, onSelect, actions, highlighted }: { mine: boolean; text: string; meta: React.ReactNode; faded?: boolean; attachment?: Att; deleted?: boolean; onSelect?: () => void; actions?: React.ReactNode; highlighted?: boolean }) {
  if (deleted)
    return (
      <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
        <div className="max-w-[78%] px-3.5 py-2 rounded-2xl text-[14px] italic flex items-center gap-1.5 border border-dashed p-muted" style={{ borderColor: "var(--p-line-2)" }}><Ban size={13} /> Message supprimé <span className="not-italic text-[11px] p-faint ml-1">{meta}</span></div>
      </div>
    );
  return (
    <div className={`group flex items-center gap-2 ${mine ? "justify-end" : "justify-start"}`}>
      {actions}
      {onSelect && !actions && (
        <button type="button" aria-label="Modifier ou supprimer" className="opacity-0 group-hover:opacity-100 focus:opacity-100 w-8 h-8 rounded-full flex items-center justify-center p-muted transition-opacity" onClick={onSelect}><Pencil size={13} /></button>
      )}
      <div
        className="max-w-[78%] px-3.5 py-2 rounded-2xl text-[15px] leading-relaxed whitespace-pre-wrap break-words"
        onClick={onSelect && !actions ? (e) => { if (window.matchMedia("(hover: none)").matches && !(e.target as HTMLElement).closest("a,video")) onSelect(); } : undefined}
        style={{ ...(mine ? { background: "var(--p-accent)", color: "#fff", borderBottomRightRadius: 6 } : { background: "var(--p-surface)", color: "var(--p-ink)", borderBottomLeftRadius: 6, border: "1px solid var(--p-line)" }), opacity: faded ? 0.6 : 1, boxShadow: highlighted ? "0 0 0 2px var(--p-surface), 0 0 0 4px var(--p-gold-bright)" : undefined }}
      >
        {attachment && <Attachment a={attachment} mine={mine} />}
        {text}
        <span className={`flex items-center justify-end gap-1 text-[11px] mt-0.5 ${mine ? "text-white/70" : "p-faint"}`}>{meta}</span>
      </div>
    </div>
  );
}
