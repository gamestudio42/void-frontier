import { CREW_RULES, STATION_PLACEMENTS, getStation } from '@void-frontier/content';
import type { FleetNote, FleetOrder, Pilot } from '@void-frontier/simulation';
import { useState } from 'react';
import type { MessageKey, Translate } from '../i18n.ts';
import type { FleetShipView, FleetView } from '../store.ts';
import { formatNumber } from './format.ts';

export interface FleetActions {
  hirePilot(id: number): void;
  assignPilot(pilotId: number, shipId: number): void;
  dismissPilot(id: number): void;
  setOrder(shipId: number, order: FleetOrder | null): void;
}

/** Every trade run the markets allow: one station sells it, another buys it. */
const TRADE_RUNS: { from: string; to: string; resource: string }[] = (() => {
  const keys = [...STATION_PLACEMENTS.keys()];
  const market = (key: string) => getStation(STATION_PLACEMENTS.get(key)!.definition).market;
  return keys.flatMap((from) =>
    keys.flatMap((to) =>
      from === to ? [] : market(from).filter((m) => m.sells && market(to).some((n) => n.resource === m.resource && n.buys)).map((m) => ({ from, to, resource: m.resource })),
    ),
  );
})();

const orderKey = (order: FleetOrder): string => (order.kind === 'trade' ? `trade:${order.from}:${order.to}:${order.resource}` : order.kind === 'mine' ? `mine:${order.site}` : 'wingman');

function parseOrder(key: string): FleetOrder {
  const [kind, a, b, c] = key.split(':');
  if (kind === 'trade') return { kind: 'trade', from: a, to: b, resource: c };
  if (kind === 'mine') return { kind: 'mine', site: a };
  return { kind: 'wingman' };
}

/** One line naming an order: "Mining · Copper Reach", "Trading · Iron ore, Outpost Alpha → Ferrum Refinery". */
export function orderLine(order: FleetOrder | null, t: Translate): string {
  if (!order) return t('fleet.order.none');
  if (order.kind === 'wingman') return t('fleet.order.wingman');
  if (order.kind === 'mine') return `${t('fleet.order.mine')} · ${t(`site.${order.site}` as MessageKey)}`;
  return `${t('fleet.order.trade')} · ${t(`resource.${order.resource}` as MessageKey)}, ${t(`station.${order.from}` as MessageKey)} → ${t(`station.${order.to}` as MessageKey)}`;
}

function statusLine(s: FleetShipView, t: Translate): string {
  if (s.status === 'parked') return `${t('fleet.status.parked')} · ${t(`station.${s.station}` as MessageKey)}`;
  if (s.status === 'docked') return `${t('fleet.status.docked')} · ${t(`station.${s.station}` as MessageKey)}`;
  if (s.status === 'travel') return `${t('fleet.status.travel')} ${s.heading ? t(`station.${s.heading}` as MessageKey) : t('fleet.status.site')} · ${t(`sector.${s.sector}` as MessageKey)}`;
  if (s.status === 'work') return `${t('fleet.status.work')} · ${t(`sector.${s.sector}` as MessageKey)}`;
  return `${t('fleet.status.escort')} · ${t(`sector.${s.sector}` as MessageKey)}`;
}

export function Skills({ pilot, t }: { pilot: Pilot; t: Translate }) {
  return (
    <span className="skills">
      {(['piloting', 'mining', 'combat'] as const).map((k) => (
        <span key={k} title={t(`fleet.skill.${k}` as MessageKey)}>
          {t(`fleet.skill.${k}.short` as MessageKey)} <b>{'●'.repeat(pilot.skills[k])}</b>
          <i>{'●'.repeat(5 - pilot.skills[k])}</i>
        </span>
      ))}
    </span>
  );
}

