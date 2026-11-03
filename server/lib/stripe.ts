import { env } from "./env";

/**
 * Abonnements des membres, tenus dans Stripe. Présence ne garde rien : chaque lecture interroge Stripe,
 * et le portail client de Stripe gère moyens de paiement, factures et résiliation.
 * Le membre est retrouvé par son adresse e-mail.
 */

export const stripeReady = () => !!env.stripeSecretKey;

// Version figée : la date de prochaine échéance reste sur l'abonnement lui-même
const VERSION = "2024-06-20";

interface Params { [key: string]: string | number | boolean | Params | undefined }

/** { flow_data: { type: "x" } } → flow_data[type]=x, comme Stripe l'attend. */
function flatten(p: Params, prefix = "", out: [string, string][] = []) {
  for (const [k, v] of Object.entries(p)) {
    if (v === undefined) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object") flatten(v, key, out);
    else out.push([key, String(v)]);
  }
  return out;
}

async function call<T>(method: "GET" | "POST" | "DELETE", path: string, params: Params = {}, query: [string, string][] = []): Promise<T> {
  const form = new URLSearchParams(flatten(params));
  const qs = method === "GET" ? new URLSearchParams([...flatten(params), ...query]).toString() : "";
  const res = await fetch(`${env.stripeApiBase}/v1/${path}${qs ? `?${qs}` : ""}`, {
    method,
    headers: { Authorization: `Bearer ${env.stripeSecretKey}`, "Stripe-Version": VERSION, ...(method === "GET" ? {} : { "Content-Type": "application/x-www-form-urlencoded" }) },
    body: method === "GET" ? undefined : form,
    signal: AbortSignal.timeout(15000),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
  if (!res.ok) throw new Error(`Stripe : ${data.error?.message ?? `erreur ${res.status}`}`);
  return data as T;
}

type Price = { unit_amount: number | null; currency: string; nickname: string | null; recurring: { interval: string; interval_count: number } | null; product: { name: string } | string };
export type Subscription = {
  id: string;
  status: string;
  cancel_at_period_end: boolean;
  cancel_at: number | null;
  current_period_end: number;
  pause_collection: { behavior: string; resumes_at: number | null } | null;
  items: { data: { price: Price }[] };
};

// Un abonnement qui compte encore : en cours, en essai, en retard de paiement ou en pause
const LIVE = ["active", "trialing", "past_due", "unpaid", "paused"];

/** Le client Stripe de ce membre et son abonnement en cours, s'il en a un. */
export async function findSubscription(email: string): Promise<{ customerId: string | null; sub: Subscription | null }> {
  const wanted = [...new Set([email, email.toLowerCase()])];
  const customers: { id: string }[] = [];
  for (const e of wanted) customers.push(...(await call<{ data: { id: string }[] }>("GET", "customers", { email: e, limit: 10 })).data);
  for (const c of customers) {
    const subs = await call<{ data: Subscription[] }>("GET", "subscriptions", { customer: c.id, status: "all", limit: 20 }, [["expand[]", "data.items.data.price.product"]]);
    const live = subs.data.filter((s) => LIVE.includes(s.status));
    const sub = live.find((s) => s.status === "active" || s.status === "trialing") ?? live[0];
    if (sub) return { customerId: c.id, sub };
  }
  return { customerId: customers[0]?.id ?? null, sub: null };
}

/** Ce que le membre voit de sa formule. */
export function describe(sub: Subscription) {
  const price = sub.items.data[0]?.price;
  const product = price && typeof price.product === "object" ? price.product.name : "";
  return {
    name: product || price?.nickname || "Abonnement Présence",
    amount: price?.unit_amount ?? null,
    currency: price?.currency ?? "eur",
    interval: price?.recurring ? (price.recurring.interval_count > 1 ? `${price.recurring.interval_count} ${price.recurring.interval}` : price.recurring.interval) : null,
    status: sub.status,
    paused: !!sub.pause_collection || sub.status === "paused",
    resumesAt: sub.pause_collection?.resumes_at ? new Date(sub.pause_collection.resumes_at * 1000) : null,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    endsAt: sub.cancel_at ? new Date(sub.cancel_at * 1000) : null,
    nextPaymentAt: sub.cancel_at_period_end || sub.pause_collection ? null : new Date(sub.current_period_end * 1000),
  };
}

/** Une session du portail client ; avec un abonnement, elle s'ouvre directement sur sa résiliation. */
export async function portalUrl(customerId: string, returnUrl: string, cancelSubscription?: string) {
  const flow: Params | undefined = cancelSubscription
    ? { type: "subscription_cancel", subscription_cancel: { subscription: cancelSubscription }, after_completion: { type: "redirect", redirect: { return_url: returnUrl } } }
    : undefined;
  return (await call<{ url: string }>("POST", "billing_portal/sessions", { customer: customerId, return_url: returnUrl, flow_data: flow })).url;
}

/** Pause : Stripe ne facture plus, rien n'est supprimé. */
export const pauseSubscription = (id: string) => call<Subscription>("POST", `subscriptions/${id}`, { pause_collection: { behavior: "void" } });

/** Reprise : une valeur vide retire la pause. */
export const resumeSubscription = (id: string) => call<Subscription>("POST", `subscriptions/${id}`, { pause_collection: "" });

/** Arrêt immédiat, à la suppression du compte. */
export const cancelSubscriptionNow = (id: string) => call<Subscription>("DELETE", `subscriptions/${id}`);
