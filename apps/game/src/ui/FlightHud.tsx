import { RESOURCES } from '@void-frontier/content';
import type { FlightTelemetry } from '@void-frontier/simulation';
import type { MessageKey, Translate } from '../i18n.ts';
import type { HudState } from '../store.ts';
import { Compass } from './Compass.tsx';
import { DockingPanel } from './DockingPanel.tsx';
import { ShipSchematic } from './ShipSchematic.tsx';
import { formatBearing, formatDistance, formatNumber } from './format.ts';

interface FlightHudProps {
  hud: HudState;
  t: Translate;
  locale: string;
}

function Bar({ value, max, className }: { value: number; max: number; className?: string }) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div className={`bar ${className ?? ''}`}>
      <div className="bar-fill" style={{ width: `${ratio * 100}%` }} />
    </div>
  );
}


const RESOURCE_COLORS: Record<string, string> = Object.fromEntries([...RESOURCES.values()].map((r) => [r.id, r.color]));

/** Paired guns show as one line: the hotter of the pair drives the heat bar. */
function groupWeapons(weapons: FlightTelemetry['weapons']) {
  const groups = new Map<string, { id: string; group: string; heat: number; overheated: boolean; count: number }>();
  for (const w of weapons) {
    const g = groups.get(w.id);
    if (g) {
      g.count++;
      g.heat = Math.max(g.heat, w.heat);
      g.overheated ||= w.overheated;
    } else groups.set(w.id, { id: w.id, group: w.group, heat: w.heat, overheated: w.overheated, count: 1 });
  }
  return [...groups.values()];
}

function TargetPanel({ hud, t, locale }: FlightHudProps) {
  const target = hud.target;
  if (!target) return null;
  return (
    <section className="panel target" data-testid="target" data-shield={target.shield.toFixed(2)} data-hull={target.hull.toFixed(2)}>
      <div className="row">
        <span className="label">{t('hud.target')}</span>
        <span className="hostile">{t(`faction.${target.faction}` as MessageKey)}</span>
      </div>
      <strong className="target-name">{t(`ship.${target.shipId}` as MessageKey)}</strong>
      <div className="row">
        <span>{formatDistance(locale, target.distance)}</span>
        <span>
          {t('hud.closing')} {formatNumber(locale, target.closingSpeed)} {t('unit.speed')}
        </span>
      </div>
      <Bar value={target.shield} max={target.shieldMax} className="shield" />
      <Bar value={target.hull} max={target.hullMax} className="hull" />
      {hud.aimedSystem && (
        <div className="aimed" data-testid="aimed-system">
          {t('hud.aiming')}: <strong>{t(`system.${hud.aimedSystem}` as MessageKey)}</strong>
        </div>
      )}
      {(hud.aimedSystem || hud.hudDetails) && <ShipSchematic systems={target.subsystems} t={t} compact />}
    </section>
  );
}

