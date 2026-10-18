import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { usePlanLog } from "@/lib/recovery/log";

const storageData = new Map<string, string>();

const memoryStorage: Storage = {
  get length() {
    return storageData.size;
  },
  clear() {
    storageData.clear();
  },
  getItem(key: string) {
    return storageData.get(String(key)) ?? null;
  },
  key(index: number) {
    return Array.from(storageData.keys())[index] ?? null;
  },
  removeItem(key: string) {
    storageData.delete(key);
  },
  setItem(key: string, value: string) {
    storageData.set(String(key), String(value));
  },
};

Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: memoryStorage,
});

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: memoryStorage,
});

Object.defineProperty(window, "scrollTo", {
  writable: true,
  value: () => {},
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// The plan log is module state: clear it so one test's snapshot is never another test's "yesterday".
afterEach(() => {
  usePlanLog.setState({ logs: [] });
});
