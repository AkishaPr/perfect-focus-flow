export * from "./intervals";
export * from "./windows";
export * from "./score";
export * from "./fit";

export const fmtDur = (min: number) => {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}m`;
  return r === 0 ? `${h}h` : `${h}h ${r}m`;
};
