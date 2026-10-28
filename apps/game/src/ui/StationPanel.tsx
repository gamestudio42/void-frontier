import { getUpgrade } from '@void-frontier/content';
import { useState } from 'react';
import type { MessageKey, Translate } from '../i18n.ts';
import type { ContractsView, StationView } from '../store.ts';
import { ContractsTab, type ContractActions } from './contracts.tsx';
import { formatNumber } from './format.ts';

export interface StationActions extends ContractActions {
  undock(): void;
  trade(resource: string, units: number, side: 'buy' | 'sell'): void;
  service(kind: 'repair' | 'refuel'): void;
  buyUpgrade(id: string): void;
}

interface StationPanelProps {
  view: StationView;
  contracts: ContractsView | null;
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
  lines.push(`${t('hud.mass')} +${formatNumber(locale, getUpgrade(id).equipmentMass / 1000, 2)} ${t('unit.mass')}`);
  return lines;
}

export function StationPanel({ view, contracts, hull, fuel, hold, actions, t, locale }: StationPanelProps) {
  const [tab, setTab] = useState<Tab>('contracts');
  const cr = (n: number) => `${formatNumber(locale, n)} cr`;
  return (
    <div className="station-backdrop">
      <section className="station" role="dialog" aria-label={t(`station.${view.name}` as MessageKey)} data-testid="station">
        <header>
          <div>
            <span className="label">{t('station.docked')}</span>
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
          <div className="upgrades">
            {view.upgrades.map((u) => (
              <article key={u.id} className={u.installed ? 'installed' : ''} data-testid={`upgrade-${u.id}`}>
                <strong>{t(`upgrade.${u.id}` as MessageKey)}</strong>
                <p>{t(`upgrade.${u.id}.desc` as MessageKey)}</p>
                <ul>
                  {effectLines(u.id, t, locale).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                <button disabled={u.installed || view.credits < u.cost} onClick={() => actions.buyUpgrade(u.id)}>
                  {u.installed ? t('station.installed') : cr(u.cost)}
                </button>
              </article>
            ))}
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
