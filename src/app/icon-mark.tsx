/**
 * The app's icon mark, shared between icon.tsx and apple-icon.tsx.
 *
 * A simple piggy bank — a coin about to drop through the slot. Colors
 * match the app's own theme (globals.css): ink background, the app's
 * indigo accent for the pig, warm gold for the coin.
 */

const INK = "#191917";
const PIG = "#6672e6";
const PIG_SHADE = "#4b56c8";
const GOLD = "#e8c15c";

export function MoneyIconMark({
  size,
  /** iOS applies its own corner mask to apple-touch-icon — a pre-rounded
   *  source would double-round, so that call site passes false. */
  rounded = true,
}: {
  size: number;
  rounded?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="100" height="100" rx={rounded ? 22 : 0} fill={INK} />

      {/* legs */}
      <rect x="26" y="73" width="9" height="11" rx="3" fill={PIG_SHADE} />
      <rect x="58" y="75" width="9" height="11" rx="3" fill={PIG_SHADE} />

      {/* body */}
      <ellipse cx="45" cy="56" rx="27" ry="21" fill={PIG} />

      {/* snout */}
      <ellipse cx="73" cy="58" rx="9" ry="8" fill={PIG} />
      <circle cx="70" cy="58" r="1.6" fill={INK} />
      <circle cx="76" cy="58" r="1.6" fill={INK} />

      {/* ear */}
      <polygon points="29,37 39,35 33,23" fill={PIG} />

      {/* eye */}
      <circle cx="35" cy="48" r="2.2" fill={INK} />

      {/* coin slot */}
      <rect x="37" y="33" width="15" height="4.5" rx="2.25" fill={INK} />

      {/* coin, dropping in */}
      <circle cx="44" cy="18" r="7.5" fill={GOLD} />
    </svg>
  );
}
