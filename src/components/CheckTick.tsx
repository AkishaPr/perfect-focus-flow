/**
 * A check mark that draws itself when it appears. Mount it when the thing becomes checked (it is
 * not there before), so the tick is drawn once, at the moment of checking.
 */
export function CheckTick({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {/* pathLength makes the dash arithmetic independent of the real length: 20 is "all of it". */}
      <path
        d="M5 12.5l4.5 4.5L19 7"
        pathLength={20}
        strokeDasharray="20 20"
        className="motion-tick"
      />
    </svg>
  );
}
