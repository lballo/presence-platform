import { Bell } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { EmailPreferences } from "@/components/EmailPreferences";
import { SettingsTitle } from "./ParametresLayout";

/** Notifications : ce que je reçois par e-mail, et ce qui arrive dans la cloche. */
export default function Notifications() {
  return (
    <>
      <SettingsTitle title="Notifications" intro="Choisissez ce qui vous arrive par e-mail et ce qui s’affiche dans la cloche, en haut à droite." />
      <EmailPreferences />
      <BellPreferences />
    </>
  );
}

function BellPreferences() {
  const utils = trpc.useUtils();
  const q = trpc.account.bellPrefs.useQuery();
  const set = trpc.account.setBellPref.useMutation({ onSuccess: (_r, v) => { utils.account.bellPrefs.invalidate(); toast.success(v.enabled ? "Ces notifications reviennent dans la cloche" : "Ces notifications n’arriveront plus dans la cloche"); }, onError: (e) => toast.error(e.message) });
  if (!q.data) return null;
  return (
    <section className="p-card p-5 sm:p-6 flex flex-col gap-3" aria-label="Dans la cloche">
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-none" style={{ background: "var(--p-accent-soft)", color: "var(--p-accent-text)" }}><Bell size={18} /></span>
        <div className="flex flex-col gap-0.5 min-w-0">
          <h2 className="m-0 text-[26px] leading-tight">Dans la cloche</h2>
          <p className="m-0 text-[14px] p-muted leading-relaxed">Les décisions de l’équipe, comme un événement validé, s’affichent toujours. Les nouveaux messages ont leur propre bulle.</p>
        </div>
      </div>
      <ul className="list-none m-0 p-0 flex flex-col">
        {q.data.map((c) => (
          <li key={c.key} className="border-t first:border-t-0" style={{ borderColor: "var(--p-line)" }}>
            <label className="flex items-center gap-3 py-3 cursor-pointer">
              <span className="flex-1 min-w-0 flex flex-col gap-0.5"><span className="font-medium">{c.label}{c.soon && <span className="ml-2 p-chip h-6 px-2 text-[11.5px] cursor-default p-muted align-middle">bientôt</span>}</span><span className="text-[13.5px] p-muted leading-snug">{c.description}</span></span>
              <input type="checkbox" className="w-[20px] h-[20px] flex-none" style={{ accentColor: "var(--p-accent)" }} checked={c.enabled} disabled={set.isPending} onChange={(e) => set.mutate({ category: c.key, enabled: e.target.checked })} />
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
