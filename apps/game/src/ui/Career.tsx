import type { MessageKey, Translate } from "../i18n.ts";
import type { CareerView, StationView } from "../store.ts";
import { fill, formatNumber } from "./format.ts";

export interface CareerActions {
  buyLicence(id: string): void;
  invest(): void;
}

const rankName = (rank: number, t: Translate) =>
  t(`rank.${rank}` as MessageKey);

/** What a stake level gives, as short lines. */
function stakeLines(
  level: NonNullable<CareerView["stake"]["next"]>,
  t: Translate,
  locale: string,
): string[] {
  const lines = [
    fill(t("career.stake.discount"), {
      pct: formatNumber(locale, level.serviceDiscount * 100),
    }),
  ];
  if (level.offerSlots > 0)
    lines.push(fill(t("career.stake.offers"), { count: level.offerSlots }));
  if (level.eliteOffers) lines.push(t("career.stake.elite"));
  lines.push(
    fill(t("career.stake.dividend"), {
      credits: formatNumber(locale, level.dividendPerHour),
    }),
  );
  return lines;
}

/**
 * The goal ladder: the pilot's rank and what the next one brings, licences for sale,
 * and a stake in this station.
 */
export function CareerTab({
  view,
  actions,
  t,
  locale,
}: {
  view: StationView;
  actions: CareerActions;
  t: Translate;
  locale: string;
}) {
  const c = view.career;
  const cr = (n: number) => `${formatNumber(locale, n)} cr`;
  const progress =
    c.nextMerit === null
      ? 1
      : (c.merit - c.rankMerit) / (c.nextMerit - c.rankMerit);
  const stake = c.stake;
  return (
    <div className="career" data-testid="career">
      <section
        className="rank-card"
        data-testid="rank"
        data-rank={c.rank}
        data-merit={c.merit}
      >
        <span className="label">{t("career.rank")}</span>
        <h3>{rankName(c.rank, t)}</h3>
        <div className="merit-bar" aria-hidden="true">
          <span
            style={{ width: `${Math.round(Math.min(1, progress) * 100)}%` }}
          />
        </div>
        <p>
          {c.nextMerit === null
            ? fill(t("career.top"), { merit: formatNumber(locale, c.merit) })
            : fill(t("career.next"), {
                merit: formatNumber(locale, c.merit),
                need: formatNumber(locale, c.nextMerit),
                rank: rankName(c.rank + 1, t),
              })}
        </p>
        {(c.activeBonus > 0 || c.offerBonus > 0) && (
          <p className="note">
            {t("career.perks")}{" "}
            {[
              c.activeBonus > 0
                ? fill(t("career.perk.active"), { count: c.activeBonus })
                : null,
              c.offerBonus > 0
                ? fill(t("career.perk.offers"), { count: c.offerBonus })
                : null,
            ]
              .filter(Boolean)
              .join(", ")}
          </p>
        )}
        <p className="note">{t("career.how")}</p>
      </section>

      <h3>{t("career.licences")}</h3>
      <div className="licences">
        {c.licences.map((l) => {
          const locked = c.rank < l.rank;
          return (
            <article
              key={l.id}
              className={`licence${l.owned ? " owned" : ""}`}
              data-testid={`licence-${l.id}`}
              data-owned={l.owned}
            >
              <strong>{t(`licence.${l.id}` as MessageKey)}</strong>
              <ul>
                <li>
                  {fill(t("career.licence.bonus"), {
                    pct: formatNumber(locale, l.rewardBonus * 100),
                  })}{" "}
                  {l.kinds
                    .map((k) => t(`contract.kind.${k}` as MessageKey))
                    .join(", ")}
                </li>
                {l.killBounty > 0 && (
                  <li>
                    {fill(t("career.licence.bounty"), {
                      credits: formatNumber(locale, l.killBounty),
                    })}
                  </li>
                )}
              </ul>
              {l.owned ? (
                <span className="slot-tag">{t("career.owned")}</span>
              ) : (
                <button
                  disabled={locked || view.credits < l.price}
                  onClick={() => actions.buyLicence(l.id)}
                  data-testid={`buy-licence-${l.id}`}
                >
                  {locked
                    ? fill(t("career.needsRank"), { rank: rankName(l.rank, t) })
                    : `${t("career.buy")} · ${cr(l.price)}`}
                </button>
              )}
            </article>
          );
        })}
      </div>

      <h3>{t("career.stake")}</h3>
      <div className="stake" data-testid="stake" data-level={stake.level}>
        <p>
          {stake.level === 0
            ? t("career.stake.none")
            : fill(t("career.stake.level"), {
                level: stake.level,
                max: stake.max,
              })}
        </p>
        {stake.current && (
          <ul>
            {stakeLines({ cost: 0, rank: 0, ...stake.current }, t, locale).map(
              (line) => (
                <li key={line}>{line}</li>
              ),
            )}
          </ul>
        )}
        {stake.next ? (
          <div className="stake-next">
            <span className="label">
              {fill(t("career.stake.nextLevel"), { level: stake.level + 1 })}
            </span>
            <ul>
              {stakeLines(stake.next, t, locale).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <button
              disabled={
                c.rank < stake.next.rank || view.credits < stake.next.cost
              }
              onClick={() => actions.invest()}
              data-testid="invest"
            >
              {c.rank < stake.next.rank
                ? fill(t("career.needsRank"), {
                    rank: rankName(stake.next.rank, t),
                  })
                : `${t("career.invest")} · ${cr(stake.next.cost)}`}
            </button>
          </div>
        ) : (
          <p className="note">{t("career.stake.maxed")}</p>
        )}
        <p className="note">{t("career.stake.note")}</p>
      </div>
    </div>
  );
}
