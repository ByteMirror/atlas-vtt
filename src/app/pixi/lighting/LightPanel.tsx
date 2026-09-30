import React, { useEffect, useId, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { GripHorizontal, Lightbulb } from 'lucide-react';
import type { LightAnimation, LightEmission } from '../../types/lightingTypes';
import type { LightPanelTarget } from '../../stores/uiSlice';
import { CloseButton } from '../../packages/components/primitives/CloseButton';
import { SegmentedControl } from '../../packages/components/primitives/SegmentedControl';
import { Select } from '../../packages/components/primitives/Select';
import { Slider } from '../../packages/components/primitives/slider';
import { useDialogWindowVariants } from '../../packages/components/primitives/dialogMotion';
import { useAtlasStore, useViewStoreHook } from '../../react/ViewStoreContext';
import { useDraggablePosition, type PanelArea, type PanelPosition } from '../../react/hooks/useDraggablePosition';
import { beginHistoryTransaction, endHistoryTransaction } from '../../stores/history';
import { unitLabelFor } from '../../grid/measurementFormat';
import { LIGHT_PRESETS, LIGHT_PRESET_IDS, presetOf } from '../../lighting/lightPresets';
import { editEmission, emissionOfPreset, type EmissionNumberField } from '../../lighting/lightEmissionForm';

const GAP = 16;

const ANIMATIONS: { value: LightAnimation; label: string }[] = [
  { value: 'none', label: 'Steady' },
  { value: 'torch', label: 'Torch flicker' },
  { value: 'candle', label: 'Candle flicker' },
  { value: 'pulse', label: 'Pulse' },
  { value: 'magic', label: 'Magical shimmer' },
];

const PRESET_OPTIONS = [
  ...LIGHT_PRESET_IDS.map((id) => ({ value: id, label: LIGHT_PRESETS[id].label })),
  { value: 'custom' as const, label: 'Custom' },
];

/** The settings panel of the light the GM configures, if any. */
export function LightPanelHost(): React.ReactElement {
  const target = useAtlasStore((state) => state.lightPanel);
  return <AnimatePresence>{target && <LightPanel key={target.lightId} target={target} />}</AnimatePresence>;
}

/** Beside the point it opened from, on whichever side has room. */
function besidePoint(target: LightPanelTarget, panel: () => HTMLElement | null): (area: PanelArea, size: PanelArea) => PanelPosition {
  return (area, size) => {
    const origin = panel()?.offsetParent?.getBoundingClientRect();
    const x = target.clientX - (origin?.left ?? 0);
    const y = target.clientY - (origin?.top ?? 0);
    const right = x + GAP + size.width <= area.width;
    return { x: right ? x + GAP : x - GAP - size.width, y: y - size.height / 2 };
  };
}

function LightPanel({ target }: { target: LightPanelTarget }): React.ReactElement | null {
  const store = useViewStoreHook();
  const light = useAtlasStore((state) => state.objects.lights[target.lightId]);
  const unit = unitLabelFor(useAtlasStore((state) => state.grid?.unitType));
  const close = useAtlasStore((state) => state.closeLightPanel);
  const windowVariants = useDialogWindowVariants();
  const { position, panelRef, startDrag, isDragging } = useDraggablePosition(besidePoint(target, () => panelRef.current));

  useEffect(() => {
    if (!light) close();
  }, [light, close]);
  if (!light) return null;

  const emission = light.emission;
  const update = (next: LightEmission): void => {
    if (next !== emission) store.getState().updateLight(light.id, { emission: next });
  };
  // A slider drag writes on every move; the transaction makes the whole drag one undo step.
  // It ends on the window's pointerup, which comes even when the value did not change.
  const onSliderPointerDown = (event: React.PointerEvent): void => {
    beginHistoryTransaction(store);
    const win = event.currentTarget.ownerDocument.defaultView ?? window;
    const end = (): void => {
      win.removeEventListener('pointerup', end);
      win.removeEventListener('pointercancel', end);
      endHistoryTransaction(store);
    };
    win.addEventListener('pointerup', end);
    win.addEventListener('pointercancel', end);
  };

  return (
    <motion.section
      ref={panelRef}
      className={`atlas-light-panel${isDragging ? ' is-dragging' : ''}`}
      style={{ left: position.x, top: position.y }}
      variants={windowVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      aria-label="Light settings"
    >
      <header className="atlas-light-panel__header" onPointerDown={startDrag}>
        <GripHorizontal className="atlas-light-panel__grip" />
        <Lightbulb className="atlas-light-panel__icon" />
        <h2 className="atlas-light-panel__title">Light</h2>
        <CloseButton onClick={close} aria-label="Close light settings" />
      </header>
      <div className="atlas-light-panel__body">
        <SegmentedControl
          value={presetOf(emission) ?? 'custom'}
          options={PRESET_OPTIONS}
          ariaLabel="Kind of light"
          onChange={(id) => { if (id !== 'custom') update(emissionOfPreset(id)); }}
        />
        <div className="atlas-light-panel__row">
          <NumberField label={`Bright (${unit})`} emission={emission} field="bright" onChange={update} />
          <NumberField label={`Dim (${unit})`} emission={emission} field="dim" onChange={update} />
          <ColorField value={emission.color} onChange={(color) => update({ ...emission, color })} />
        </div>
        <SliderField label="Intensity" value={emission.intensity} min={0} max={2} step={0.05} onPointerDown={onSliderPointerDown}
          onChange={(value) => update(editEmission(emission, 'intensity', String(value)))} />
        <SliderField label="Softness" value={emission.sourceRadius ?? 1} min={0} max={5} step={0.25} onPointerDown={onSliderPointerDown}
          onChange={(value) => update(editEmission(emission, 'sourceRadius', String(value)))} />
        <AnimationField value={emission.animation} onChange={(animation) => update({ ...emission, animation })} />
      </div>
    </motion.section>
  );
}

interface NumberFieldProps {
  label: string;
  emission: LightEmission;
  field: EmissionNumberField;
  onChange: (next: LightEmission) => void;
}

/** Commits on Enter or when it loses focus, so half-typed numbers never reach the map. */
function NumberField({ label, emission, field, onChange }: NumberFieldProps): React.ReactElement {
  const id = useId();
  const value = String(emission[field] ?? '');
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = (): void => {
    const next = editEmission(emission, field, text);
    if (next === emission) setText(value);
    onChange(next);
  };
  return (
    <label className="atlas-light-panel__field" htmlFor={id}>
      <span>{label}</span>
      <input id={id} type="number" min={0} value={text} onChange={(e) => setText(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); }} />
    </label>
  );
}

function ColorField({ value, onChange }: { value: string; onChange: (color: string) => void }): React.ReactElement {
  const id = useId();
  return (
    <label className="atlas-light-panel__field atlas-light-panel__field--color" htmlFor={id}>
      <span>Colour</span>
      <input id={id} type="color" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

interface SliderFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onPointerDown: (event: React.PointerEvent) => void;
  onChange: (value: number) => void;
}

function SliderField({ label, value, min, max, step, onPointerDown, onChange }: SliderFieldProps): React.ReactElement {
  const id = useId();
  return (
    <div className="atlas-light-panel__slider">
      <span id={id}>{label}</span>
      <Slider aria-labelledby={id} value={[value]} min={min} max={max} step={step}
        onValueChange={([next]) => onChange(next ?? value)} onPointerDown={onPointerDown} />
    </div>
  );
}

function AnimationField({ value, onChange }: { value: LightAnimation; onChange: (value: LightAnimation) => void }): React.ReactElement {
  const id = useId();
  return (
    <div className="atlas-light-panel__field">
      <span id={id}>Animation</span>
      <Select value={value} options={ANIMATIONS} onChange={onChange} labelledBy={id} />
    </div>
  );
}
