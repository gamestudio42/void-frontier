import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { StationPanel } from './ui/StationPanel.tsx';
import { ContractTracker, Notices } from './ui/contracts.tsx';
import { Game } from './game.ts';
import { LOCALES, detectLocale, saveLocale, translator, type Locale, type MessageKey } from './i18n.ts';
import { HudStore, initialHudState } from './store.ts';
import { ControlsPanel } from './ui/ControlsPanel.tsx';
import { MainMenu, PauseMenu, TutorialCard } from './ui/menus.tsx';
import { SectorMap } from './ui/SectorMap.tsx';
import { loadSettings, saveSettings, type Settings } from './settings.ts';
import { DebugOverlay } from './ui/DebugOverlay.tsx';
import { FlightHud } from './ui/FlightHud.tsx';

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const radarRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const store = useMemo(() => new HudStore(initialHudState()), []);
  const hud = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [locale, setLocale] = useState<Locale>(() => settings.locale ?? detectLocale());
  const [game, setGame] = useState<Game | null>(null);
  const t = useMemo(() => translator(locale), [locale]);

  useEffect(() => {
    const game = new Game(canvasRef.current!, store);
    game.attachRadar(radarRef.current);
    game.attachOverlay(overlayRef.current);
    game.start();
    setGame(game);
    // Development handle for debugging in the console; not shipped in production builds.
    if (import.meta.env.DEV) (window as unknown as { voidFrontier?: Game }).voidFrontier = game;
    return () => {
      game.dispose();
      setGame(null);
    };
  }, [store]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    game?.applySettings(settings);
  }, [game, settings]);

  const changeSettings = (next: Settings) => {
    setSettings(next);
    saveSettings(next);
    if (next.locale && next.locale !== locale) chooseLocale(next.locale);
  };

  useEffect(() => {
    if (game)
      game.labels = {
        drop: (id) => t(`drop.${id}` as MessageKey),
        station: (id) => t(`station.${id}` as MessageKey),
        sector: (id) => t(`sector.${id}` as MessageKey),
      };
  }, [game, t]);

  function chooseLocale(next: Locale) {
    setLocale(next);
    saveLocale(next);
  }

  return (
    <div className="app">
      <canvas ref={canvasRef} className="viewport" data-testid="viewport" />
      <canvas ref={overlayRef} className="targeting" aria-hidden="true" />
      <div key={hud.hits} className={hud.hits > 0 ? 'damage-flash' : ''} aria-hidden="true" />
      {hud.menu !== 'main' && <FlightHud hud={hud} t={t} locale={locale} />}
      {hud.contracts && !hud.station && <ContractTracker active={hud.contracts.active} t={t} />}
      <Notices notices={hud.notices} t={t} locale={locale} />
      <div key={`jump-${hud.jumpedAt}`} className={hud.jumpedAt > 0 ? 'jump-flash' : ''} aria-hidden="true" />
      {hud.mapOpen && hud.menu === null && (
        <SectorMap current={hud.sectorId} visited={hud.visited} discovered={hud.discovered} contracts={hud.contracts} t={t} onClose={() => store.update({ mapOpen: false })} />
      )}
      <figure className="radar" aria-label={t('hud.radar')} hidden={hud.menu === 'main'}>
        <canvas ref={radarRef} data-testid="radar" />
      </figure>
      {hud.station && hud.telemetry && game && !hud.help && !hud.menu && (
        <StationPanel
          view={hud.station}
          contracts={hud.contracts}
          hull={{ value: hud.telemetry.hull, max: hud.telemetry.hullMax }}
          fuel={{ value: hud.telemetry.fuel, max: hud.telemetry.fuelCapacity }}
          hold={{ mass: hud.telemetry.holdMass, max: hud.telemetry.holdMaxMass }}
          actions={game}
          t={t}
          locale={locale}
        />
      )}
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
      {hud.tutorial && !hud.menu && game && <TutorialCard tutorial={hud.tutorial} t={t} onSkip={() => game.skipTutorial()} top={!!hud.station} />}
      {hud.menu === 'main' && game && !hud.help && (
        <MainMenu game={game} t={t} locale={locale} settings={settings} onSettings={changeSettings} onControls={() => store.update({ help: true })} />
      )}
      {hud.menu === 'pause' && game && !hud.help && (
        <PauseMenu
          game={game}
          t={t}
          locale={locale}
          settings={settings}
          onSettings={changeSettings}
          onControls={() => store.update({ help: true })}
          onResume={() => store.update({ menu: null })}
          onMainMenu={() => {
            void game.saveTo('auto').finally(() => store.update({ menu: 'main' }));
          }}
        />
      )}
    </div>
  );
}
