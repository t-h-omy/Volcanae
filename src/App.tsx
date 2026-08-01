import { useEffect, useCallback, useState, useRef } from 'react'
import { useGameStore } from './gameStore'
import { useMenuStore } from './menuStore'
import { useAnimationEngine } from './useAnimationEngine'
import { useMusicPlayer } from './useMusicPlayer'
import { preloadAssets } from './assetLoader'
import { GamePhase } from './types'
import { UI } from './uiConfig'
import GridRenderer from './components/GridRenderer'
import HUD from './components/HUD'
import FlyToHudLayer from './components/FlyToHudLayer'
import MainMenu from './components/MainMenu'
import './App.css'

function isAppInstalled(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as Navigator & { standalone?: boolean }).standalone === true
}

/**
 * Captures the `beforeinstallprompt` event for Add to Home Screen support.
 * Returns a trigger function and booleans indicating availability and install state.
 */
function useA2HS(): { canInstall: boolean; isInstalled: boolean; promptInstall: () => void } {
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);
  const [canInstall, setCanInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(() => isAppInstalled());

  useEffect(() => {
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const syncInstalledState = () => {
      const installed = isAppInstalled();
      setIsInstalled(installed);
      if (installed) {
        deferredPrompt.current = null;
        setCanInstall(false);
      }
    };
    const handler = (e: Event) => {
      e.preventDefault();
      deferredPrompt.current = e as BeforeInstallPromptEvent;
      setCanInstall(!isAppInstalled());
    };
    const handleInstalled = () => syncInstalledState();
    syncInstalledState();
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', handleInstalled);
    mediaQuery.addEventListener('change', syncInstalledState);
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', handleInstalled);
      mediaQuery.removeEventListener('change', syncInstalledState);
    };
  }, []);

  const promptInstall = useCallback(() => {
    if (!deferredPrompt.current || isInstalled) return;
    deferredPrompt.current?.prompt();
    deferredPrompt.current = null;
    setCanInstall(false);
  }, [isInstalled]);

  return { canInstall, isInstalled, promptInstall };
}

/** The in-game view: grid, HUD, music, animation engine, turn popup. */
function Game({ canInstall, promptInstall }: { canInstall: boolean; promptInstall: () => void }) {
  const phase = useGameStore((s) => s.phase);
  const turn = useGameStore((s) => s.turn);
  const [showTurnPopup, setShowTurnPopup] = useState(false);
  const [assetsReady, setAssetsReady] = useState(false);

  // Initialize animation engine
  useAnimationEngine();

  // Background music
  useMusicPlayer();

  useEffect(() => {
    preloadAssets().then(() => setAssetsReady(true));
  }, []);

  const lastAnnouncedTurnRef = useRef(0);

  useEffect(() => {
    if (phase === GamePhase.PLAYER_TURN && turn > 1 && turn !== lastAnnouncedTurnRef.current) {
      lastAnnouncedTurnRef.current = turn;
      const showTimer = setTimeout(() => setShowTurnPopup(true), 0);
      const hideTimer = setTimeout(
        () => setShowTurnPopup(false),
        UI.TURN_POPUP_DISPLAY_MS + UI.TURN_POPUP_FADE_MS,
      );
      return () => {
        clearTimeout(showTimer);
        clearTimeout(hideTimer);
      };
    }
  }, [phase, turn]);

  return (
    <div className="app-container">
      {!assetsReady ? (
        <div role="status" aria-live="polite" className="loading-text">Loading…</div>
      ) : phase ? (
        <>
          <GridRenderer />
          <HUD showTurnPopup={showTurnPopup} />
          <FlyToHudLayer />
          {canInstall && (
            <button className="a2hs-btn" onClick={promptInstall}>
              📲 Install App
            </button>
          )}
        </>
      ) : (
        <span className="loading-text">Volcanae - Loading...</span>
      )}
    </div>
  );
}

function App() {
  const screen = useMenuStore((s) => s.screen);
  const { canInstall, isInstalled, promptInstall } = useA2HS();

  return screen === 'MENU'
    ? <MainMenu canInstall={canInstall} isInstalled={isInstalled} promptInstall={promptInstall} />
    : <Game canInstall={canInstall} promptInstall={promptInstall} />;
}

export default App

/**
 * Type augmentation for the beforeinstallprompt event (non-standard).
 */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
}
