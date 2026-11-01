import { toast } from "sonner";
import { Mail } from "lucide-react";
import { trpc } from "@/providers/trpc";

/** Le membre choisit quelles relances il reçoit par e-mail. Les e-mails de compte ne sont pas concernés. */
export function EmailPreferences() {
  const utils = trpc.useUtils();
  const q = trpc.emailPrefs.get.useQuery();
  const set = trpc.emailPrefs.set.useMutation({
    onSuccess: (_r, v) => { utils.emailPrefs.get.invalidate(); toast.success(v.enabled ? "C’est noté : vous recevrez ces e-mails" : "C’est noté : vous ne recevrez plus ces e-mails"); },
    onError: (e) => toast.error(e.message),
  });
  if (!q.data) return null;
  return (
    <section id="mes-emails" className="p-card p-5 sm:p-6 mt-9 flex flex-col gap-3 scroll-mt-20" aria-label="Mes e-mails">
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-none" style={{ background: "var(--p-accent-soft)", color: "var(--p-accent-text)" }}><Mail size={18} /></span>
        <div className="flex flex-col gap-0.5 min-w-0">
          <h2 className="m-0 text-[26px] leading-tight">Mes e-mails</h2>
          <p className="m-0 text-[14px] p-muted leading-relaxed">Choisissez ce que vous recevez{q.data.email ? ` à ${q.data.email}` : ""}. Les notifications dans l’application et les e-mails liés à votre compte, comme un nouveau mot de passe, ne changent pas.</p>
        </div>
      </div>
      <ul className="list-none m-0 p-0 flex flex-col">
        {q.data.categories.map((c) => (
          <li key={c.key} className="border-t first:border-t-0" style={{ borderColor: "var(--p-line)" }}>
            <label className="flex items-center gap-3 py-3 cursor-pointer">
              <span className="flex-1 min-w-0 flex flex-col gap-0.5"><span className="font-medium">{c.label}</span><span className="text-[13.5px] p-muted leading-snug">{c.description}</span></span>
              <input type="checkbox" className="w-[20px] h-[20px] flex-none" style={{ accentColor: "var(--p-accent)" }} checked={c.enabled} disabled={set.isPending} onChange={(e) => set.mutate({ category: c.key, enabled: e.target.checked })} />
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
