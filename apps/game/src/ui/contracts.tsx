import { useState } from 'react';
import type { MessageKey, Translate } from '../i18n.ts';
import type { ActiveContractView, CampaignView, ContractView, ContractsView } from '../store.ts';
import { formatNumber } from './format.ts';
import { fleetNotice } from './Fleet.tsx';

export interface ContractActions {
  acceptContract(id: number): void;
  handInContract(id: number): void;
  abandonContract(id: number): void;
}

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

/** One sentence that says what to do, in the player's language. */
export function objective(c: ContractView, t: Translate): string {
  if (c.kind === 'escort')
    return t('contract.escort.objective')
      .replace('{route}', t(`route.${c.route}` as MessageKey))
      .replace('{station}', t(`station.${c.station}` as MessageKey));
  if (c.kind === 'delivery' && c.station)
    return t('contract.station.objective')
      .replace('{units}', String(c.units))
      .replace('{station}', t(`station.${c.station}` as MessageKey))
      .replace('{sector}', t(`sector.${c.sector}` as MessageKey));
  if (c.kind === 'delivery') return t('contract.delivery.objective').replace('{units}', String(c.units)).replace('{drop}', t(`drop.${c.drop}` as MessageKey));
  if (c.kind === 'patrol') return t('contract.patrol.objective').replace('{count}', String(c.units)).replace('{drop}', t(`drop.${c.drop}` as MessageKey));
  if (c.kind === 'recon') return t('contract.recon.objective').replace('{drop}', t(`drop.${c.drop}` as MessageKey));
  if (c.kind === 'mining' || c.kind === 'salvage') return t('contract.mining.objective').replace('{units}', String(c.units)).replace('{resource}', t(`resource.${c.resource}` as MessageKey));
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
                {c.kind !== 'delivery' && c.kind !== 'patrol' && c.kind !== 'recon' && (
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

/** The current story step: the briefing until dismissed, then just the objective. */
export function CampaignCard({ campaign, onChoose, t, locale }: { campaign: CampaignView; onChoose(option: string): void; t: Translate; locale: string }) {
  const [open, setOpen] = useState(true);
  return (
    <aside className="campaign" data-testid="campaign">
      <span className="kind">
        {t('campaign.title')} · {campaign.index + 1}/{campaign.total}
      </span>
      <strong>{t(`campaign.${campaign.step}.title` as MessageKey)}</strong>
      {open && <p>{t(`campaign.${campaign.step}.brief` as MessageKey)}</p>}
      <span className="meta">
        {t(`campaign.${campaign.step}.objective` as MessageKey)}
        {campaign.progress && ` · ${campaign.progress.current}/${campaign.progress.target}`}
      </span>
      {campaign.options?.map((o) => (
        <button key={o.id} onClick={() => onChoose(o.id)} data-testid={`choice-${o.id}`}>
          {t(`campaign.${campaign.step}.${o.id}` as MessageKey)}
          {o.credits > 0 && ` · +${formatNumber(locale, o.credits)} cr`}
        </button>
      ))}
      <button className="ghost" onClick={() => setOpen(!open)} data-testid="campaign-toggle">
        {open ? t('campaign.hide') : t('campaign.show')}
      </button>
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
          ) : n.kind.startsWith('rule:') ? (
            <strong>{t(`sector.rule.${n.kind.slice(5)}` as MessageKey)}</strong>
          ) : n.kind.startsWith('campaign:') ? (
            <>
              <strong>{t('campaign.done')}: {t(`campaign.${n.kind.slice(9)}.title` as MessageKey)}</strong>
              {n.reward > 0 && <span> +{formatNumber(locale, n.reward)} cr</span>}
            </>
          ) : n.kind.startsWith('fleet:') ? (
            <strong>{fleetNotice(n.kind.split(':')[1], n.kind.split(':')[2], n.kind.split(':')[3], t)}</strong>
          ) : n.kind.startsWith('news:') ? (
            <strong>{newsLine(n.kind.split(':')[1], n.kind.split(':')[2], t)}</strong>
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

/** One line of station news. Event and route names come from the string tables. */
export function newsLine(kind: string, subject: string, t: Translate): string {
  if (kind === 'eventStarted') return t(`event.${subject}` as MessageKey);
  if (kind === 'eventEnded') return `${t('news.ended')}: ${t(`event.${subject}` as MessageKey)}`;
  return `${t(`route.${subject}` as MessageKey)} ${t(`news.${kind}` as MessageKey)}`;
}

export function NewsFeed({ news, events, t }: { news: { tick: number; kind: string; subject: string }[]; events: { id: string; secondsLeft: number }[]; t: Translate }) {
  if (news.length === 0 && events.length === 0) return null;
  return (
    <div className="news" data-testid="news">
      <h3>{t('news.title')}</h3>
      {events.map((e) => (
        <div key={e.id} className="news-event">
          <strong>{t(`event.${e.id}` as MessageKey)}</strong>
          <span>
            {Math.floor(e.secondsLeft / 60)}:{String(Math.floor(e.secondsLeft % 60)).padStart(2, '0')}
          </span>
        </div>
      ))}
      <ul>
        {news
          .filter((n) => n.kind !== 'eventStarted')
          .slice(0, 5)
          .map((n) => (
            <li key={`${n.tick}-${n.kind}-${n.subject}`} className={n.kind}>
              {newsLine(n.kind, n.subject, t)}
            </li>
          ))}
      </ul>
    </div>
  );
}
