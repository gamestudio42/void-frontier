import type { MessageKey, Translate } from '../i18n.ts';
import type { ActiveContractView, ContractView, ContractsView } from '../store.ts';
import { formatNumber } from './format.ts';

export interface ContractActions {
  acceptContract(id: number): void;
  handInContract(id: number): void;
  abandonContract(id: number): void;
}

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

/** One sentence that says what to do, in the player's language. */
export function objective(c: ContractView, t: Translate): string {
  if (c.kind === 'delivery' && c.station)
    return t('contract.station.objective')
      .replace('{units}', String(c.units))
      .replace('{station}', t(`station.${c.station}` as MessageKey))
      .replace('{sector}', t(`sector.${c.sector}` as MessageKey));
  if (c.kind === 'delivery') return t('contract.delivery.objective').replace('{units}', String(c.units)).replace('{drop}', t(`drop.${c.drop}` as MessageKey));
  if (c.kind === 'mining') return t('contract.mining.objective').replace('{units}', String(c.units)).replace('{resource}', t(`resource.${c.resource}` as MessageKey));
  return t('contract.bounty.objective').replace('{count}', String(c.units));
}

export function ContractsTab({ view, actions, t, locale }: { view: ContractsView; actions: ContractActions; t: Translate; locale: string }) {
  const full = view.active.length >= view.maxActive;
  return (
    <div className="contracts">
      <h3>{t('contract.reputation')}</h3>
      {Object.entries(view.reputation).map(([faction, value]) => (
        <div key={faction} className="reputation">
          <span>{t(`faction.${faction}` as MessageKey)}</span>
          <div className="rep-track">
            <div className={`rep-fill ${value < 0 ? 'negative' : ''}`} style={{ left: value < 0 ? `${50 + value / 2}%` : '50%', width: `${Math.abs(value) / 2}%` }} />
          </div>
          <strong data-testid={`reputation-${faction}`} data-value={value}>
            {value > 0 ? '+' : ''}
            {Math.round(value * 10) / 10}
          </strong>
        </div>
      ))}

      {view.active.length > 0 && (
        <>
          <h3>
            {t('contract.active')} ({view.active.length}/{view.maxActive})
          </h3>
          {view.active.map((c) => (
            <article key={c.id} className={`contract active ${c.kind}`} data-testid={`active-${c.id}`}>
              <div>
                <span className="kind">{t(`contract.kind.${c.kind}` as MessageKey)}</span>
                <p>{objective(c, t)}</p>
                <span className="meta">
                  {c.current}/{c.target} · {clock(c.timeLeft)}
                </span>
              </div>
              <div className="contract-actions">
                <strong>{formatNumber(locale, c.reward)} cr</strong>
                {c.kind !== 'delivery' && (
                  <button disabled={!c.canHandIn} onClick={() => actions.handInContract(c.id)} data-testid={`handin-${c.id}`}>
                    {t('contract.handIn')}
                  </button>
                )}
                <button className="ghost" onClick={() => actions.abandonContract(c.id)}>
                  {t('contract.abandon')}
                </button>
              </div>
            </article>
          ))}
        </>
      )}

      <h3>{t('contract.board')}</h3>
      {view.offers.map((c) => (
        <article key={c.id} className={`contract ${c.kind} ${c.elite ? 'elite' : ''}`} data-testid={`offer-${c.kind}`}>
          <div>
            <span className="kind">
              {t(`contract.kind.${c.kind}` as MessageKey)}
              {c.elite && <em>{t('contract.elite')}</em>}
            </span>
            <p>{objective(c, t)}</p>
            <span className="meta">
              {t('contract.timeLimit')} {clock(c.seconds)}
            </span>
          </div>
          <div className="contract-actions">
            <strong>{formatNumber(locale, c.reward)} cr</strong>
            <button disabled={full} onClick={() => actions.acceptContract(c.id)} data-testid={`accept-${c.id}`}>
              {t('contract.accept')}
            </button>
          </div>
        </article>
      ))}

      {view.history.length > 0 && (
        <>
          <h3>{t('contract.history')}</h3>
          <ul className="history">
            {view.history.map((h) => (
              <li key={h.id} className={h.outcome}>
                {t(`contract.kind.${h.kind}` as MessageKey)} · {t(`contract.outcome.${h.outcome}` as MessageKey)}
                {h.reward > 0 && ` · +${formatNumber(locale, h.reward)} cr`}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** In-flight objectives, top left. */
export function ContractTracker({ active, t }: { active: ActiveContractView[]; t: Translate }) {
  if (active.length === 0) return null;
  return (
    <aside className="tracker" data-testid="tracker">
      {active.map((c) => (
        <div key={c.id} className={c.timeLeft < 60 ? 'urgent' : ''}>
          <span className="kind">{t(`contract.kind.${c.kind}` as MessageKey)}</span>
          <p>{objective(c, t)}</p>
          <span className="meta">
            {c.current}/{c.target} · {clock(c.timeLeft)}
            {c.kind !== 'delivery' && c.current >= c.target ? ` · ${t('contract.returnToStation')}` : ''}
          </span>
        </div>
      ))}
    </aside>
  );
}

export function Notices({ notices, t, locale }: { notices: { id: number; kind: string; outcome: string; reward: number }[]; t: Translate; locale: string }) {
  return (
    <div className="notices" aria-live="polite">
      {notices.map((n) => (
        <div key={`${n.id}-${n.outcome}`} className={`notice ${n.outcome}`} data-testid="notice">
          {n.kind === 'tutorial' ? (
            <strong>{t('tutorial.done')}</strong>
          ) : n.kind.startsWith('system:') ? (
            <strong>
              {t(`system.${n.kind.slice(7)}` as MessageKey)} {n.outcome === 'failed' ? t('system.offline') : t('system.damaged')}
            </strong>
          ) : n.kind.startsWith('poi:') ? (
            <>
              <strong>{t(`poi.${n.kind.slice(4)}` as MessageKey)}</strong>
              {n.reward > 0 && <span> +{formatNumber(locale, n.reward)} cr</span>}
            </>
          ) : (
            <>
              <strong>{t(`contract.outcome.${n.outcome}` as MessageKey)}</strong> · {t(`contract.kind.${n.kind}` as MessageKey)}
              {n.reward > 0 && <span> +{formatNumber(locale, n.reward)} cr</span>}
            </>
          )}
        </div>
      ))}
    </div>
  );
}
