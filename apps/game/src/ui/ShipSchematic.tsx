import type { SubsystemId } from '@void-frontier/simulation';
import type { MessageKey, Translate } from '../i18n.ts';

const colour = (health: number) => (health <= 0 ? '#3a3f45' : health < 0.34 ? '#ff5a4a' : health < 0.67 ? '#ffb347' : '#7dffb2');

/**
 * Top-down damage diagram, nose to the right: engines at the tail, reactor, shield
 * generator and hold amidships, sensors and gun mounts at the nose. The layout matches
 * where hits land, so it also teaches which side to protect.
 */
export function ShipSchematic({ systems, mounts, t, compact = false }: { systems: Record<SubsystemId, number>; mounts?: { id: string; health: number }[]; t: Translate; compact?: boolean }) {
  const zone = (id: SubsystemId, x: number, y: number, w: number, h: number) => (
    <rect x={x} y={y} width={w} height={h} rx={3} fill={colour(systems[id])} opacity={0.85}>
      <title>
        {t(`system.${id}` as MessageKey)} {Math.round(systems[id] * 100)}%
      </title>
    </rect>
  );
  return (
    <svg className={`schematic ${compact ? 'compact' : ''}`} viewBox="0 0 132 54" role="img" aria-label={t('hud.systems')} data-testid={compact ? 'target-systems' : 'systems'}>
      <path d="M4 14 L22 6 L104 10 L128 27 L104 44 L22 48 L4 40 Z" fill="rgba(255,255,255,0.04)" stroke="rgba(138,160,180,0.45)" />
      {zone('engines', 8, 14, 22, 26)}
      {zone('reactor', 36, 10, 26, 16)}
      {zone('shieldGenerator', 36, 28, 26, 16)}
      {zone('cargoHold', 66, 12, 24, 30)}
      {zone('sensors', 96, 19, 22, 16)}
      {(mounts ?? []).map((m, i) => (
        <circle key={m.id} cx={112 - (i % 2) * 8} cy={i % 2 ? 12 : 42} r={4} fill={colour(m.health)}>
          <title>
            {t('system.weapon')} {Math.round(m.health * 100)}%
          </title>
        </circle>
      ))}
    </svg>
  );
}
