import { useEffect, useState } from "react";

/** Les trois apparences : clair, sombre, douceur (la charte de Laura). Le choix reste dans ce navigateur. */
export type Theme = "clair" | "sombre" | "douceur";
const KEY = "presence-theme";
const THEMES: Theme[] = ["clair", "sombre", "douceur"];

export function readTheme(): Theme {
  try { const t = localStorage.getItem(KEY); return THEMES.includes(t as Theme) ? (t as Theme) : "clair"; } catch { return "clair"; }
}

/** Une classe sur <html> : « dark » pour le mode sombre, « douceur » pour le mode douceur, rien pour le clair. */
export function applyTheme(t: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", t === "sombre");
  root.classList.toggle("douceur", t === "douceur");
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(readTheme);
  useEffect(() => {
    applyTheme(theme);
    try { localStorage.setItem(KEY, theme); } catch { /* ignore */ }
  }, [theme]);
  return { theme, setTheme };
}
