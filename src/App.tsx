import { useEffect, useCallback, useState, useRef } from 'react'
import { useGameStore } from './gameStore'
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
  const { canInstall, promptInstall } = useA2HS();

  useEffect(() => {
    initGame()
  }, [initGame])

  return (
    <div className="app-container">
      {phase ? (
        <>
          <GridRenderer />
          <HUD />
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
