import { getUpgrade } from '@void-frontier/content';
import { useState } from 'react';
import type { MessageKey, Translate } from '../i18n.ts';
import type { ContractsView, StationView } from '../store.ts';
import { ContractsTab, NewsFeed, type ContractActions } from './contracts.tsx';
import { formatNumber } from './format.ts';

export interface StationActions extends ContractActions {
  sellUpgrade(id: string): void;
  undock(): void;
  trade(resource: string, units: number, side: 'buy' | 'sell'): void;
  service(kind: 'repair' | 'refuel'): void;
  buyUpgrade(id: string): void;
}

interface StationPanelProps {
  view: StationView;
  contracts: ContractsView | null;
  news: { tick: number; kind: string; subject: string }[];
  events: { id: string; secondsLeft: number }[];
  hull: { value: number; max: number };
  fuel: { value: number; max: number };
  hold: { mass: number; max: number };
  actions: StationActions;
  t: Translate;
  locale: string;
}

type Tab = 'contracts' | 'market' | 'services' | 'upgrades';

/** Upgrade effects as short, translated lines. */
function effectLines(id: string, t: Translate, locale: string): string[] {
  const e = getUpgrade(id).effects;
  const lines: string[] = [];
  if (e.thrustMultiplier) lines.push(`${t('upgrade.effect.thrust')} +${formatNumber(locale, (e.thrustMultiplier - 1) * 100)}%`);
  if (e.hullBonus) lines.push(`${t('hud.hull')} +${e.hullBonus}`);
  if (e.armorBonus) lines.push(`${t('upgrade.effect.armor')} +${formatNumber(locale, e.armorBonus * 100)}%`);
  if (e.cargoMassBonus) lines.push(`${t('hud.hold')} +${formatNumber(locale, e.cargoMassBonus / 1000, 1)} ${t('unit.mass')}`);
  if (e.shieldBonus) lines.push(`${t('hud.shield')} +${e.shieldBonus}`);
  if (e.shieldRechargeBonus) lines.push(`${t('upgrade.effect.recharge')} +${e.shieldRechargeBonus}/s`);
  if (e.boostBonus) lines.push(`${t('upgrade.effect.boost')} +${formatNumber(locale, e.boostBonus * 100)}%`);
  if (e.scanRangeBonus) lines.push(`${t('hud.scanner')} +${e.scanRangeBonus} m`);
  if (e.sensorRangeBonus) lines.push(`${t('upgrade.effect.sensors')} +${e.sensorRangeBonus} m`);
  if (e.tractorMultiplier) lines.push(`${t('upgrade.effect.tractor')} ×${e.tractorMultiplier}`);
  if (e.gimbalBonus) lines.push(`${t('upgrade.effect.gimbal')} +${e.gimbalBonus}°`);
  if (e.repairRate) lines.push(`${t('upgrade.effect.repair')} ${formatNumber(locale, e.repairRate * 100, 1)}%/s`);
  lines.push(`${t('hud.mass')} +${formatNumber(locale, getUpgrade(id).equipmentMass / 1000, 2)} ${t('unit.mass')}`);
  return lines;
}

