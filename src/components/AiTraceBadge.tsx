import { useCallback, useEffect, useMemo, useState } from 'react';
import { useGameStore } from '../gameStore';
import { useMenuStore } from '../menuStore';
import { useDevOptionsStore } from '../devOptionsStore';
import { buildTraceExport, type TraceExportMode } from '../aiTraceExport';
import { deleteRun, readMeta, useAiTraceStatusStore } from '../aiTraceStore';
import type { AiTraceMeta } from '../aiTrace';

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

async function shareOrDownload(blob: Blob, filename: string): Promise<void> {
  const file = new File([blob], filename, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file] });
    return;
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function AiTraceBadge() {
  const turn = useGameStore((s) => s.turn);
  const recordAiTrace = useDevOptionsStore((s) => s.recordAiTrace);
  const activeSaveId = useMenuStore((s) => s.activeSaveId);
  const status = useAiTraceStatusStore((s) => s.status);
  const [meta, setMeta] = useState<AiTraceMeta | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [busyMode, setBusyMode] = useState<TraceExportMode | 'clear' | null>(null);

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
  const statusText = useMemo(() => {
    if (visualStatus === 'STOPPED_QUOTA') return 'Storage full. Recording stopped.';
    if (visualStatus === 'CAPPED') return 'Row cap reached. Recording stopped.';
    return 'Recording active.';
  }, [visualStatus]);

  const badgeClass = visualStatus === 'OK'
    ? 'ai-trace-badge-pill ai-trace-badge-pill--ok'
    : 'ai-trace-badge-pill ai-trace-badge-pill--warn';

  const handleExport = useCallback(async (mode: TraceExportMode) => {
    if (!activeSaveId) return;
    setBusyMode(mode);
    try {
      const result = await buildTraceExport(activeSaveId, mode);
      if (!result) return;
      await shareOrDownload(result.blob, result.filename);
    } finally {
      setBusyMode(null);
    }
  }, [activeSaveId]);

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
          <span>{formatBytes(meta?.byteEstimate ?? 0)}</span>
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
              <div className="hud-dev-stat-row"><span className="hud-dev-stat-label">Turns</span><span className="hud-dev-stat-value">{meta ? `${meta.firstTurn} to ${meta.lastTurn}` : '0 to 0'}</span></div>
              <div className="hud-dev-stat-row"><span className="hud-dev-stat-label">Rows</span><span className="hud-dev-stat-value">{meta?.rowCount ?? 0}</span></div>
              <div className="hud-dev-stat-row"><span className="hud-dev-stat-label">Size</span><span className="hud-dev-stat-value">{formatBytes(meta?.byteEstimate ?? 0)}</span></div>
              <div className="hud-dev-stat-row"><span className="hud-dev-stat-label">Status</span><span className="hud-dev-stat-value ai-trace-panel-status">{statusText}</span></div>
              <div className="hud-dev-overlay-section-title">Export</div>
              <button className="hud-dev-action-btn" onClick={() => void handleExport('full')} disabled={busyMode !== null}>{busyMode === 'full' ? 'Building export...' : 'Export'}</button>
              <button className="hud-dev-action-btn" onClick={() => void handleExport('noTerms')} disabled={busyMode !== null}>{busyMode === 'noTerms' ? 'Building export...' : 'Export without terms'}</button>
              <button className="hud-dev-action-btn" onClick={() => void handleExport('flaggedOnly')} disabled={busyMode !== null}>{busyMode === 'flaggedOnly' ? 'Building export...' : 'Export flagged only'}</button>
              <div className="hud-dev-overlay-section-title">Maintenance</div>
              <button className="hud-dev-action-btn ai-trace-panel-clear" onClick={() => void handleClear()} disabled={busyMode !== null}>{busyMode === 'clear' ? 'Clearing trace...' : 'Clear trace for this save'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
