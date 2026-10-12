import { describe, expect, it } from 'vitest';
import HUD_TSX from '../components/HUD.tsx?raw';
import EXPORT_CONTROLS_TSX from '../components/AiTraceExportControls.tsx?raw';

const devOptions = HUD_TSX.slice(
  HUD_TSX.indexOf('function DevOptionsOverlay('),
  HUD_TSX.indexOf('/* eslint-enable no-restricted-syntax */', HUD_TSX.indexOf('function DevOptionsOverlay(')),
);

describe('AI trace UI contracts', () => {
  it('keeps all trace statistics out of compact end-screen exports', () => {
    const stats = EXPORT_CONTROLS_TSX.slice(
      EXPORT_CONTROLS_TSX.indexOf('{!compact && ('),
      EXPORT_CONTROLS_TSX.indexOf('<div className={`ai-trace-export-actions'),
    );
    for (const label of ['Turns', 'Rows', 'Size', 'Status']) {
      expect(stats).toContain(`>${label}</span>`);
    }
    expect(stats).toMatch(/<\/>\s*\)\}/);
    expect(HUD_TSX).toContain('<AiTraceExportControls slotId={slotId} compact />');
  });

  it('offers just the full export button in compact mode', () => {
    const actions = EXPORT_CONTROLS_TSX.slice(EXPORT_CONTROLS_TSX.indexOf('<div className={`ai-trace-export-actions'));
    const secondaryStart = actions.indexOf('{!compact && (');
    const primary = actions.slice(0, secondaryStart);
    const secondary = actions.slice(secondaryStart);
    expect(primary.match(/<button /g)).toHaveLength(1);
    expect(primary).toContain("handleExport('full')");
    expect(secondary).toContain("handleExport('noTerms')");
    expect(secondary).toContain("handleExport('flaggedOnly')");
  });

  it('puts current trace details and finished runs inside a closed-by-default submenu', () => {
    expect(devOptions).toContain('const [traceMenuOpen, setTraceMenuOpen] = useState(false)');
    expect(devOptions).toContain('onClick={() => setTraceMenuOpen(true)}>📼 AI Trace');
    const submenu = devOptions.slice(
      devOptions.indexOf('{traceMenuOpen && ('),
      devOptions.lastIndexOf('{!traceMenuOpen && ('),
    );
    expect(submenu).toContain('<AiTraceExportControls slotId={activeSaveId} />');
    expect(submenu).toContain('Finished runs');
    expect(submenu).toContain('onClick={() => setTraceMenuOpen(false)}>Back to Dev Options');
    expect(devOptions).toContain('if (traceMenuOpen) setTraceMenuOpen(false)');
    expect(devOptions).toContain('if (traceMenuOpen) void refreshTraceState()');
  });
});