/** Standing order controls for a ship parked here with a pilot aboard. */
export function OrderPicker({ ship, actions, t }: { ship: FleetShipView; actions: FleetActions; t: Translate }) {
  const [choice, setChoice] = useState(ship.order ? orderKey(ship.order) : ship.fit.mine ? `mine:${CREW_RULES.sites[0].id}` : `trade:${TRADE_RUNS[0].from}:${TRADE_RUNS[0].to}:${TRADE_RUNS[0].resource}`);
  if (!ship.pilot) return <p className="meta">{t('fleet.needsPilot')}</p>;
  return (
    <div className="order-picker">
      <select value={choice} onChange={(e) => setChoice(e.target.value)} data-testid={`order-${ship.ship}`} aria-label={t('fleet.order')}>
        <optgroup label={t('fleet.order.mine')}>
          {CREW_RULES.sites.map((site) => (
            <option key={site.id} value={`mine:${site.id}`} disabled={!ship.fit.mine}>
              {t(`site.${site.id}` as MessageKey)} ({t(`sector.${site.sector}` as MessageKey)})
            </option>
          ))}
        </optgroup>
        <optgroup label={t('fleet.order.trade')}>
          {TRADE_RUNS.map((r) => (
            <option key={`${r.from}${r.to}${r.resource}`} value={`trade:${r.from}:${r.to}:${r.resource}`} disabled={!ship.fit.trade}>
              {t(`resource.${r.resource}` as MessageKey)}: {t(`station.${r.from}` as MessageKey)} → {t(`station.${r.to}` as MessageKey)}
            </option>
          ))}
        </optgroup>
        <option value="wingman" disabled={!ship.fit.wingman}>
          {t('fleet.order.wingman')}
        </option>
      </select>
      <button onClick={() => actions.setOrder(ship.id, parseOrder(choice))} data-testid={`give-order-${ship.ship}`}>
        {t('fleet.give')}
      </button>
      {ship.order && (
        <button className="ghost" onClick={() => actions.setOrder(ship.id, null)}>
          {t('fleet.recall')}
        </button>
      )}
    </div>
  );
}

