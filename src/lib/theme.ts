import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

/** Separate from the data store (alcc:v1): a display preference, not study data. */
export const THEME_KEY = "alcc:theme";
export const DEFAULT_THEME: Theme = "light";

export function parseTheme(raw: unknown): Theme {
  return raw === "dark" || raw === "light" ? raw : DEFAULT_THEME;
}

/** Runs in <head> before first paint so the page never flashes the wrong theme. */
export const THEME_INIT_SCRIPT = `try{var d=localStorage.getItem("${THEME_KEY}")==="dark";var r=document.documentElement;r.classList.toggle("dark",d);r.style.colorScheme=d?"dark":"light"}catch(e){}`;

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function currentTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function setTheme(theme: Theme) {
  applyTheme(theme);
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Storage can be blocked; the theme still applies for this session.
  }
  listeners.forEach((l) => l());
}

export function useTheme(): [Theme, (theme: Theme) => void] {
  const theme = useSyncExternalStore(subscribe, currentTheme, () => DEFAULT_THEME);
  return [theme, setTheme];
}
