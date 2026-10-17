import { afterEach, describe, expect, it } from "vitest";

import { THEME_INIT_SCRIPT, THEME_KEY, parseTheme, setTheme } from "@/lib/theme";

describe("theme", () => {
  afterEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
    document.documentElement.style.colorScheme = "";
  });

  it("defaults to light for missing or unknown values", () => {
    expect(parseTheme(null)).toBe("light");
    expect(parseTheme("sepia")).toBe("light");
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("light")).toBe("light");
  });

  it("applies and remembers the chosen theme", () => {
    setTheme("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem(THEME_KEY)).toBe("dark");

    setTheme("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(localStorage.getItem(THEME_KEY)).toBe("light");
  });

  it("uses a storage key separate from the study data store", () => {
    expect(THEME_KEY).not.toBe("alcc:v1");
  });

  it("ships an init script that restores a saved dark theme before paint", () => {
    localStorage.setItem(THEME_KEY, "dark");
    new Function(THEME_INIT_SCRIPT)();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});
