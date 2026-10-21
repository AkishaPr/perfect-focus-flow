import type { CSSProperties } from "react";

/**
 * Position in a staggered entrance. The `motion-*` utilities in styles.css multiply this by the
 * stagger step to get each element's delay, so siblings arrive one after another instead of at once.
 */
export const stagger = (i: number) => ({ "--i": i }) as CSSProperties;
