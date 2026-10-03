import React, { useEffect, useId, useRef } from 'react';
import { senseKind, senseNameProblem, senseProblem, withSenseKind, type SenseKind } from '../../../gameSystems/senseEditing';
import { withUnit } from '../../../lighting/tokenLighting';
import { Select, type SelectOption } from '../../../packages/components/primitives/Select';
import { ToggleSwitch } from '../../../packages/components/primitives/Toggle';
import type { SenseDefinition, SenseLook, SenseRange, SenseSight } from '../../../types/senseTypes';
import { numberText, parseNumberText, positiveNumber } from '../../../utils/numberInput';

const KINDS: SelectOption<SenseKind>[] = [
  { value: 'sense', label: 'A sense of its own' },
  { value: 'see-invisible', label: 'Lets the token\'s sight see invisible creatures' },
];

const RANGES: SelectOption<SenseRange>[] = [
  { value: 'required', label: 'Needs a range' },
  { value: 'optional', label: 'Range optional' },
  { value: 'unlimited', label: 'No range' },
];

const IN_DIM: SelectOption<SenseSight['dim']>[] = [
  { value: 'none', label: 'Sees nothing' },
  { value: 'normal', label: 'Sees it as it is' },
  { value: 'as-bright', label: 'Sees it as bright light' },
];

const IN_DARK: SelectOption<SenseSight['dark']>[] = [
  { value: 'none', label: 'Sees nothing' },
  { value: 'as-dim', label: 'Sees it as dim light' },
  { value: 'as-bright', label: 'Sees it as bright light' },
];

const LOOKS: SelectOption<SenseLook>[] = [
  { value: 'colour', label: 'In colour' },
  { value: 'monochrome', label: 'In grey' },
  { value: 'black-and-white', label: 'In black and white' },
  { value: 'heat', label: 'As heat tones' },
];

interface ChoiceProps<T extends string> {
  label: string;
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  wide?: boolean;
}

function Choice<T extends string>({ label, value, options, onChange, wide = false }: ChoiceProps<T>): React.ReactElement {
  const id = useId();
  return (
    <div className={`atlas-csm-field${wide ? ' atlas-csm-sense-editor__wide' : ''}`}>
      <span id={id} className="atlas-csm-label">{label}</span>
      <Select value={value} options={options} onChange={onChange} labelledBy={id} />
    </div>
  );
}

function Switch({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }): React.ReactElement {
  const id = useId();
  return (
    <div className="atlas-csm-sense-editor__switch">
      <span id={id} className="atlas-csm-toggle-label">{label}</span>
      <ToggleSwitch value={value} onChange={() => onChange(!value)} labelledBy={id} />
    </div>
  );
}

interface SenseDefinitionEditorProps {
  sense: SenseDefinition;
  /** Every sense of the collection, for the name check. */
  all: readonly SenseDefinition[];
  /** Game unit of the collection, e.g. "ft". */
  unit: string;
  onChange: (sense: SenseDefinition) => void;
}

/** The fields of one of the collection's own senses, in plain words. */
export function SenseDefinitionEditor({ sense, all, unit, onChange }: SenseDefinitionEditorProps): React.ReactElement {
  const nameId = useId();
  const rangeId = useId();
  const problemId = useId();
  const fields = useRef<HTMLDivElement>(null);
  const problem = senseProblem(sense, all);
  const isSense = senseKind(sense) === 'sense';

  // The fields open at the end of a list that scrolls. Newer browsers return a promise from
  // scrollIntoView, which an effect must not hand back.
  useEffect(() => {
    void fields.current?.scrollIntoView?.({ block: 'nearest' });
  }, []);
  const set = (changes: Partial<SenseDefinition>): void => onChange({ ...sense, ...changes });

  const setRange = (range: SenseRange): void => {
    const { defaultRange: _defaultRange, ...rest } = sense;
    // Only a sense that needs a range has a default one.
    onChange(range === 'required' ? { ...sense, range } : { ...rest, range });
  };

  const setDefaultRange = (text: string): void => {
    const { defaultRange: _defaultRange, ...rest } = sense;
    const defaultRange = positiveNumber(parseNumberText(text));
    onChange(defaultRange === undefined ? rest : { ...rest, defaultRange });
  };

  return (
    <div ref={fields} className="atlas-csm-sense-editor">
      <div className="atlas-csm-field atlas-csm-sense-editor__wide">
        <label className="atlas-csm-label" htmlFor={nameId}>Name</label>
        <input
          id={nameId}
          type="text"
          className="atlas-csm-input"
          value={sense.name}
          placeholder="Sense name"
          aria-invalid={senseNameProblem(sense, all) ? true : undefined}
          aria-describedby={problem ? problemId : undefined}
          onChange={(event) => set({ name: event.target.value })}
        />
      </div>
      <Choice label="Kind" value={senseKind(sense)} options={KINDS} onChange={(kind) => onChange(withSenseKind(sense, kind))} wide />
      {isSense && (
        <>
          <Choice label="Range" value={sense.range} options={RANGES} onChange={setRange} />
          {sense.range === 'required' ? (
            <div className="atlas-csm-field">
              <label className="atlas-csm-label" htmlFor={rangeId}>{withUnit('Default range', unit)}</label>
              <input
                id={rangeId}
                type="number"
                className="atlas-csm-input"
                min={0}
                value={numberText(sense.defaultRange)}
                placeholder="None"
                onChange={(event) => setDefaultRange(event.target.value)}
              />
            </div>
          ) : <span />}
          <Choice label="In dim light" value={sense.sees.dim} options={IN_DIM} onChange={(dim) => set({ sees: { ...sense.sees, dim } })} />
          <Choice label="In darkness" value={sense.sees.dark} options={IN_DARK} onChange={(dark) => set({ sees: { ...sense.sees, dark } })} />
          {sense.sees.dark !== 'none' && sense.reveals === 'all' && (
            <Choice label="Look in darkness" value={sense.look} options={LOOKS} onChange={(look) => set({ look })} wide />
          )}
          <Switch label="Through walls" value={!sense.lineOfSight} onChange={(on) => set({ lineOfSight: !on })} />
          <Switch label="Sees invisible creatures" value={sense.seesInvisible} onChange={(seesInvisible) => set({ seesInvisible })} />
          <Switch label="Works while blinded" value={sense.worksWhileBlinded} onChange={(worksWhileBlinded) => set({ worksWhileBlinded })} />
          <Switch label="Creatures only" value={sense.reveals === 'creatures'} onChange={(on) => set(on ? { reveals: 'creatures' } : { reveals: 'all', precise: true })} />
          {/* A sense that shows the map sees what it perceives; one that feels creatures may only sense them. */}
          {sense.reveals === 'creatures' && (
            <Switch label="Shows as outlines" value={!sense.precise} onChange={(on) => set({ precise: !on })} />
          )}
        </>
      )}
      {problem && <p id={problemId} className="atlas-csm-hint atlas-csm-hint--error atlas-csm-sense-editor__wide">{problem}</p>}
    </div>
  );
}
