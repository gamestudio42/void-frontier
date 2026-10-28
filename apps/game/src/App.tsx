import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Game } from './game.ts';
import { LOCALES, detectLocale, saveLocale, translator, type Locale } from './i18n.ts';
import { HudStore, initialHudState } from './store.ts';
import { ControlsPanel } from './ui/ControlsPanel.tsx';
import { DebugOverlay } from './ui/DebugOverlay.tsx';
import { FlightHud } from './ui/FlightHud.tsx';

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const radarRef = useRef<HTMLCanvasElement>(null);
  const store = useMemo(() => new HudStore(initialHudState()), []);
  const hud = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [locale, setLocale] = useState<Locale>(detectLocale);
  const t = useMemo(() => translator(locale), [locale]);

  useEffect(() => {
    const game = new Game(canvasRef.current!, store);
    game.attachRadar(radarRef.current);
    game.start();
    // Development handle for debugging in the console; not shipped in production builds.
    if (import.meta.env.DEV) (window as unknown as { voidFrontier?: Game }).voidFrontier = game;
    return () => game.dispose();
  }, [store]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const chooseLocale = (next: Locale) => {
    setLocale(next);
    saveLocale(next);
  };

  return (
    <div className="app">
      <canvas ref={canvasRef} className="viewport" data-testid="viewport" />
      <div key={hud.hits} className={hud.hits > 0 ? 'damage-flash' : ''} aria-hidden="true" />
      <FlightHud hud={hud} t={t} locale={locale} />
      <figure className="radar" aria-label={t('hud.radar')}>
        <canvas ref={radarRef} data-testid="radar" />
      </figure>
      {hud.telemetry?.destroyed && (
        <div className="destroyed" data-testid="destroyed">
          <h2>{t('destroyed.title')}</h2>
          <p>{t('destroyed.body')}</p>
          <strong>{t('destroyed.action')}</strong>
        </div>
      )}
      {hud.debug && <DebugOverlay hud={hud} t={t} />}
      {hud.help && (
        <ControlsPanel
          t={t}
          locale={locale}
          locales={LOCALES}
          onLocale={chooseLocale}
          onClose={() => store.update({ help: false })}
        />
      )}
      {hud.paused && !hud.help && (
        <div className="pause" data-testid="pause">
          <h2>{t('pause.title')}</h2>
          <p>{t('pause.resume')}</p>
        </div>
      )}
    </div>
  );
}
