import { buildTraceExport, type TraceExportMode } from './aiTraceExport';
import { UI } from '../config/ui';

export function formatAiTraceBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export function downloadAiTrace(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), UI.EXPORT_URL_REVOKE_DELAY_MS);
  }
}

export async function exportAiTrace(slotId: string, mode: TraceExportMode): Promise<Blob | null> {
  const result = await buildTraceExport(slotId, mode);
  if (!result) return null;
  downloadAiTrace(result.blob, result.filename);
  return result.blob;
}
