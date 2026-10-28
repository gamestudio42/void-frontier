import { useEffect, useRef, useState } from 'react';
import type { Game } from '../game.ts';
import { LOCALES, type Locale, type MessageKey, type Translate } from '../i18n.ts';
import { SLOTS, downloadSave, saveStore, type SlotId, type SlotRecord } from '../saves.ts';
import type { Settings } from '../settings.ts';

type View = 'root' | 'load' | 'save' | 'settings';

interface MenuProps {
  game: Game;
  t: Translate;
  locale: Locale;
  settings: Settings;
  onSettings(settings: Settings): void;
  onControls(): void;
}

const duration = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
};

function SaveSlots({ game, t, locale, mode, onDone }: { game: Game; t: Translate; locale: Locale; mode: 'load' | 'save'; onDone(): void }) {
  const [records, setRecords] = useState<SlotRecord[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const refresh = () => void saveStore.list().then(setRecords);
  useEffect(refresh, []);

  const load = (file: unknown) => {
    try {
      game.audio.click();
      game.load(file);
      onDone();
    } catch (error) {
      setMessage(`${t('saves.error')}: ${(error as Error).message}`);
    }
  };

  return (
    <div className="slots">
      {SLOTS.filter((slot) => mode === 'load' || slot !== 'auto').map((slot) => {
        const record = records.find((r) => r.slot === slot);
        return (
          <div key={slot} className="slot" data-testid={`slot-${slot}`}>
            <div>
              <strong>{slot === 'auto' ? t('saves.auto') : `${t('saves.slot')} ${slot.slice(-1)}`}</strong>
              <span>
                {record
                  ? `${new Date(record.savedAt).toLocaleString(locale)} · ${record.credits.toLocaleString(locale)} cr · ${duration(record.playtime)} ${t('saves.playtime')}`
                  : t('saves.empty')}
              </span>
            </div>
            <div className="slot-actions">
              {mode === 'save' && (
                <button
                  onClick={() =>
                    void game.saveTo(slot as SlotId).then(() => {
                      setMessage(t('saves.saved'));
                      refresh();
                    })
                  }
                  data-testid={`save-${slot}`}
                >
                  {t('saves.saveHere')}
                </button>
              )}
              {mode === 'load' && record && (
                <button onClick={() => load(record.file)} data-testid={`load-${slot}`}>
                  {t('saves.load')}
                </button>
              )}
              {record && <button onClick={() => downloadSave(record.file, `void-frontier-${slot}.json`)}>{t('saves.export')}</button>}
            </div>
          </div>
        );
      })}
      {mode === 'load' && (
        <label className="import">
          {t('saves.import')}
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              void file.text().then((text) => {
                try {
                  load(JSON.parse(text));
                } catch (error) {
                  setMessage(`${t('saves.error')}: ${(error as Error).message}`);
                }
              });
            }}
          />
        </label>
      )}
      {message && <p className="menu-message">{message}</p>}
    </div>
  );
}

