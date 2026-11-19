import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { StationPanel } from './ui/StationPanel.tsx';
import { CampaignCard, ContractTracker, Notices } from './ui/contracts.tsx';
import { Game } from './game.ts';
import { LOCALES, detectLocale, saveLocale, translator, type Locale, type MessageKey, type Translate } from './i18n.ts';
import { HudStore, initialHudState } from './store.ts';
import { ControlsPanel } from './ui/ControlsPanel.tsx';
import { MainMenu, PauseMenu, TutorialCard } from './ui/menus.tsx';
import { SectorMap } from './ui/SectorMap.tsx';
import { FleetPanel } from './ui/Fleet.tsx';
import { loadSettings, saveSettings, type Settings } from './settings.ts';
import { DebugOverlay } from './ui/DebugOverlay.tsx';
import { FlightHud } from './ui/FlightHud.tsx';
import { formatNumber } from './ui/format.ts';

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const radarRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const store = useMemo(() => new HudStore(initialHudState()), []);
  const hud = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [locale, setLocale] = useState<Locale>(() => settings.locale ?? detectLocale());
  const [game, setGame] = useState<Game | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const t = useMemo(() => translator(locale, hud.device), [locale, hud.device]);

  useEffect(() => {
    let game: Game;
    try {
      game = new Game(canvasRef.current!, store);
    } catch (error) {
      // Without WebGL there is nothing to draw: say so instead of leaving a black screen.
      setBootError(error instanceof Error ? error.message : String(error));
      return;
    }
    game.attachRadar(radarRef.current);
    game.attachOverlay(overlayRef.current);
    game.start();
    setGame(game);
    // Development handle for debugging in the console; not shipped in production builds.
    if (import.meta.env.DEV) (window as unknown as { voidFrontier?: Game }).voidFrontier = game;
    // The desktop snap loads ?smoke=1 and waits for this. It carries no game state.
    // Named apart from the preload bridge (`voidFrontierDesktop`), which owns `quit`.
    if (new URLSearchParams(window.location.search).get('smoke') === '1') {
      (window as unknown as { voidFrontierBoot?: { ready: boolean } }).voidFrontierBoot = { ready: true };
    }
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
        boss: (id) => t(`boss.${id}` as MessageKey),
        drop: (id) => t(`drop.${id}` as MessageKey),
        station: (id) => t(`station.${id}` as MessageKey),
        sector: (id) => t(`sector.${id}` as MessageKey),
        route: (id) => t(`route.${id}` as MessageKey),
        campaign: () => t('campaign.marker'),
        stop: () => t('hud.stop'),
      };
  }, [game, t]);

  function chooseLocale(next: Locale) {
    setLocale(next);
    saveLocale(next);
  }

  if (bootError)
    return (
      <div className="app">
        <div className="boot-error" role="alert" data-testid="boot-error">
          <h1>{t('boot.webgl.title')}</h1>
          <p>{t('boot.webgl.body')}</p>
          <p className="meta">{t('boot.webgl.hint')}</p>
          <code>{bootError}</code>
        </div>
      </div>
    );

  return (
    <div
      className={hud.photo ? 'app photo' : 'app'}
      data-color-vision={settings.colorVision}
      style={{ '--ui-scale': settings.textScale, filter: settings.colorVision === 'normal' ? undefined : `url(#cvd-${settings.colorVision})` } as CSSProperties}
    >
      <ColorVisionFilters />
      <canvas ref={canvasRef} className="viewport" data-testid="viewport" />
      {hud.photo && <PhotoHint hint={hud.photo.hint} t={t} />}
      <canvas ref={overlayRef} className="targeting" aria-hidden="true" />
      <div key={hud.hits} className={hud.hits > 0 && !settings.reduceFlashes ? 'damage-flash' : ''} aria-hidden="true" />
      {hud.menu !== 'main' && <FlightHud hud={hud} t={t} locale={locale} />}
      <div className="left-stack">
        {hud.campaign && !hud.station && !hud.menu && !hud.tutorial && <CampaignCard key={hud.campaign.step} campaign={hud.campaign} onChoose={(option) => game?.chooseCampaign(option)} t={t} locale={locale} />}
        {hud.contracts && !hud.station && <ContractTracker active={hud.contracts.active} t={t} />}
      </div>
      <Notices notices={hud.notices} t={t} locale={locale} />
      <div key={`jump-${hud.jumpedAt}`} className={hud.jumpedAt > 0 && !settings.reduceFlashes ? 'jump-flash' : ''} aria-hidden="true" />
      {hud.mapOpen && hud.menu === null && (
        <SectorMap events={hud.events} fleet={hud.fleet} missionSector={hud.campaignSector} current={hud.sectorId} visited={hud.visited} discovered={hud.discovered} contracts={hud.contracts} t={t} onClose={() => store.update({ mapOpen: false })} />
      )}
      {hud.fleetOpen && hud.fleet && hud.menu === null && game && (
        <FleetPanel fleet={hud.fleet} actions={game} t={t} locale={locale} onClose={() => store.update({ fleetOpen: false })} />
      )}
      {hud.campaignEnding && !hud.menu && (
        <div className="map-backdrop" data-testid="campaign-ending">
          <section className="map campaign-ending">
            <span className="label">{t('campaign.title')}</span>
            <h2>{t(`campaign.ending.${hud.campaignEnding.branch ?? 'justice'}.title` as MessageKey)}</h2>
            <p>{t(`campaign.ending.${hud.campaignEnding.branch ?? 'justice'}.body` as MessageKey)}</p>
            <p className="meta">
              {hud.campaignEnding.minutes} min · {t('campaign.ending.deaths')}: {hud.campaignEnding.deaths}
            </p>
            <button className="primary" onClick={() => store.update({ campaignEnding: null })}>
              {t('campaign.ending.close')}
            </button>
          </section>
        </div>
      )}
      <figure className="radar" aria-label={t('hud.radar')} hidden={hud.menu === 'main'}>
        <canvas ref={radarRef} data-testid="radar" />
      </figure>
      {hud.station && hud.telemetry && game && !hud.help && !hud.menu && (
        <StationPanel
          view={hud.station}
          contracts={hud.contracts}
          fleet={hud.fleet}
          news={hud.news}
          events={hud.events}
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
          <p data-testid="death-cause" data-kind={hud.deathCause?.kind ?? 'other'}>
            {t(`destroyed.cause.${hud.deathCause?.kind ?? 'other'}` as MessageKey)
              .replace('{ship}', hud.deathCause?.ship ? t(`ship.${hud.deathCause.ship}` as MessageKey) : '')
              .replace('{speed}', formatNumber(locale, hud.deathCause?.speed ?? 0, 0))}
          </p>
          <strong>{t('destroyed.action')}</strong>
        </div>
      )}
      {hud.debug && <DebugOverlay hud={hud} t={t} />}
      {hud.help && (
        <ControlsPanel
          t={t}
          bindings={settings.bindings}
          locale={locale}
          locales={LOCALES}
          onLocale={chooseLocale}
          onClose={() => store.update({ help: false })}
        />
      )}
      {hud.launching && !hud.menu && <div className="letterbox" data-testid="launch" aria-hidden="true" />}
      {hud.tip && !hud.menu && !hud.help && !hud.station && (
        <aside className={`tip ${hud.tip === 'tip.brake' ? 'urgent' : ''}`} key={hud.tip} role="status" data-testid="tip" data-tip={hud.tip}>
          <span>{t('tip.label')}</span>
          {t(hud.tip as MessageKey)}
        </aside>
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

/**
 * Daltonisation for the three kinds of colour blindness: the colours a player cannot tell
 * apart are shifted into ones they can (simulation by Machado et al. 2009, error moved into
 * the channels still seen). Applied as a CSS filter on the whole app, 3D view and HUD alike.
 */
function ColorVisionFilters() {
  const matrices = {
    protanopia: '1 0 0 0 0  0.4789 0.4769 0.0442 0 0  0.5973 -0.6887 1.0914 0 0  0 0 0 1 0',
    deuteranopia: '1 0 0 0 0  0.1628 0.725 0.1122 0 0  0.4547 -0.6454 1.1907 0 0  0 0 0 1 0',
    tritanopia: '0.7412 -0.4072 0.666 0 0  0.0751 0.5852 0.3397 0 0  0 0 1 0 0  0 0 0 1 0',
  };
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        {Object.entries(matrices).map(([id, values]) => (
          <filter key={id} id={`cvd-${id}`} colorInterpolationFilters="sRGB">
            <feColorMatrix type="matrix" values={values} />
          </filter>
        ))}
      </defs>
    </svg>
  );
}

/** Photo mode's controls, in a corner; H hides them for a clean shot. */
function PhotoHint({ hint, t }: { hint: boolean; t: Translate }) {
  return (
    <aside className={hint ? 'photo-hint' : 'photo-hint hidden'} data-testid="photo-mode">
      {hint && (
        <>
          <strong>{t('photo.title')}</strong>
          <span>{t('photo.move')}</span>
          <span>{t('photo.turn')}</span>
          <span>{t('photo.zoom')}</span>
          <span>{t('photo.save')}</span>
          <span>{t('photo.exit')}</span>
        </>
      )}
    </aside>
  );
}
