import type { AbilityKind } from '@void-frontier/content';

/**
 * Which module verb a gamepad d-pad press fires, or null to zoom as before. Up is the
 * dash. Down is the defence verb: chaff when missiles are inbound (or no EMP is
 * fitted), the EMP pulse otherwise.
 */
export function padVerb(direction: 'up' | 'down', fitted: ReadonlySet<AbilityKind>, missilesInbound: number): AbilityKind | null {
  if (direction === 'up') return fitted.has('dash') ? 'dash' : null;
  if (fitted.has('chaff') && (missilesInbound > 0 || !fitted.has('emp'))) return 'chaff';
  if (fitted.has('emp')) return 'emp';
  return null;
}
