// The two tiny door glyphs — a right arrow that morphs into a tick. Shared by
// the referral field, the email field, and the install link so the three
// "doors" speak one visual language: the arrow is the action (apply / send /
// launch), the tick is its completion. Stroked (currentColor) so they inherit
// the door's ink and any hover/done colour, 1.5px for a hairline weight that
// sits comfortably beside 15px serif text.

export function ArrowIcon() {
  return (
    <svg
      className="door-glyph"
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M2.5 8h10M8.5 4l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function TickIcon() {
  return (
    <svg
      className="door-glyph"
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3 8.5l3.2 3.2L13 4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
