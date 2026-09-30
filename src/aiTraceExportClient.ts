import { buildTraceExport, type TraceExportMode } from './aiTraceExport';

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