/** Crew board at the station: pilots for hire, pilots waiting here, and the payroll. */
export function CrewTab({ fleet, actions, t, locale }: { fleet: FleetView; actions: FleetActions; t: Translate; locale: string }) {
  const cr = (n: number) => `${formatNumber(locale, n)} cr`;
  const waiting = fleet.crew.filter((c) => c.here);
  const empty = fleet.ships.filter((s) => s.here && !s.pilot);
  const full = fleet.pilots >= fleet.maxPilots;
  return (
    <div className="crew">
      <p className="payroll" data-testid="payroll">
        {t('fleet.pilots')}: {fleet.pilots}/{fleet.maxPilots} · {t('fleet.payroll')}: {cr(fleet.payroll)} / {Math.round(CREW_RULES.cycleSeconds / 60)} min · {t('fleet.payIn')}{' '}
        {Math.ceil(fleet.payIn)} s
      </p>
      <h3>{t('fleet.forHire')}</h3>
      <div className="pilots">
        {fleet.offers.length === 0 && <p className="meta">{t('fleet.noneForHire')}</p>}
        {fleet.offers.map((p) => (
          <article key={p.id} className="pilot" data-testid="pilot-offer">
            <strong>{p.name}</strong>
            <Skills pilot={p} t={t} />
            <p className="meta">
              {t('fleet.wage')}: {cr(p.wage)}
            </p>
            <button disabled={full} onClick={() => actions.hirePilot(p.id)} data-testid={`hire-${p.id}`}>
              {t('fleet.hire')} · {cr(p.fee)}
            </button>
          </article>
        ))}
      </div>
      <h3>{t('fleet.waiting')}</h3>
      <div className="pilots">
        {waiting.length === 0 && <p className="meta">{t('fleet.noneWaiting')}</p>}
        {waiting.map(({ pilot }) => (
          <article key={pilot.id} className="pilot" data-testid="pilot-waiting">
            <strong>{pilot.name}</strong>
            <Skills pilot={pilot} t={t} />
            <p className="meta">
              {t('fleet.wage')}: {cr(pilot.wage)}
            </p>
            {empty.map((s) => (
              <button key={s.id} onClick={() => actions.assignPilot(pilot.id, s.id)} data-testid={`assign-${s.ship}`}>
                {t('fleet.assign')} {t(`ship.${s.ship}` as MessageKey)}
              </button>
            ))}
            {empty.length === 0 && <p className="meta">{t('fleet.noShipHere')}</p>}
            <button className="ghost" onClick={() => actions.dismissPilot(pilot.id)}>
              {t('fleet.dismiss')}
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}

function noteLine(n: FleetNote, t: Translate, locale: string): string {
  const who = n.pilot ?? (n.ship ? t(`ship.${n.ship}` as MessageKey) : '');
  const where = n.station ? t(`station.${n.station}` as MessageKey) : n.sector ? t(`sector.${n.sector}` as MessageKey) : '';
  const goods = n.resource ? `${n.units ?? ''} ${t(`resource.${n.resource}` as MessageKey)}`.trim() : '';
  const money = n.credits ? ` · ${formatNumber(locale, n.credits)} cr` : '';
  return `${who}: ${t(`fleet.note.${n.kind}` as MessageKey)}${goods ? ` ${goods}` : ''}${where ? ` · ${where}` : ''}${money}`;
}

/** Notice text for a fleet event: "Ada Ferreira lost the Mule hauler". */
export function fleetNotice(kind: string, ship: string, pilot: string, t: Translate): string {
  const name = pilot || (ship ? t(`ship.${ship}` as MessageKey) : '');
  return `${name}: ${t(`fleet.note.${kind}` as MessageKey)}${ship && pilot ? ` (${t(`ship.${ship}` as MessageKey)})` : ''}`;
}

/** Every owned ship at a glance, with recall; opened with O. */
export function FleetPanel({ fleet, actions, t, locale, onClose }: { fleet: FleetView; actions: FleetActions; t: Translate; locale: string; onClose(): void }) {
  const cr = (n: number) => `${n >= 0 ? '+' : '−'}${formatNumber(locale, Math.abs(n))} cr`;
  return (
    <div className="map-backdrop" onClick={onClose}>
      <section className="map fleet-panel" onClick={(e) => e.stopPropagation()} data-testid="fleet-panel">
        <header>
          <h2>{t('fleet.title')}</h2>
          <span className="label">
            {t('fleet.pilots')}: {fleet.pilots}/{fleet.maxPilots} · {t('fleet.payroll')}: {formatNumber(locale, fleet.payroll)} cr · {t('fleet.hint')}
          </span>
        </header>
        {fleet.ships.length === 0 ? (
          <p className="meta">{t('fleet.empty')}</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t('fleet.ship')}</th>
                <th>{t('fleet.pilot')}</th>
                <th>{t('fleet.order')}</th>
                <th>{t('fleet.status')}</th>
                <th>{t('station.held')}</th>
                <th>{t('fleet.earned')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {fleet.ships.map((s) => (
                <tr key={s.id} data-testid={`fleet-${s.ship}`}>
                  <td>{t(`ship.${s.ship}` as MessageKey)}</td>
                  <td>{s.pilot ? s.pilot.name : '—'}</td>
                  <td>{orderLine(s.order, t)}</td>
                  <td>{statusLine(s, t)}</td>
                  <td>{s.cargo}</td>
                  <td className={s.earned >= 0 ? 'gain' : 'loss'}>{cr(s.earned)}</td>
                  <td>
                    {s.order && (
                      <button className="ghost" onClick={() => actions.setOrder(s.id, null)}>
                        {t('fleet.recall')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {fleet.crew.length > 0 && (
          <p className="meta">
            {t('fleet.waiting')}: {fleet.crew.map((c) => `${c.pilot.name} (${t(`station.${c.station}` as MessageKey)})`).join(', ')}
          </p>
        )}
        {fleet.log.length > 0 && (
          <>
            <h3>{t('fleet.log')}</h3>
            <ul className="fleet-log">
              {fleet.log.map((n, i) => (
                <li key={`${n.tick}-${i}`}>{noteLine(n, t, locale)}</li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
