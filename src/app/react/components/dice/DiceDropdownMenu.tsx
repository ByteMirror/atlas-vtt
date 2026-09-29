import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cn } from 'src/utils/cn';
import { useKeepInView } from '../../../packages/components/primitives/useKeepInView';
import { DiceTool } from '../../../tools/DiceTool';
import { DiceGrid } from './DiceGrid';
import { DiceFormulaBar } from './DiceFormulaBar';
import { DiceToastContainer } from './DiceToastContainer';
import { SegmentedControl, type SegmentedOption } from '../../../packages/components/primitives/SegmentedControl';
import type { DiceMode } from '../../../services/SettingsService';

const DICE_MODES: readonly SegmentedOption<DiceMode>[] = [
  { value: 'rng', label: 'RNG' },
  { value: 'physical', label: 'Physical' },
];

interface DiceSelection {
  [die: string]: number;
}

export interface DiceDropdownMenuProps {
  diceTool: DiceTool;
  isOpen: boolean;
  onToggle: () => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
}

export function DiceDropdownMenu({ diceTool, isOpen, onToggle, triggerRef }: DiceDropdownMenuProps): React.ReactElement {
  const [selection, setSelection] = useState<DiceSelection>({});
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const portalRef = useRef<HTMLDivElement>(null);
  const keepInView = useKeepInView(portalRef, isOpen, 'top', `${position.left},${position.top}`);
  const [mode, setMode] = useState<DiceMode>(() => diceTool.getMode());

  const handleModeChange = useCallback((next: DiceMode): void => {
    diceTool.setMode(next);
    setMode(next);
  }, [diceTool]);

  // ── Dice add / remove ────────────────────────

  const handleAdd = useCallback((die: string, event: React.MouseEvent): void => {
    event.stopPropagation();
    event.preventDefault();
    setSelection((prev) => ({ ...prev, [die]: (prev[die] ?? 0) + 1 }));
  }, []);

  const handleRemove = useCallback((die: string, event: React.MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    setSelection((prev) => {
      const next = { ...prev };
      if (next[die] !== undefined && next[die] > 1) {
        next[die]--;
      } else {
        delete next[die];
      }
      return next;
    });
  }, []);

  // ── Roll & clear ─────────────────────────────

  const handleRoll = useCallback((): void => {
    const parts = Object.entries(selection)
      .filter(([, count]) => count > 0)
      .map(([die, count]) => (count > 1 ? `${count}${die}` : die));

    if (parts.length === 0) return;

    // Physical dice are thrown on the map, so the panel gets out of the way first.
    onToggle();
    void diceTool.requestRoll(parts.join('+'));
  }, [selection, diceTool, onToggle]);

  const handleClear = useCallback((): void => {
    setSelection({});
  }, []);

  // ── Position & reset when opened ─────────────

  useEffect(() => {
    if (!isOpen) {
      setSelection({});
      return;
    }
    setMode(diceTool.getMode());
    if (triggerRef?.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPosition({ top: rect.top - 16, left: rect.left + rect.width / 2 });
    }
  }, [isOpen, triggerRef, diceTool]);

  // ── Click-outside ────────────────────────────

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent): void => {
      const target = event.target as HTMLElement;
      if (triggerRef?.current?.contains(target)) return;
      if (target.closest('.atlas-dice-portal')) return;
      onToggle();
    };

    const timer = window.setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onToggle, triggerRef]);

  return (
    <>
      {/* Dropdown panel */}
      {isOpen &&
        createPortal(
          <div
            ref={portalRef}
            className={cn('atlas-dice-portal atlas-vtt-plugin', keepInView.capped && 'atlas-keep-in-view--capped')}
            style={{ ...keepInView.style, top: `${position.top}px`, left: `${position.left}px` }}
          >
            <div className="atlas-dice-panel">
              {diceTool.hasPhysicalTable() && (
                <SegmentedControl
                  className="atlas-dice-mode"
                  value={mode}
                  options={DICE_MODES}
                  onChange={handleModeChange}
                  ariaLabel="Dice mode"
                />
              )}
              <DiceGrid selection={selection} onAdd={handleAdd} onRemove={handleRemove} />
              <DiceFormulaBar selection={selection} onClear={handleClear} onRoll={handleRoll} />
            </div>
          </div>,
          document.body,
        )}

      {/* Global toast layer — listens for atlas-dice-rolled CustomEvent */}
      <DiceToastContainer />
    </>
  );
}
