import type { ReactNode } from 'react';

/**
 * A bust for whoever is speaking. Each speaker is a different silhouette, readable at the
 * size of the briefing card: headset, sealed helmet, hard hat, or bare head.
 */
export function Portrait({ speaker }: { speaker: string }) {
  if (speaker === 'oyelaran') return <Oyelaran />;
  if (speaker === 'foreman') return <Foreman />;
  if (speaker === 'varo') return <Varo />;
  return <Dispatch />;
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 64 64" className="portrait" role="img" aria-hidden="true">
      <rect width="64" height="64" fill="#0b1118" />
      {children}
    </svg>
  );
}

/** Station radio: open face, a headset, a blue collar. */
function Dispatch() {
  return (
    <Frame>
      <path d="M8 64c2-16 12-22 24-22s22 6 24 22z" fill="#2f4a5e" />
      <path d="M26 46l6 8 6-8 4 2-10 10-10-10z" fill="#6fd3ff" />
      <circle cx="32" cy="28" r="14" fill="#c99a7a" />
      <path d="M18 30c0-14 6-20 14-20s14 6 14 20c-4-6-8-8-14-8s-10 2-14 8z" fill="#2b211c" />
      <path d="M16 30h32" stroke="#6fd3ff" strokeWidth="3" />
      <circle cx="16" cy="30" r="4" fill="#0b1118" stroke="#6fd3ff" strokeWidth="2" />
      <rect x="46" y="22" width="3" height="14" fill="#6fd3ff" />
      <rect x="26" y="27" width="4" height="2" fill="#10151a" />
      <rect x="34" y="27" width="4" height="2" fill="#10151a" />
    </Frame>
  );
}

/** Guard commander: a sealed helmet, no skin, a visor and rank marks. */
function Oyelaran() {
  return (
    <Frame>
      <path d="M6 64c2-14 14-20 26-20s24 6 26 20z" fill="#1c3a28" />
      <path d="M22 48h20l4 8H18z" fill="#d7b15a" />
      <path d="M14 40c2-20 8-28 18-28s16 8 18 28c-2 6-8 10-18 10s-16-4-18-10z" fill="#24362c" />
      <path d="M16 34h32v7H16z" fill="#9fe7ff" />
      <path d="M20 18h6l-2 8h-6zM38 18h6l2 8h-6z" fill="#d7b15a" />
      <rect x="30" y="12" width="4" height="6" fill="#d7b15a" />
    </Frame>
  );
}

/** Yard foreman: a hard hat, a wide vest, a beard. */
function Foreman() {
  return (
    <Frame>
      <path d="M4 64c4-12 16-18 28-18s24 6 28 18z" fill="#5a4524" />
      <path d="M16 46h32l2 10H14z" fill="#e0b24a" />
      <rect x="18" y="22" width="28" height="18" rx="2" fill="#b98a68" />
      <path d="M20 34h24v8H20z" fill="#5a3a28" />
      <path d="M12 24h40v8H12z" fill="#e0b24a" />
      <path d="M14 20h36l-4-8H18z" fill="#f0c85a" />
      <rect x="24" y="28" width="5" height="2" fill="#10151a" />
      <rect x="35" y="28" width="5" height="2" fill="#10151a" />
    </Frame>
  );
}

/** The warlord: long hair, a bare face, a red wrap and a scar. */
function Varo() {
  return (
    <Frame>
      <path d="M10 64c1-18 10-24 22-24s21 6 22 24z" fill="#3a1d1d" />
      <path d="M24 44l8 12 8-12 6 4-14 12-14-12z" fill="#ff5a4a" />
      <ellipse cx="32" cy="30" rx="10" ry="13" fill="#a9856f" />
      <path d="M16 34c-2-22 8-30 16-30s18 8 16 30c-6-10-10-14-16-14s-10 4-16 14z" fill="#6b1f1a" />
      <path d="M14 46c4-8 8-10 12-6 2 6-4 12-12 10zM50 46c-4-8-8-10-12-6-2 6 4 12 12 10z" fill="#6b1f1a" />
      <rect x="26" y="28" width="4" height="2" fill="#10151a" />
      <rect x="34" y="28" width="4" height="2" fill="#10151a" />
      <path d="M40 24l6 10" stroke="#ff5a4a" strokeWidth="1.4" />
    </Frame>
  );
}