export function SettingsPanel({ settings, onSettings, t }: { settings: Settings; onSettings(s: Settings): void; t: Translate }) {
  const set = (patch: Partial<Settings>) => onSettings({ ...settings, ...patch });
  const slider = (key: 'masterVolume' | 'effectsVolume' | 'musicVolume', label: MessageKey) => (
    <label className="setting">
      <span>{t(label)}</span>
      <input type="range" min={0} max={1} step={0.05} value={settings[key]} onChange={(e) => set({ [key]: Number(e.target.value) })} />
    </label>
  );
  return (
    <div className="settings">
      <label className="setting">
        <span>{t('settings.graphics')}</span>
        <select value={settings.quality} onChange={(e) => set({ quality: e.target.value as Settings['quality'] })}>
          {(['auto', 'high', 'medium', 'low'] as const).map((q) => (
            <option key={q} value={q}>
              {t(`settings.quality.${q}` as MessageKey)}
            </option>
          ))}
        </select>
      </label>
      {slider('masterVolume', 'settings.master')}
      {slider('effectsVolume', 'settings.effects')}
      {slider('musicVolume', 'settings.music')}
      <label className="setting check">
        <span>{t('settings.shake')}</span>
        <input type="checkbox" checked={settings.cameraShake} onChange={(e) => set({ cameraShake: e.target.checked })} />
      </label>
      <label className="setting check">
        <span>{t('settings.steering')}</span>
        <input type="checkbox" checked={settings.mouseSteering} onChange={(e) => set({ mouseSteering: e.target.checked })} />
      </label>
      <label className="setting">
        <span>{t('settings.language')}</span>
        <select value={settings.locale ?? ''} onChange={(e) => set({ locale: (e.target.value || null) as Locale | null })}>
          {LOCALES.map((l) => (
            <option key={l} value={l}>
              {l === 'en' ? 'English' : 'Português (Brasil)'}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

export function MainMenu({ game, t, locale, settings, onSettings, onControls }: MenuProps) {
  const [view, setView] = useState<View>('root');
  const [latest, setLatest] = useState<SlotRecord | null>(null);
  const [tutorial, setTutorial] = useState(true);
  useEffect(() => {
    void saveStore.list().then((records) => setLatest(records.sort((a, b) => b.savedAt - a.savedAt)[0] ?? null));
  }, []);
  const press = (action: () => void) => () => {
    game.audio.unlock();
    game.audio.click();
    action();
  };

  return (
    <div className="menu-backdrop main-menu" data-testid="main-menu">
      <section className="menu">
        <h1>Void Frontier</h1>
        <p className="tagline">{t('menu.tagline')}</p>
        {view === 'root' && (
          <nav className="menu-buttons">
            {latest && (
              <button className="primary" onClick={press(() => game.load(latest.file))} data-testid="continue">
                {t('menu.continue')}
              </button>
            )}
            <button className={latest ? '' : 'primary'} onClick={press(() => game.newGame(tutorial))} data-testid="start">
              {t('menu.newGame')}
            </button>
            <label className="toggle">
              <input type="checkbox" checked={tutorial} onChange={(e) => setTutorial(e.target.checked)} data-testid="tutorial-toggle" />
              {t('menu.tutorial')}
            </label>
            <button onClick={press(() => setView('load'))}>{t('menu.load')}</button>
            <button onClick={press(() => setView('settings'))}>{t('menu.settings')}</button>
            <button onClick={press(onControls)}>{t('menu.controls')}</button>
          </nav>
        )}
        {view === 'load' && <SaveSlots game={game} t={t} locale={locale} mode="load" onDone={() => setView('root')} />}
        {view === 'settings' && <SettingsPanel settings={settings} onSettings={onSettings} t={t} />}
        {view !== 'root' && (
          <button className="back" onClick={press(() => setView('root'))}>
            {t('menu.back')}
          </button>
        )}
        <footer>{t('menu.credits')}</footer>
      </section>
    </div>
  );
}

export function PauseMenu({ game, t, locale, settings, onSettings, onControls, onResume, onMainMenu }: MenuProps & { onResume(): void; onMainMenu(): void }) {
  const [view, setView] = useState<View>('root');
  const press = (action: () => void) => () => {
    game.audio.click();
    action();
  };
  return (
    <div className="menu-backdrop" data-testid="pause">
      <section className="menu">
        <h2>{t('menu.paused')}</h2>
        {view === 'root' && (
          <nav className="menu-buttons">
            <button className="primary" onClick={press(onResume)} data-testid="resume">
              {t('menu.resume')}
            </button>
            <button onClick={press(() => setView('save'))} data-testid="open-save">
              {t('menu.save')}
            </button>
            <button onClick={press(() => setView('load'))}>{t('menu.load')}</button>
            <button onClick={press(() => setView('settings'))}>{t('menu.settings')}</button>
            <button onClick={press(onControls)}>{t('menu.controls')}</button>
            <button onClick={press(onMainMenu)}>{t('menu.mainMenu')}</button>
          </nav>
        )}
        {(view === 'save' || view === 'load') && <SaveSlots game={game} t={t} locale={locale} mode={view} onDone={onResume} />}
        {view === 'settings' && <SettingsPanel settings={settings} onSettings={onSettings} t={t} />}
        {view !== 'root' && (
          <button className="back" onClick={press(() => setView('root'))}>
            {t('menu.back')}
          </button>
        )}
      </section>
    </div>
  );
}

export function TutorialCard({ tutorial, t, onSkip, top }: { tutorial: { index: number; total: number; title: string; hint: string }; t: Translate; onSkip(): void; top: boolean }) {
  return (
    <aside className={`tutorial ${top ? 'top' : ''}`} data-testid="tutorial">
      <div className="tutorial-head">
        <span className="label">
          {t('tutorial.label')} · {tutorial.index + 1}/{tutorial.total}
        </span>
        <button onClick={onSkip}>{t('tutorial.skip')}</button>
      </div>
      <strong>{t(tutorial.title as MessageKey)}</strong>
      <p>{t(tutorial.hint as MessageKey)}</p>
      <div className="tutorial-progress">
        <div style={{ width: `${(tutorial.index / tutorial.total) * 100}%` }} />
      </div>
    </aside>
  );
}
