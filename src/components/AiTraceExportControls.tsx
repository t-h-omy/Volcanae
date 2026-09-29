import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildTraceExport, type TraceExportMode } from '../aiTraceExport';
import { readMeta, useAiTraceStatusStore } from '../aiTraceStore';
import type { AiTraceMeta } from '../aiTrace';

export function formatAiTraceBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export async function shareOrDownloadAiTrace(blob: Blob, filename: string): Promise<void> {
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

export async function exportAiTrace(slotId: string, mode: TraceExportMode): Promise<Blob | null> {
  const result = await buildTraceExport(slotId, mode);
  if (!result) return null;
  await shareOrDownloadAiTrace(result.blob, result.filename);
  return result.blob;
}

export function AiTraceExportControls({ slotId, compact = false }: { slotId: string; compact?: boolean }) {
  const status = useAiTraceStatusStore((s) => s.status);
  const [meta, setMeta] = useState<AiTraceMeta | null>(null);
  const [busyMode, setBusyMode] = useState<TraceExportMode | null>(null);

  const refreshMeta = useCallback(async () => {
    setMeta(await readMeta(slotId));
  }, [slotId]);

  useEffect(() => {
    void refreshMeta();
  }, [refreshMeta]);

  const visualStatus = meta?.capped ? 'CAPPED' : status;
  const statusText = useMemo(() => {
    if (visualStatus === 'STOPPED_QUOTA') return 'Storage full. Recording stopped.';
    if (visualStatus === 'CAPPED') return 'Row cap reached. Recording stopped.';
    return meta?.sealed ? 'Finished run preserved.' : 'Recording active.';
  }, [meta?.sealed, visualStatus]);

  const handleExport = useCallback(async (mode: TraceExportMode) => {
    setBusyMode(mode);
    try {
      await exportAiTrace(slotId, mode);
    } finally {
      setBusyMode(null);
    }
  }, [slotId]);

  if (!meta || meta.rowCount === 0) return null;

  return (
    <div className={`ai-trace-export-controls${compact ? ' ai-trace-export-controls--compact' : ''}`}>
      <div className="hud-dev-stat-row">
        <span className="hud-dev-stat-label">Turns</span>
        <span className="hud-dev-stat-value">{`${meta.firstTurn} to ${meta.lastTurn}`}</span>
      </div>
      <div className="hud-dev-stat-row">
        <span className="hud-dev-stat-label">Rows</span>
        <span className="hud-dev-stat-value">{meta.rowCount}</span>
      </div>
      <div className="hud-dev-stat-row">
        <span className="hud-dev-stat-label">Size</span>
        <span className="hud-dev-stat-value">{formatAiTraceBytes(meta.byteEstimate)}</span>
      </div>
      <div className="hud-dev-stat-row">
        <span className="hud-dev-stat-label">Status</span>
        <span className="hud-dev-stat-value ai-trace-panel-status">{statusText}</span>
      </div>
      <div className={`ai-trace-export-actions${compact ? ' ai-trace-export-actions--compact' : ''}`}>
        <button className="hud-dev-action-btn" onClick={() => void handleExport('full')} disabled={busyMode !== null}>
          {busyMode === 'full' ? 'Building export...' : compact ? '🧠 Export AI Trace' : 'Export'}
        </button>
        {compact ? (
          <button className="hud-dev-action-btn ai-trace-export-actions-compact-secondary" onClick={() => void handleExport('flaggedOnly')} disabled={busyMode !== null}>
            {busyMode === 'flaggedOnly' ? 'Building export...' : 'Flagged only'}
          </button>
        ) : (
          <>
            <button className="hud-dev-action-btn" onClick={() => void handleExport('noTerms')} disabled={busyMode !== null}>
              {busyMode === 'noTerms' ? 'Building export...' : 'Export without terms'}
            </button>
            <button className="hud-dev-action-btn" onClick={() => void handleExport('flaggedOnly')} disabled={busyMode !== null}>
              {busyMode === 'flaggedOnly' ? 'Building export...' : 'Export flagged only'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
