import type { Locale, MessageKey, Translate } from '../i18n.ts';
import { DEFAULT_BINDINGS, type BindingAction, type Bindings } from '../input.ts';

interface ControlsPanelProps {
  t: Translate;
  bindings?: Partial<Bindings>;
  locale: Locale;
  locales: Locale[];
  onLocale(locale: Locale): void;
  onClose(): void;
}

/** Rows of the help panel; a rebindable key is named by its action, so the panel shows the player's own keys. */
const ROWS: [(string | { action: BindingAction })[], MessageKey][] = [
  [[{ action: 'thrust' }, { action: 'reverse' }], 'help.thrust'],
  [[{ action: 'strafeLeft' }, { action: 'strafeRight' }], 'help.strafe'],
  [[{ action: 'turnLeft' }, { action: 'turnRight' }], 'help.turn'],
  [['Mouse'], 'help.mouse'],
  [['LMB', 'Ctrl'], 'help.fire'],
  [['RMB', 'Alt'], 'help.laser'],
  [['Tab'], 'help.target'],
  [['MMB', { action: 'mine' }], 'help.mine'],
  [[{ action: 'scan' }], 'help.scan'],
  [[{ action: 'jettison' }], 'help.jettison'],
  [[{ action: 'dock' }], 'help.dock'],
  [[{ action: 'map' }], 'help.map'],
  [[{ action: 'fleet' }], 'help.fleet'],
  [[{ action: 'aimSystem' }], 'help.aimSystem'],
  [[{ action: 'details' }], 'help.details'],
  [['Shift'], 'help.boost'],
  [[{ action: 'brake' }], 'help.brake'],
  [[{ action: 'mode' }], 'help.mode'],
  [['Wheel', '+', '−'], 'help.zoom'],
  [['G'], 'help.quality'],
  [['F3'], 'help.debug'],
  [['Esc'], 'help.pause'],
];

export function ControlsPanel({ t, bindings, locale, locales, onLocale, onClose }: ControlsPanelProps) {
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
          {ROWS.map(([keys, label]) => (
            <div key={label}>
              <dt>
                {keys.map((key) => {
                  const name = typeof key === 'string' ? key : (bindings?.[key.action] ?? DEFAULT_BINDINGS[key.action]).replace(/^Key/, '');
                  return <kbd key={name}>{name}</kbd>;
                })}
              </dt>
              <dd>{t(label)}</dd>
            </div>
          ))}
        </dl>
        <button type="button" className="primary" onClick={onClose} autoFocus data-testid="close-controls">
          {t('help.close')}
        </button>
      </section>
    </div>
  );
}
