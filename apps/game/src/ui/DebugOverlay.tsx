import type { Translate } from '../i18n.ts';
import type { HudState } from '../store.ts';

export function DebugOverlay({ hud, t }: { hud: HudState; t: Translate }) {
  const s = hud.stats;
  const p = hud.telemetry?.position;
  const rows: [string, string][] = [
    [t('debug.fps'), s.fps.toFixed(0)],
    [t('debug.frame'), `${s.frameMs.toFixed(1)} ms`],
    [t('debug.tick'), String(s.tick)],
    [t('debug.steps'), s.stepsPerFrame.toFixed(2)],
    [t('debug.dropped'), `${s.droppedSeconds.toFixed(2)} s`],
    [t('debug.entities'), String(s.entities)],
    [t('debug.draws'), String(s.drawCalls)],
    [t('debug.triangles'), `${(s.triangles / 1000).toFixed(0)}k`],
    [t('debug.zoom'), `${s.zoom.toFixed(2)}×`],
    [t('debug.quality'), `${s.quality}${s.autoQuality ? ' (auto)' : ''}`],
    [t('debug.position'), p ? `${p.x.toFixed(0)}, ${p.y.toFixed(0)}` : '—'],
  ];
  return (
    <aside className="debug" data-testid="debug">
      {rows.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </aside>
  );
}
