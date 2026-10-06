/* eslint-disable no-restricted-syntax */
import { useCallback, useEffect, useState } from 'react';
import { useGameStore } from '../gameStore';
import { useMenuStore } from '../menuStore';
import { useDevOptionsStore } from '../devOptionsStore';
import { deleteRun, readMeta, useAiTraceStatusStore } from '../aiTraceStore';
import { formatAiTraceBytes } from '../aiTraceExportClient';
import type { AiTraceMeta } from '../aiTrace';
import { AiTraceExportControls } from './AiTraceExportControls';

export function AiTraceBadge() {
  const turn = useGameStore((s) => s.turn);
  const recordAiTrace = useDevOptionsStore((s) => s.recordAiTrace);
  const activeSaveId = useMenuStore((s) => s.activeSaveId);
  const status = useAiTraceStatusStore((s) => s.status);
  const [meta, setMeta] = useState<AiTraceMeta | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [busyMode, setBusyMode] = useState<'clear' | null>(null);

  const refreshMeta = useCallback(async () => {
    if (!activeSaveId || !recordAiTrace) {
      setMeta(null);
      return;
    }
    setMeta(await readMeta(activeSaveId));
  }, [activeSaveId, recordAiTrace]);

  useEffect(() => {
    void refreshMeta();
  }, [refreshMeta, turn]);

  useEffect(() => {
    if (!panelOpen) return;
    void refreshMeta();
  }, [panelOpen, refreshMeta]);

  const visualStatus = meta?.capped ? 'CAPPED' : status;
  const badgeClass = visualStatus === 'OK'
    ? 'ai-trace-badge-pill ai-trace-badge-pill--ok'
    : 'ai-trace-badge-pill ai-trace-badge-pill--warn';

  const handleClear = useCallback(async () => {
    if (!activeSaveId) return;
    if (!window.confirm('Clear the AI trace for this save?')) return;
    setBusyMode('clear');
    try {
      await deleteRun(activeSaveId);
      setMeta(null);
    } finally {
      setBusyMode(null);
      setPanelOpen(false);
    }
  }, [activeSaveId]);

  if (!recordAiTrace || !activeSaveId) return null;

  return (
    <>
      <div className="ai-trace-badge-shell">
        <button className={badgeClass} onClick={() => setPanelOpen(true)}>
          <span className="ai-trace-badge-dot">●</span>
          <span>REC</span>
          <span>t{turn}</span>
          <span>{meta?.rowCount ?? 0} rows</span>
          <span>{formatAiTraceBytes(meta?.byteEstimate ?? 0)}</span>
        </button>
      </div>
      {panelOpen && (
        <div className="hud-dev-overlay-backdrop" onClick={() => setPanelOpen(false)}>
          <div className="hud-dev-overlay ai-trace-panel" onClick={(event) => event.stopPropagation()}>
            <div className="hud-dev-overlay-header">
              <span>📼 AI Trace</span>
              <button className="hud-modal-close" onClick={() => setPanelOpen(false)}>✕</button>
            </div>
            <div className="hud-dev-overlay-body">
              <div className="hud-dev-overlay-section-title">Export</div>
              <AiTraceExportControls slotId={activeSaveId} />
              <div className="hud-dev-overlay-section-title">Maintenance</div>
              <button className="hud-dev-action-btn ai-trace-panel-clear" onClick={() => void handleClear()} disabled={busyMode !== null}>{busyMode === 'clear' ? 'Clearing trace...' : 'Clear trace for this save'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
