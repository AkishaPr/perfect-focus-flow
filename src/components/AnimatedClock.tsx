import { useEffect, useState } from "react";

/** One character of the clock. It plays its settle-in only if it appeared after the clock did. */
function Digit({ ch, animate }: { ch: string; animate: boolean }) {
  // Decided once, when this digit mounts: a digit that was already there never replays.
  const [fresh] = useState(animate);
  return <span className={fresh ? "motion-digit inline-block" : "inline-block"}>{ch}</span>;
}

/**
 * The clock text with each changed digit settling into place. A digit is keyed by its place
 * (counted from the right) and its value, so only the digits that actually changed are replaced:
 * the seconds move every second, the tens of seconds every ten. Nothing animates on first paint.
 * The text content is exactly the clock text.
 */
export function AnimatedClock({ text }: { text: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => setArmed(true), []);
  const chars = [...text];
  return (
    <>
      {chars.map((ch, i) => (
        <Digit key={`${chars.length - i}:${ch}`} ch={ch} animate={armed} />
      ))}
    </>
  );
}
