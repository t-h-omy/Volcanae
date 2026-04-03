import { useEffect, useCallback, useState, useRef } from 'react'
import { useGameStore } from './gameStore'
import { useAnimationEngine } from './useAnimationEngine'
import { GamePhase } from './types'
import { UI } from './uiConfig'
import GridRenderer from './components/GridRenderer'
import HUD from './components/HUD'
import './App.css'

/**
 * Captures the `beforeinstallprompt` event for Add to Home Screen support.
 * Returns a trigger function and a boolean indicating availability.
 */
function useA2HS(): { canInstall: boolean; promptInstall: () => void } {
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);
  const [canInstall, setCanInstall] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      deferredPrompt.current = e as BeforeInstallPromptEvent;
      setCanInstall(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const promptInstall = useCallback(() => {
    deferredPrompt.current?.prompt();
    deferredPrompt.current = null;
    setCanInstall(false);
  }, []);

  return { canInstall, promptInstall };
}

function App() {
  const initGame = useGameStore((s) => s.initGame)
  const phase = useGameStore((s) => s.phase)
  const turn = useGameStore((s) => s.turn)
  const { canInstall, promptInstall } = useA2HS();
  const [showTurnPopup, setShowTurnPopup] = useState(false);

  // Initialize animation engine
  useAnimationEngine();

  useEffect(() => {
    initGame()
  }, [initGame])

  const lastAnnouncedTurnRef = useRef(0);

  useEffect(() => {
    if (phase === GamePhase.PLAYER_TURN && turn > 1 && turn !== lastAnnouncedTurnRef.current) {
      lastAnnouncedTurnRef.current = turn;
      // setTimeout(0) defers the setState call out of the effect body,
      // satisfying the react-hooks/set-state-in-effect lint rule while
      // still triggering the popup as soon as possible.
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
      {phase ? (
        <>
          <GridRenderer />
          <HUD showTurnPopup={showTurnPopup} />
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
  )
}

export default App

/**
 * Type augmentation for the beforeinstallprompt event (non-standard).
 */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
}
