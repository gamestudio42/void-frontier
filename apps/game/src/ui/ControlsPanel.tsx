import type { Locale, MessageKey, Translate } from '../i18n.ts';

interface ControlsPanelProps {
  t: Translate;
  locale: Locale;
  locales: Locale[];
  onLocale(locale: Locale): void;
  onClose(): void;
}

const BINDINGS: [string[], MessageKey][] = [
  [['W', 'S'], 'help.thrust'],
  [['A', 'D'], 'help.strafe'],
  [['Q', 'E'], 'help.turn'],
  [['Mouse'], 'help.mouse'],
  [['Shift'], 'help.boost'],
  [['Space'], 'help.brake'],
  [['C'], 'help.mode'],
  [['Wheel', '+', '−'], 'help.zoom'],
  [['L'], 'help.cargo'],
  [['F3'], 'help.debug'],
  [['Esc'], 'help.pause'],
];

export function ControlsPanel({ t, locale, locales, onLocale, onClose }: ControlsPanelProps) {
  return (
    <div className="modal-backdrop">
      <section className="modal" role="dialog" aria-labelledby="controls-title" data-testid="controls">
        <header>
          <div>
            <h1>{t('app.title')}</h1>
            <p className="subtitle">{t('app.subtitle')}</p>
          </div>
          <div className="locale" role="group" aria-label={t('help.language')}>
            {locales.map((option) => (
              <button key={option} type="button" className={option === locale ? 'active' : ''} onClick={() => onLocale(option)}>
                {option === 'en' ? 'EN' : 'PT'}
              </button>
            ))}
          </div>
        </header>
        <p className="intro">{t('help.intro')}</p>
        <h2 id="controls-title">{t('help.title')}</h2>
        <dl className="bindings">
          {BINDINGS.map(([keys, label]) => (
            <div key={label}>
              <dt>{keys.map((key) => <kbd key={key}>{key}</kbd>)}</dt>
              <dd>{t(label)}</dd>
            </div>
          ))}
        </dl>
        <button type="button" className="primary" onClick={onClose} autoFocus data-testid="start">
          {t('help.close')}
        </button>
      </section>
    </div>
  );
}
