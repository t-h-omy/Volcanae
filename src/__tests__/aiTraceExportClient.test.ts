import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UI } from '../../config/ui';
import { buildTraceExport } from '../aiTraceExport';
import { downloadAiTrace, exportAiTrace } from '../aiTraceExportClient';

vi.mock('../aiTraceExport', () => ({ buildTraceExport: vi.fn() }));

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.mocked(buildTraceExport).mockReset();
});

function mockDownloadBrowser(canShare: boolean) {
  const share = vi.fn();
  vi.stubGlobal('navigator', { canShare: vi.fn(() => canShare), share });
  const anchor = { href: '', download: '', click: vi.fn(), remove: vi.fn() };
  const appendChild = vi.fn();
  const createElement = vi.fn(() => anchor);
  vi.stubGlobal('document', { body: { appendChild }, createElement });
  const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:ai-trace');
  const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  return { anchor, appendChild, createElement, createObjectURL, revokeObjectURL, share };
}

describe('AI trace downloads', () => {
  it.each([true, false])('downloads directly when file sharing support is %s', (canShare) => {
    const browser = mockDownloadBrowser(canShare);
    const blob = new Blob(['{"rows":[]}'], { type: 'application/json' });

    browser.anchor.click.mockImplementation(() => {
      expect(browser.appendChild).toHaveBeenCalledWith(browser.anchor);
      expect(browser.anchor.href).toBe('blob:ai-trace');
      expect(browser.anchor.download).toBe('trace.json');
      expect(browser.revokeObjectURL).not.toHaveBeenCalled();
    });
    downloadAiTrace(blob, 'trace.json');

    expect(browser.createObjectURL).toHaveBeenCalledWith(blob);
    expect(browser.createElement).toHaveBeenCalledWith('a');
    expect(browser.anchor.click).toHaveBeenCalledOnce();
    expect(browser.anchor.remove).toHaveBeenCalledOnce();
    expect(browser.share).not.toHaveBeenCalled();
    expect(browser.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(UI.EXPORT_URL_REVOKE_DELAY_MS - 1);
    expect(browser.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(browser.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:ai-trace');
  });

  it('cleans up the anchor and URL even if clicking fails', () => {
    const browser = mockDownloadBrowser(false);
    browser.anchor.click.mockImplementation(() => { throw new Error('Download failed'); });

    expect(() => downloadAiTrace(new Blob(), 'trace.json')).toThrow('Download failed');
    expect(browser.anchor.remove).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(UI.EXPORT_URL_REVOKE_DELAY_MS);
    expect(browser.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:ai-trace');
  });

  it('downloads the built full trace with its generated filename', async () => {
    const browser = mockDownloadBrowser(true);
    const blob = new Blob(['{"rows":[]}'], { type: 'application/json' });
    vi.mocked(buildTraceExport).mockResolvedValue({ blob, filename: 'finished-run.json' });

    await expect(exportAiTrace('finished-slot', 'full')).resolves.toBe(blob);
    expect(buildTraceExport).toHaveBeenCalledWith('finished-slot', 'full');
    expect(browser.anchor.download).toBe('finished-run.json');
    expect(browser.anchor.click).toHaveBeenCalledOnce();
  });

  it('does not trigger a download for an empty trace', async () => {
    const browser = mockDownloadBrowser(false);
    vi.mocked(buildTraceExport).mockResolvedValue(null);

    await expect(exportAiTrace('empty-slot', 'full')).resolves.toBeNull();
    expect(browser.createObjectURL).not.toHaveBeenCalled();
    expect(browser.anchor.click).not.toHaveBeenCalled();
  });
});
