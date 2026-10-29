import { getShip, getWeapon } from '@void-frontier/content';
import type { MessageKey, Translate } from '../i18n.ts';
import type { FleetView, StationView } from '../store.ts';
import { OrderPicker, Skills, orderLine, type FleetActions } from './Fleet.tsx';
import { formatNumber } from './format.ts';

export interface ShipyardActions {
  buyShip(id: string): void;
  sellShip(id: number): void;
  boardShip(id: number): void;
}

/** Headline numbers for comparing hulls at a glance. */
function stats(shipId: string, t: Translate, locale: string): [string, string][] {
  const def = getShip(shipId);
  const mass = def.hull.dryMass + def.fuel.capacity;
  const guns = def.hardpoints.filter((h) => getWeapon(h.weapon).kind !== 'mining').length;
  return [
    [t('hud.accel'), `${formatNumber(locale, def.movement.mainThrust / mass, 1)} ${t('unit.accel')}`],
    [t('hud.hull'), String(def.hull.integrity)],
    [t('hud.shield'), String(def.shield.capacity)],
    [t('hud.hold'), `${formatNumber(locale, def.cargo.maxMass / 1000, 1)} ${t('unit.mass')}`],
    [t('hud.weapons'), String(guns)],
    [t('shipyard.slots'), `${def.slots.engine}/${def.slots.utility}/${def.slots.defense}`],
  ];
}

export function ShipyardTab({ view, fleet, actions, t, locale }: { view: StationView; fleet: FleetView | null; actions: ShipyardActions & FleetActions; t: Translate; locale: string }) {
  const cr = (n: number) => `${formatNumber(locale, n)} cr`;
  const here = view.hangar.filter((h) => h.here && fleet?.ships.find((s) => s.id === h.id)?.here !== false);
  const elsewhere = view.hangar.filter((h) => !here.includes(h));
  const crewOf = (id: number) => fleet?.ships.find((s) => s.id === id);
  return (
    <div className="shipyard">
      <h3>{t('shipyard.hangar')}</h3>
      <div className="hulls">
        <article className="hull flying">
          <span className="slot-tag">{t('shipyard.flying')}</span>
          <strong>{t(`ship.${view.flying}` as MessageKey)}</strong>
          <dl>
            {stats(view.flying, t, locale).map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </article>
        {here.map((h) => (
          <article key={h.id} className="hull" data-testid={`hangar-${h.ship}`}>
            <strong>{t(`ship.${h.ship}` as MessageKey)}</strong>
            <p className="meta">
              {h.upgrades} {t('shipyard.modules')} · {h.cargo} {t('unit.units')} {t('station.held').toLowerCase()}
            </p>
            <dl>
              {stats(h.ship, t, locale).map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            {(() => {
              const crewed = crewOf(h.id);
              if (!crewed) return null;
              return (
                <div className="hull-crew">
                  {crewed.pilot ? (
                    <p className="meta">
                      {t('fleet.pilot')}: <b>{crewed.pilot.name}</b> <Skills pilot={crewed.pilot} t={t} />
                    </p>
                  ) : (
                    <p className="meta">{t('fleet.noPilot')}</p>
                  )}
                  <p className="meta">{orderLine(crewed.order, t)}</p>
                  <OrderPicker ship={crewed} actions={actions} t={t} />
                </div>
              );
            })()}
            <button onClick={() => actions.boardShip(h.id)} data-testid={`board-${h.ship}`}>
              {t('shipyard.board')}
            </button>
            <button className="ghost" onClick={() => actions.sellShip(h.id)}>
              {t('shipyard.sell')} · +{cr(h.value)}
            </button>
          </article>
        ))}
      </div>
      {elsewhere.length > 0 && (
        <p className="note">
          {t('shipyard.elsewhere')}: {elsewhere.map((h) => `${t(`ship.${h.ship}` as MessageKey)} (${t(`station.${h.station}` as MessageKey)})`).join(', ')}
        </p>
      )}

      <h3>{t('shipyard.forSale')}</h3>
      <div className="hulls">
        {view.shipyard.map((offer) => (
          <article key={offer.ship} className={`hull ${offer.locked ? 'locked' : ''}`} data-testid={`buy-${offer.ship}`}>
            <span className="slot-tag">{t(`class.${getShip(offer.ship).class}` as MessageKey)}</span>
            <strong>{t(`ship.${offer.ship}` as MessageKey)}</strong>
            <p>{t(`ship.${offer.ship}.desc` as MessageKey)}</p>
            <dl>
              {stats(offer.ship, t, locale).map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            {offer.locked && (
              <em className="requires">
                {t('station.requires')} {t(`faction.${offer.locked.faction}` as MessageKey)} +{offer.locked.reputation}
              </em>
            )}
            <button disabled={!!offer.locked || view.credits < offer.price} onClick={() => actions.buyShip(offer.ship)}>
              {cr(offer.price)}
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}
