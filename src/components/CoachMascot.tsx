/** Le petit coach rouge de Présence : une goutte ronde avec deux yeux et un sourire. Personnage original. */
export function CoachMascot({ size = 56, mood = "happy" }: { size?: number; mood?: "happy" | "thinking" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" style={{ display: "block", overflow: "visible" }}>
      <defs>
        <radialGradient id="coach-body" cx="38%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#D2433F" />
          <stop offset="60%" stopColor="#A92B2A" />
          <stop offset="100%" stopColor="#7E1F1E" />
        </radialGradient>
      </defs>
      {/* petite étincelle sur la tête */}
      <path d="M45 5 l1.6 3.6 3.6 1.6 -3.6 1.6 -1.6 3.6 -1.6 -3.6 -3.6 -1.6 3.6 -1.6z" fill="#C4A574" />
      {/* corps : goutte arrondie */}
      <path d="M32 9 C46 9 55 21 55 35 C55 49 45 58 32 58 C19 58 9 49 9 35 C9 21 18 9 32 9 Z" fill="url(#coach-body)" />
      {/* reflet */}
      <ellipse cx="23" cy="22" rx="6" ry="3.5" fill="#fff" opacity="0.22" transform="rotate(-25 23 22)" />
      {/* joues */}
      <ellipse cx="19.5" cy="40" rx="4" ry="2.4" fill="#F2A6A0" opacity="0.55" />
      <ellipse cx="44.5" cy="40" rx="4" ry="2.4" fill="#F2A6A0" opacity="0.55" />
      {/* yeux */}
      <g className="p-mascot-eye"><ellipse cx="25" cy="33" rx="3.6" ry="4.6" fill="#fff" /><circle cx={mood === "thinking" ? 26.3 : 25.6} cy={mood === "thinking" ? 31.5 : 34} r="2" fill="#2A1110" /></g>
      <g className="p-mascot-eye"><ellipse cx="39" cy="33" rx="3.6" ry="4.6" fill="#fff" /><circle cx={mood === "thinking" ? 40.3 : 39.6} cy={mood === "thinking" ? 31.5 : 34} r="2" fill="#2A1110" /></g>
      {/* bouche */}
      {mood === "thinking"
        ? <path d="M28.5 45 h7" stroke="#2A1110" strokeWidth="2.2" strokeLinecap="round" />
        : <path d="M27 43.5 Q32 48.5 37 43.5" stroke="#2A1110" strokeWidth="2.2" fill="none" strokeLinecap="round" />}
    </svg>
  );
}
