import { EVENT_RULES, FACTIONS, SECTORS, STATIONS } from '@void-frontier/content';
import type { MessageKey, Translate } from '../i18n.ts';
import type { ContractsView, FleetView } from '../store.ts';

interface SectorMapProps {
  events: { id: string; secondsLeft: number }[];
  current: string;
  visited: string[];
  discovered: string[];
  contracts: ContractsView | null;
  fleet: FleetView | null;
  missionSector: string | null;
  t: Translate;
  onClose(): void;
}

/** Pirate presence from the sector's encounters: a quick read of how dangerous it is. */
function danger(sectorId: string): 'low' | 'medium' | 'high' {
  const sector = SECTORS.get(sectorId)!;
  const ships = sector.encounters.reduce((sum, e) => sum + e.count * (e.ship === 'marauder' ? 3 : 1), 0);
  return ships >= 6 ? 'high' : ships >= 3 ? 'medium' : 'low';
}

/** The gate network: sectors as nodes on their map positions, gates as links. */
export function SectorMap({ events, fleet, missionSector, current, visited, discovered, contracts, t, onClose }: SectorMapProps) {
  const sectors = [...SECTORS.values()];
  const scale = 230;
  const cx = 360;
  const cy = 70;
  const at = (id: string) => {
    const p = SECTORS.get(id)!.mapPosition;
    return { x: cx + p.x * scale, y: cy + p.y * scale };
  };
  const links = new Set<string>();
  for (const s of sectors) for (const g of s.gates) links.add([s.id, g.to].sort().join('|'));
  const targets = new Set((contracts?.active ?? []).filter((c) => c.sector).map((c) => c.sector!));
  if (missionSector) targets.add(missionSector);

  return (
    <div className="map-backdrop" onClick={onClose} data-testid="map">
      <section className="map" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>{t('map.title')}</h2>
          <span className="label">{t('map.hint')}</span>
        </header>
        <svg viewBox="0 0 720 490" role="img" aria-label={t('map.title')}>
          {[...links].map((link) => {
            const [a, b] = link.split('|');
            const pa = at(a);
            const pb = at(b);
            return <line key={link} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} className="map-link" />;
          })}
          {sectors.map((s) => {
            const p = at(s.id);
            const here = s.id === current;
            const seen = visited.includes(s.id);
            const found = s.pointsOfInterest.filter((poi) => discovered.includes(poi.id)).length;
            const level = danger(s.id);
            const stations = s.stations.map((st) => STATIONS.get(st.definition)!);
            return (
              <g key={s.id} transform={`translate(${p.x} ${p.y})`} className={`map-node ${here ? 'here' : ''} ${seen ? '' : 'unseen'} danger-${level}`}>
                <circle r={here ? 34 : 28} style={s.controllingFaction ? { stroke: FACTIONS.get(s.controllingFaction)!.color } : undefined} />
                {targets.has(s.id) && <circle r={42} className="map-target" />}
                {events.some((e) => EVENT_RULES.events.find((d) => d.id === e.id)?.sector === s.id) && (
                  <text y={-38} className="map-alert">
                    ⚠
                  </text>
                )}
                {stations.map((st, i) => (
                  <rect key={i} x={-26 + i * 14} y={-6} width={10} height={10} className={FACTIONS.get(st.faction)!.hostile ? 'map-station pirate' : 'map-station'} />
                ))}
                {(() => {
                  const mine = (fleet?.ships ?? []).filter((f) => f.sector === s.id).length;
                  return mine > 0 ? (
                    <text x={30} y={-26} className="map-fleet" data-testid={`map-fleet-${s.id}`}>
                      ▲{mine}
                    </text>
                  ) : null;
                })()}
                <text y={52} className="map-name">
                  {t(`sector.${s.id}` as MessageKey)}
                </text>
                <text y={68} className="map-meta">
                  {here ? t('map.here') : seen ? `${t('map.danger')}: ${t(`map.danger.${level}` as MessageKey)}` : t('map.unvisited')}
                </text>
                {/* A sector with its own rule names it here: the full sentence appears on arrival. */}
                <text y={98} className={s.rules ? 'map-meta map-rule' : 'map-meta'}>
                  {s.rules ? t(`sector.ruleShort.${s.id}` as MessageKey) : s.controllingFaction ? t(`faction.${s.controllingFaction}` as MessageKey) : '—'}
                </text>
                <text y={83} className="map-meta">
                  {t('map.discoveries')}: {found}/{s.pointsOfInterest.length}
                </text>
              </g>
            );
          })}
        </svg>
        {events.length > 0 && (
          <ul className="map-events">
            {events.map((e) => (
              <li key={e.id}>{t(`event.${e.id}` as MessageKey)}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