export function FlightHud({ hud, t, locale }: FlightHudProps) {
  const tel = hud.telemetry;
  if (!tel) return null;
  const fuelRatio = tel.fuel / tel.fuelCapacity;
  const p = hud.proximity;
  // Warn when contact is close in time and fast enough to hurt.
  const warning = p && p.timeToImpact !== null && p.timeToImpact < 5 && p.closingSpeed > 3 && !tel.destroyed ? p.timeToImpact : null;
  const modeKey: MessageKey = tel.mode === 'assisted' ? 'hud.mode.assisted' : 'hud.mode.newtonian';

  return (
    <div className={hud.hudDetails ? 'hud' : 'hud compact'}>
      <header className="hud-top">
        <div className="brand">
          <strong>{t('app.title')}</strong>
          <span data-testid="sector" data-value={hud.sectorId}>
            {t(`sector.${hud.sectorId}` as MessageKey)} · {t(`ship.${tel.shipId}` as MessageKey)}
          </span>
        </div>
        <div className={`mode mode-${tel.mode}`} data-testid="flight-mode" data-mode={tel.mode}>
          <span className="label">{t('hud.mode')}</span>
          <strong>{t(modeKey)}</strong>
          <kbd>C</kbd>
        </div>
        <div className="credits-badge" data-testid="hud-credits" data-value={tel.credits}>
          <span className="label">{t('hud.credits')}</span>
          <strong>{formatNumber(locale, tel.credits)} cr</strong>
        </div>
        <div className="flags">
          {warning && (
            <span className="flag collision" data-testid="collision-warning">
              {t('hud.collision')} {formatNumber(locale, warning, 1)} s
            </span>
          )}
          {tel.output.boosting && <span className="flag boost">{t('hud.boost')}</span>}
          {hud.braking && <span className="flag brake">{t('hud.brake')}</span>}
          {tel.fuel <= 0 && <span className="flag empty">{t('hud.noFuel')}</span>}
          {hud.holdFull && <span className="flag full">{t('hud.holdFull')}</span>}
          {hud.jettisonArmed && <span className="flag brake">{t('hud.jettisonArmed')}</span>}
        </div>
      </header>

      <section className="panel nav" aria-label={t('hud.speed')}>
        <Compass heading={tel.heading} course={tel.course} />
        <div className="readouts">
          <div className="readout big" data-testid="speed" data-value={tel.speed.toFixed(3)}>
            <span className="label">{t('hud.speed')}</span>
            <strong>{formatNumber(locale, tel.speed, 1)}</strong>
            <span className="unit">{t('unit.speed')}</span>
          </div>
          <div className="readout heading detail" data-testid="heading" data-value={tel.heading.toFixed(3)}>
            <span className="label">{t('hud.heading')}</span>
            <strong>{formatBearing(tel.heading)}</strong>
          </div>
          <div className="readout course detail">
            <span className="label">{t('hud.course')}</span>
            <strong>{tel.course === null ? '—' : formatBearing(tel.course)}</strong>
          </div>
          <div className="readout detail">
            <span className="label">{t('hud.drift')}</span>
            <strong>{tel.drift === null ? '—' : `${Math.round(tel.drift) > 0 ? '+' : ''}${formatNumber(locale, tel.drift)}°`}</strong>
          </div>
          <div className="readout detail">
            <span className="label">{t('hud.turnRate')}</span>
            <strong>{formatNumber(locale, tel.turnRate)}</strong>
            <span className="unit">{t('unit.turn')}</span>
          </div>
          <div className="readout stop">
            <span className="label">{t('hud.stop')}</span>
            <strong>{tel.speed < 0.05 ? t('hud.stopped') : formatDistance(locale, tel.stoppingDistance)}</strong>
          </div>
        </div>
      </section>

      <section className="panel ship">
        <div className="detail">
          <ShipSchematic systems={tel.subsystems} mounts={tel.mounts} t={t} />
        </div>
        <div className="row">
          <span className="label">{t('hud.hull')}</span>
          <strong data-testid="hull" data-value={tel.hull.toFixed(2)}>{formatNumber(locale, (tel.hull / tel.hullMax) * 100)}%</strong>
        </div>
        <Bar value={tel.hull} max={tel.hullMax} className={`hull ${tel.hull / tel.hullMax < 0.35 ? 'low' : tel.hull / tel.hullMax < 0.7 ? 'mid' : ''}`} />
        <div className="row">
          <span className="label">{t('hud.shield')}</span>
          <strong data-testid="shield" data-value={tel.shield.toFixed(2)}>{formatNumber(locale, (tel.shield / Math.max(1, tel.shieldMax)) * 100)}%</strong>
        </div>
        <Bar value={tel.shield} max={tel.shieldMax} className="shield" />
        <div className="row">
          <span className="label">{t('hud.energy')}</span>
          <strong>{formatNumber(locale, (tel.energy / Math.max(1, tel.energyMax)) * 100)}%</strong>
        </div>
        <Bar value={tel.energy} max={tel.energyMax} className="energy" />
        <div className="row">
          <span className="label">{t('hud.fuel')}</span>
          <strong data-testid="fuel" data-value={tel.fuel.toFixed(3)}>{formatNumber(locale, fuelRatio * 100)}%</strong>
        </div>
        <Bar value={tel.fuel} max={tel.fuelCapacity} className={fuelRatio < 0.2 ? 'low' : ''} />
        <div className="row detail">
          <span className="label">{t('hud.mass')}</span>
          <strong data-testid="mass" data-value={tel.mass.toFixed(1)}>
            {formatNumber(locale, tel.mass / 1000, 2)} {t('unit.mass')}
          </strong>
        </div>
        <div className="row">
          <span className="label">{t('hud.hold')}</span>
          <strong data-testid="hold" data-value={tel.holdMass.toFixed(1)}>
            {formatNumber(locale, tel.holdMass / 1000, 2)} / {formatNumber(locale, tel.holdMaxMass / 1000, 1)} {t('unit.mass')}
          </strong>
        </div>
        <Bar value={tel.holdMass} max={tel.holdMaxMass} className="hold" />
        {tel.hold.map((item) => (
          <div key={item.resource} className="row dim hold-item detail">
            <span>
              <i className="swatch" style={{ background: RESOURCE_COLORS[item.resource] }} /> {t(`resource.${item.resource}` as MessageKey)}
            </span>
            <strong>
              {item.units} {t('unit.units')}
            </strong>
          </div>
        ))}
        <div className="row detail">
          <span className="label">{t('hud.accel')}</span>
          <strong>{formatNumber(locale, tel.mainAcceleration, 1)} {t('unit.accel')}</strong>
        </div>
        <div className="weapons">
          <div className="row">
            <span className="label">{t('hud.weapons')}</span>
            <span className="kills" data-testid="kills" data-value={tel.kills}>
              {t('hud.kills')}: <strong>{tel.kills}</strong>
            </span>
          </div>
          {groupWeapons(tel.weapons).map((w) => (
            <div key={w.id} className={`weapon ${w.overheated ? 'hot' : ''}`}>
              <span>
                <kbd>{w.group === 'primary' ? 'LMB' : w.group === 'secondary' ? 'RMB' : 'MMB'}</kbd> {t(`hud.weapon.${w.id}` as MessageKey)}
                {w.count > 1 ? ` ×${w.count}` : ''}
              </span>
              <div className="heat">
                <div style={{ width: `${w.heat * 100}%` }} />
              </div>
              {w.overheated && <em>{t('hud.overheat')}</em>}
            </div>
          ))}
        </div>
      </section>

      <TargetPanel hud={hud} t={t} locale={locale} />
      {hud.gate && !hud.docking && (
        <section className={`panel gate-panel ${hud.gate.ready ? 'ready' : ''}`} data-testid="gate">
          <span className="label">{t('gate.title')}</span>
          <strong>
            {t('gate.to')} {t(`sector.${hud.gate.to}` as MessageKey)}
          </strong>
          <span>
            {formatDistance(locale, hud.gate.distance)} · {formatNumber(locale, hud.gate.speed)} {t('unit.speed')}
          </span>
          <em>{hud.gate.ready ? t('gate.ready') : t('gate.hint')}</em>
        </section>
      )}
      {hud.gravity > 0.2 && (
        <div className="gravity" data-testid="gravity">
          {t('hud.gravity')}: <strong>{formatNumber(locale, hud.gravity, 1)} {t('unit.accel')}</strong>
        </div>
      )}
      {hud.boarding && !hud.docking && (
        <section className={`panel gate-panel ${hud.boarding.ready ? 'ready' : ''}`} data-testid="boarding">
          <span className="label">{t('board.title')}</span>
          <span>
            {formatDistance(locale, hud.boarding.distance)} · {formatNumber(locale, hud.boarding.relativeSpeed)} {t('unit.speed')}
          </span>
          <em>{hud.boarding.ready ? t('board.ready') : t('board.hint')}</em>
        </section>
      )}
      {hud.docking && <DockingPanel docking={hud.docking} refused={hud.dockRefused} t={t} locale={locale} />}

      <section className="mining-status">
        <span>
          <kbd>R</kbd> {t('hud.scanner')}: <strong>{tel.scanCooldown > 0 ? `${formatNumber(locale, tel.scanCooldown, 1)} s` : t('hud.scanReady')}</strong>
        </span>
        {tel.miningTarget && (
          <span className="mining-target" data-testid="mining-target">
            {t('hud.mining')}: <strong>{t(`rock.${tel.miningTarget.asteroidType}` as MessageKey)}</strong> · {Math.ceil(tel.miningTarget.ore)} / {tel.miningTarget.oreMax}{' '}
            {t('unit.units')} {t('hud.oreLeft')}
          </span>
        )}
      </section>

      <ul className="gains" aria-live="polite">
        {hud.gains.map((gain) => (
          <li key={gain.resource}>
            <i className="swatch" style={{ background: RESOURCE_COLORS[gain.resource] }} /> +{gain.units} {t(`resource.${gain.resource}` as MessageKey)}
          </li>
        ))}
      </ul>

      <footer className="hud-bottom">
        <span>{hud.steering ? t('hud.steering.on') : t('hud.steering.off')} <kbd>V</kbd></span>
        <span>{t('hud.helpHint')}</span>
        <span>
          <kbd>I</kbd> {t('hud.detailsHint')}
        </span>
      </footer>
    </div>
  );
}
