/**
 * Adresse précise (présentiel) et lien visio (en ligne, salon) :
 * transmis uniquement aux personnes inscrites, à l’organisatrice et aux leaders/administratrices.
 */
export function eventAccess(e: { address: string; meetingUrl: string; kind: string }, allowed: boolean) {
  const hasAccessInfo = e.kind === "onsite" ? !!e.address : !!e.meetingUrl;
  return {
    hasAccessInfo,
    address: allowed && e.kind === "onsite" ? e.address : "",
    meetingUrl: allowed && e.kind !== "onsite" ? e.meetingUrl : "",
  };
}
