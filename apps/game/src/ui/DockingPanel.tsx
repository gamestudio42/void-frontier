import type { MessageKey, Translate } from '../i18n.ts';
import type { DockingView } from '../store.ts';
import { formatNumber } from './format.ts';

/** Approach checklist shown near a station: each check turns green when it is within limits. */
export function DockingPanel({ docking, refused, t, locale }: { docking: DockingView; refused: string[] | null; t: Translate; locale: string }) {
  const checks = [
    { key: 'distance', ok: docking.distance <= docking.limits.maxDistance, value: `${formatNumber(locale, docking.distance)} / ${docking.limits.maxDistance} m` },
    { key: 'speed', ok: docking.speed <= docking.limits.maxRelativeSpeed, value: `${formatNumber(locale, docking.speed, 1)} / ${docking.limits.maxRelativeSpeed} m/s` },
    { key: 'alignment', ok: docking.angleError <= docking.limits.maxAngle, value: `${formatNumber(locale, docking.angleError)}° / ${docking.limits.maxAngle}°` },
  ];
  const hostiles = docking.refusals.includes('hostiles');
  const ready = docking.refusals.length === 0;
  return (
    <section className={`panel docking ${ready ? 'ready' : ''}`} data-testid="docking">
      <span className="label">{t('dock.title')}</span>
      {checks.map((check) => (
        <div key={check.key} className={`check ${check.ok ? 'ok' : ''}`}>
          <span>{check.ok ? '●' : '○'} {t(`dock.${check.key}` as MessageKey)}</span>
          <strong>{check.value}</strong>
        </div>
      ))}
      {hostiles && <div className="check warn">{t('dock.hostiles')}</div>}
      <div className="dock-hint">{ready ? t('dock.ready') : t('dock.hint')}</div>
      {refused && refused.length > 0 && (
        <div className="refused">
          {t('dock.refused')}: {refused.map((r) => t(`dock.refusal.${r}` as MessageKey)).join(', ')}
        </div>
      )}
    </section>
  );
}