export function StationPanel({ view, contracts, news, events, hull, fuel, hold, actions, t, locale }: StationPanelProps) {
  const [tab, setTab] = useState<Tab>('contracts');
  const cr = (n: number) => `${formatNumber(locale, n)} cr`;
  return (
    <div className="station-backdrop">
      <section className="station" role="dialog" aria-label={t(`station.${view.name}` as MessageKey)} data-testid="station">
        <header>
          <div>
            <span className="label">
              {t('station.docked')} · {t(`faction.${view.faction}` as MessageKey)} ({view.standing > 0 ? '+' : ''}
              {Math.round(view.standing)})
            </span>
            <h2>{t(`station.${view.name}` as MessageKey)}</h2>
          </div>
          <div className="credits" data-testid="credits" data-value={view.credits}>
            {cr(view.credits)}
          </div>
        </header>
        <nav className="tabs" role="tablist">
          {(['contracts', 'market', 'services', 'upgrades'] as Tab[]).map((id) => (
            <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)} data-testid={`tab-${id}`}>
              {t(`station.tab.${id}` as MessageKey)}
            </button>
          ))}
        </nav>

        {tab === 'contracts' && <NewsFeed news={news} events={events} t={t} />}
        {tab === 'contracts' && contracts && <ContractsTab view={contracts} actions={actions} t={t} locale={locale} />}

        {tab === 'market' && (
          <div className="market">
            <div className="hold-line">
              {t('hud.hold')}: {formatNumber(locale, hold.mass / 1000, 2)} / {formatNumber(locale, hold.max / 1000, 1)} {t('unit.mass')}
            </div>
            <table>
              <thead>
                <tr>
                  <th>{t('station.goods')}</th>
                  <th>{t('station.stock')}</th>
                  <th>{t('station.held')}</th>
                  <th>{t('station.sellPrice')}</th>
                  <th>{t('station.buyPrice')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {view.market.map((item) => (
                  <tr key={item.resource} data-testid={`market-${item.resource}`}>
                    <td>{t(`resource.${item.resource}` as MessageKey)}</td>
                    <td>{item.stock}</td>
                    <td>{item.held}</td>
                    <td className="price">{item.sell === null ? '—' : cr(item.sell)}</td>
                    <td className="price">{item.buy === null ? '—' : cr(item.buy)}</td>
                    <td className="actions">
                      <button disabled={item.sell === null || item.held === 0} onClick={() => actions.trade(item.resource, item.held, 'sell')} data-testid={`sell-all-${item.resource}`}>
                        {t('station.sellAll')}
                      </button>
                      <button disabled={item.sell === null || item.held === 0} onClick={() => actions.trade(item.resource, 1, 'sell')}>
                        −1
                      </button>
                      <button disabled={item.buy === null || item.stock === 0} onClick={() => actions.trade(item.resource, 1, 'buy')}>
                        +1
                      </button>
                      <button disabled={item.buy === null || item.stock === 0} onClick={() => actions.trade(item.resource, 10, 'buy')}>
                        +10
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'services' && (
          <div className="services">
            <div className="service">
              <div>
                <strong>{t('station.repair')}</strong>
                <span>
                  {t('hud.hull')} {formatNumber(locale, (hull.value / hull.max) * 100)}%
                </span>
              </div>
              <button disabled={view.repairCost === 0 || view.credits === 0} onClick={() => actions.service('repair')} data-testid="repair">
                {view.repairCost === 0 ? t('station.notNeeded') : `${t('station.repair')} · ${cr(view.repairCost)}`}
              </button>
            </div>
            <div className="service">
              <div>
                <strong>{t('station.refuel')}</strong>
                <span>
                  {t('hud.fuel')} {formatNumber(locale, (fuel.value / fuel.max) * 100)}%
                </span>
              </div>
              <button disabled={view.refuelCost === 0 || view.credits === 0} onClick={() => actions.service('refuel')} data-testid="refuel">
                {view.refuelCost === 0 ? t('station.notNeeded') : `${t('station.refuel')} · ${cr(view.refuelCost)}`}
              </button>
            </div>
            <p className="note">{t('station.serviceNote')}</p>
          </div>
        )}

        {tab === 'upgrades' && (
          <div className="outfitting">
            <div className="slot-summary">
              {(['engine', 'utility', 'defense'] as const).map((slot) => (
                <span key={slot} className={view.slots[slot].used >= view.slots[slot].total ? 'full' : ''}>
                  {t(`slot.${slot}` as MessageKey)} {view.slots[slot].used}/{view.slots[slot].total}
                </span>
              ))}
            </div>
            <div className="upgrades">
              {view.upgrades.map((u) => {
                const noSlot = !u.installed && view.slots[u.slot].used >= view.slots[u.slot].total;
                return (
                  <article key={u.id} className={u.installed ? 'installed' : u.locked ? 'locked' : ''} data-testid={`upgrade-${u.id}`}>
                    <span className="slot-tag">{t(`slot.${u.slot}` as MessageKey)}</span>
                    <strong>{t(`upgrade.${u.id}` as MessageKey)}</strong>
                    <p>{t(`upgrade.${u.id}.desc` as MessageKey)}</p>
                    <ul>
                      {effectLines(u.id, t, locale).map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                    {u.locked && !u.installed && (
                      <em className="requires">
                        {t('station.requires')} {t(`faction.${u.locked.faction}` as MessageKey)} +{u.locked.reputation}
                      </em>
                    )}
                    {u.installed ? (
                      <button onClick={() => actions.sellUpgrade(u.id)} data-testid={`remove-${u.id}`}>
                        {t('station.remove')} · +{cr(Math.round(u.cost / 2))}
                      </button>
                    ) : (
                      <button disabled={!u.offered || !!u.locked || noSlot || view.credits < u.cost} onClick={() => actions.buyUpgrade(u.id)}>
                        {noSlot ? t('station.noSlot') : cr(u.cost)}
                      </button>
                    )}
                  </article>
                );
              })}
            </div>
          </div>
        )}

        <footer>
          <button className="primary" onClick={() => actions.undock()} data-testid="undock">
            {t('station.undock')} <kbd>F</kbd>
          </button>
        </footer>
      </section>
    </div>
  );
}
