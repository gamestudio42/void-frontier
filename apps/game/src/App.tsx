import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Game } from './game.ts';
import { LOCALES, detectLocale, saveLocale, translator, type Locale } from './i18n.ts';
import { HudStore, initialHudState } from './store.ts';
import { ControlsPanel } from './ui/ControlsPanel.tsx';
import { DebugOverlay } from './ui/DebugOverlay.tsx';
import { FlightHud } from './ui/FlightHud.tsx';

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const store = useMemo(() => new HudStore(initialHudState()), []);
  const hud = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [locale, setLocale] = useState<Locale>(detectLocale);
  const t = useMemo(() => translator(locale), [locale]);

  useEffect(() => {
    const game = new Game(canvasRef.current!, store);
    game.start();
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
      <FlightHud hud={hud} t={t} locale={locale} />
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
