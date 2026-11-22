import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { TERRAIN_TUNING, TERRAIN_TUNING_SCHEMA } from '../../config/terrain';
import { BACK_PRIORITY } from '../backNavigation';
import { useBackDismiss } from '../useBackDismiss';
import { useGameStore } from '../gameStore';
import { TileStatus, TileType, type Tile } from '../types';
import { getTerrainLook } from '../terrain/terrainLook';
import { useTerrainTuningStore } from '../terrain/terrainTuningStore';
import './TerrainTuningPanel.css';

const EXPORT_TAB = 'export';

function getTileGroup(tile: Tile | undefined): string | null {
  if (!tile) return null;
  if (tile.status === TileStatus.FROZEN) return 'status.frozen';
  if (tile.status === TileStatus.BURNING) return 'status.burning';
  if (tile.status === TileStatus.CORRUPTED) return 'status.corrupted';
  if (tile.status === TileStatus.CRYSTALLINE) return 'status.crystalline';
  if (tile.isLava || tile.isLavaPreview) return 'terrain.lava';
  if (!tile.isRevealed) return 'terrain.fog';
  if (tile.terrainType === TileType.CANYON) return 'terrain.canyon';
  if (tile.terrainType === TileType.WATER) return 'terrain.water';
  return 'terrain.plains';
}

export default function TerrainTuningPanel() {
  const panelOpen = useTerrainTuningStore((state) => state.panelOpen);
  const revision = useTerrainTuningStore((state) => state.revision);
  const closePanel = useTerrainTuningStore((state) => state.closePanel);
  const setValue = useTerrainTuningStore((state) => state.setValue);
  const resetGroup = useTerrainTuningStore((state) => state.resetGroup);
  const resetAll = useTerrainTuningStore((state) => state.resetAll);
  const importValues = useTerrainTuningStore((state) => state.importValues);
  const exportValues = useTerrainTuningStore((state) => state.exportValues);
  const selectedTileGroup = useGameStore((state) => {
    const position = state.selectedTilePos;
    return position ? getTileGroup(state.grid[position.y]?.[position.x]) : null;
  });
  const [activeTab, setActiveTab] = useState<string>(TERRAIN_TUNING_SCHEMA[0].path);
  const [exportText, setExportText] = useState('');
  const [textDirty, setTextDirty] = useState(false);
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useBackDismiss(closePanel, BACK_PRIORITY.TERRAIN_TUNER, panelOpen);

  useEffect(() => {
    if (panelOpen && selectedTileGroup) setActiveTab(selectedTileGroup);
  }, [panelOpen, selectedTileGroup]);

  useEffect(() => {
    if (!panelOpen || activeTab !== EXPORT_TAB || textDirty) return;
    setExportText(JSON.stringify(exportValues(), null, 2));
  }, [activeTab, exportValues, panelOpen, revision, textDirty]);

  if (!panelOpen) return null;

  const activeGroup = TERRAIN_TUNING_SCHEMA.find((group) => group.path === activeTab);
  const look = getTerrainLook();

  const handleCopy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(exportText);
      setMessage('Copied.');
    } catch {
      textareaRef.current?.focus();
      textareaRef.current?.select();
      const copied = document.execCommand?.('copy') ?? false;
      setMessage(copied ? 'Copied.' : 'Text selected. Copy it manually.');
    }
  };

  const handleApply = () => {
    try {
      const count = importValues(JSON.parse(exportText) as unknown);
      setTextDirty(false);
      setExportText(JSON.stringify(exportValues(), null, 2));
      setMessage(`Applied ${count} values.`);
    } catch {
      setMessage('Invalid JSON.');
    }
  };

  return createPortal(
    <section
      className="terrain-tuning-panel"
      aria-label="Terrain tuning"
      style={{ maxHeight: `${TERRAIN_TUNING.PANEL_MAX_HEIGHT_VH}vh` }}
    >
      <div className="terrain-tuning-content">
        {activeGroup ? (
          <>
            <div className="terrain-tuning-rows">
              {activeGroup.params.map(([key, label, min, max]) => {
                const value = activeTab === 'objects'
                  ? look.objects[key as keyof typeof look.objects]
                  : (look as unknown as Record<string, Record<string, number>>)[activeTab.split('.')[0]][activeTab.split('.')[1]][key];
                return (
                  <label className="terrain-tuning-row" key={key}>
                    <span className="terrain-tuning-label">{label}</span>
                    <input
                      aria-label={label}
                      type="range"
                      min={min}
                      max={max}
                      step={(max - min) / TERRAIN_TUNING.STEPS}
                      value={value}
                      onChange={(event) => setValue(activeTab, key, Number(event.target.value))}
                    />
                    <output>{value.toFixed(2)}</output>
                  </label>
                );
              })}
            </div>
            <div className="terrain-tuning-footer">
              <button type="button" onClick={() => resetGroup(activeGroup.path)}>
                Reset {activeGroup.label}
              </button>
            </div>
          </>
        ) : (
          <div className="terrain-tuning-export">
            <textarea
              ref={textareaRef}
              aria-label="Terrain tuning JSON"
              value={exportText}
              spellCheck={false}
              onChange={(event) => {
                setExportText(event.target.value);
                setTextDirty(true);
                setMessage('');
              }}
            />
            <div className="terrain-tuning-export-actions">
              <button type="button" onClick={() => void handleCopy()}>Copy</button>
              <button type="button" onClick={handleApply}>Apply</button>
              <button type="button" onClick={() => {
                resetAll();
                setTextDirty(false);
                setExportText(JSON.stringify(exportValues(), null, 2));
                setMessage('All values reset.');
              }}>Reset all</button>
              <span role="status">{message}</span>
            </div>
          </div>
        )}
      </div>
      <nav className="terrain-tuning-tabs" aria-label="Terrain tuning groups">
        {TERRAIN_TUNING_SCHEMA.map((group) => (
          <button
            type="button"
            key={group.path}
            className={activeTab === group.path ? 'is-active' : ''}
            aria-selected={activeTab === group.path}
            onClick={() => {
              setActiveTab(group.path);
              setMessage('');
            }}
          >
            {group.label}
          </button>
        ))}
        <button
          type="button"
          className={activeTab === EXPORT_TAB ? 'is-active' : ''}
          aria-selected={activeTab === EXPORT_TAB}
          onClick={() => {
            setActiveTab(EXPORT_TAB);
            setTextDirty(false);
            setMessage('');
          }}
        >
          Export
        </button>
        <button type="button" className="terrain-tuning-close" aria-label="Close terrain tuning" onClick={closePanel}>
          ✕
        </button>
      </nav>
    </section>,
    document.body,
  );
}
