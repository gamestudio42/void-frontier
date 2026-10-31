/** Each speaker's look: helmet, collar and visor colours, and whether the visor is up. */
const LOOKS: Record<string, { suit: string; trim: string; skin: string; visor: string | null; hair: string }> = {
  dispatcher: { suit: '#2f4a5e', trim: '#6fd3ff', skin: '#c99a7a', visor: null, hair: '#2b211c' },
  oyelaran: { suit: '#2e4a35', trim: '#8fd18a', skin: '#6e4a36', visor: null, hair: '#151311' },
  foreman: { suit: '#5a4524', trim: '#e0b24a', skin: '#b98a68', visor: '#1b2228', hair: '#55504a' },
  varo: { suit: '#3a1d1d', trim: '#ff5a4a', skin: '#a9856f', visor: null, hair: '#6b1f1a' },
};

/** A small drawn bust for whoever is speaking: made here, in the game's own flat style. */
export function Portrait({ speaker }: { speaker: string }) {
  const look = LOOKS[speaker] ?? LOOKS.dispatcher;
  return (
    <svg viewBox="0 0 64 64" className="portrait" role="img" aria-hidden="true">
      <rect width="64" height="64" rx="4" fill="#0b1118" />
      <path d="M10 64c1-14 10-20 22-20s21 6 22 20z" fill={look.suit} />
      <path d="M24 46l8 7 8-7 3 3-11 10-11-10z" fill={look.trim} />
      <rect x="27" y="36" width="10" height="10" fill={look.skin} />
      <ellipse cx="32" cy="27" rx="12" ry="14" fill={look.skin} />
      <path d="M19 26c-1-12 6-18 13-18s14 6 13 18c-3-6-7-9-13-9s-10 3-13 9z" fill={look.hair} />
      {look.visor ? (
        <rect x="21" y="24" width="22" height="7" rx="3" fill={look.visor} stroke={look.trim} strokeWidth="1" />
      ) : (
        <>
          <rect x="24.5" y="26" width="5" height="2" rx="1" fill="#10151a" />
          <rect x="34.5" y="26" width="5" height="2" rx="1" fill="#10151a" />
          <rect x="28" y="34" width="8" height="1.4" rx="0.7" fill="#3a2a24" />
        </>
      )}
    </svg>
  );
}
