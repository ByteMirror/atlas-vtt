import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import type { HiddenSummary } from '../../../../../creatures/creatureFilterEngine';
import { hasPicks, LAYOUT_FACET, withOptionState, withRange, withStatblockFilter } from '../../../../../creatures/creatureSelection';
import type { StatblockLinkFilter } from '../../../../../types/creatureFilterTypes';
import { EASE_OUT_CONTROL_POINTS } from '../../../../../utils/motion';
import { Button } from '../../../primitives/button';
import { CloseButton } from '../../../primitives/CloseButton';
import { SegmentedControl } from '../../../primitives/SegmentedControl';
import { Skeleton, SkeletonGroup } from '../../../primitives/Skeleton';
import { useDialogEscape } from '../../../primitives/useDialogEscape';
import type { CreatureFilterPanel } from '../../hooks/useCreatureFilters';
import { FilterSection } from './FilterSection';
import { OptionChips } from './OptionChips';
import { RangeFilter } from './RangeFilter';

const STATBLOCK_CHOICES = [
  { value: 'any', label: 'All' },
  { value: 'linked', label: 'With statblock' },
  { value: 'unlinked', label: 'Without' },
] as const;

const PANEL_MOTION = {
  initial: { opacity: 0, transform: 'translateY(-4px) scale(0.98)' },
  animate: { opacity: 1, transform: 'translateY(0px) scale(1)' },
  exit: { opacity: 0, transform: 'translateY(-4px) scale(0.98)' },
  transition: { duration: 0.16, ease: EASE_OUT_CONTROL_POINTS },
};

function hiddenText({ withoutStatblock, withoutField }: HiddenSummary): string | null {
  const parts = [
    ...(withoutStatblock > 0 ? [`${withoutStatblock} without a statblock`] : []),
    ...withoutField.map(({ label, count }) => `${count} without ${label.toLowerCase()}`),
  ];
  return parts.length > 0 ? `Hidden: ${parts.join(', ')}` : null;
}

/** The two placeholder filters: the widths of their title and of their chips, in px. */
const SKELETON_FILTERS = [
  { title: 96, chips: [64, 88, 52, 76, 60] },
  { title: 56, chips: [72, 48, 84] },
] as const;

/** Stands in for the filters while the statblocks they come from are read. */
function FilterSkeleton(): React.JSX.Element {
  return (
    <SkeletonGroup label="Reading statblocks…" className="atlas-filter-skeleton">
      {SKELETON_FILTERS.map((filter) => (
        <div key={filter.title} className="atlas-filter-section">
          <div className="atlas-filter-section__header"><Skeleton shape="text" width={filter.title} /></div>
          <div className="atlas-filter-chips">
            {filter.chips.map((width) => <Skeleton key={width} shape="pill" className="atlas-filter-chip-skeleton" width={width} />)}
          </div>
        </div>
      ))}
    </SkeletonGroup>
  );
}

interface AdvancedFilterPanelProps {
  panel: CreatureFilterPanel;
  onClose: () => void;
  onReset: () => void;
  /** The button that opens the panel; a click on it is not a click outside. */
  anchorRef: React.RefObject<HTMLElement | null>;
}

/**
 * The filters of the Characters tab under the search: the statblock fields the
 * characters in view have, as ranges and option chips. The search's typed
 * filters and the chips under the header edit the same selection.
 */
export function AdvancedFilterPanel({ panel, onClose, onReset, anchorRef }: AdvancedFilterPanelProps): React.JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const { selection, setSelection, result } = panel;
  const { facets } = result;
  const hidden = hiddenText(result.hidden);
  const ranges = facets.ranges.filter((facet) => facet.values.length > 1 || facet.selected);
  const options = facets.options.filter((facet) => facet.options.length > 0);
  const showLayouts = facets.layouts.length > 1 || hasPicks(selection.layouts);
  const hasStatblockFields = ranges.length > 0 || options.length > 0 || showLayouts;

  useDialogEscape(rootRef, onClose);

  useEffect(() => {
    const doc = rootRef.current?.ownerDocument ?? document;
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !anchorRef.current?.contains(target)) onClose();
    };
    doc.addEventListener('pointerdown', onPointerDown);
    return () => doc.removeEventListener('pointerdown', onPointerDown);
  }, [onClose, anchorRef]);

  return (
    <motion.div ref={rootRef} className="atlas-filter-panel" role="dialog" aria-label="Filters" {...PANEL_MOTION}>
      <div className="atlas-filter-panel__header">
        <h3>Filters</h3>
        <CloseButton onClick={onClose} aria-label="Close filters" />
      </div>

      <div className="atlas-filter-panel__body">
        <p className="atlas-filter-panel__hint">Click an option to require it, double-click to exclude it.</p>
        <FilterSection title="Statblock" active={selection.statblock !== 'any'}>
          <SegmentedControl
            className="atlas-filter-panel__statblock"
            ariaLabel="Statblock"
            value={selection.statblock}
            options={STATBLOCK_CHOICES}
            onChange={(value: StatblockLinkFilter) => setSelection((current) => withStatblockFilter(current, value))}
          />
        </FilterSection>

        {ranges.map((facet) => (
          <RangeFilter
            key={facet.definition.id}
            facet={facet}
            onChange={(range) => setSelection((current) => withRange(current, facet.definition.id, range))}
          />
        ))}

        {options.map((facet) => (
          <FilterSection key={facet.definition.id} title={facet.definition.label} active={facet.options.some((option) => option.state !== null)}>
            <OptionChips
              label={facet.definition.label}
              options={facet.options}
              onChange={(key, state) => setSelection((current) => withOptionState(current, facet.definition.id, key, state))}
            />
          </FilterSection>
        ))}

        {showLayouts && (
          <FilterSection title="Layout" active={hasPicks(selection.layouts)}>
            <OptionChips
              label="Layout"
              options={facets.layouts}
              onChange={(layout, state) => setSelection((current) => withOptionState(current, LAYOUT_FACET, layout, state))}
            />
          </FilterSection>
        )}

        {!hasStatblockFields && (panel.pending ? <FilterSkeleton /> : (
          <p className="atlas-filter-panel__empty">
            Link statblocks to these characters to filter them by challenge rating, type and more.
          </p>
        ))}
      </div>

      <div className="atlas-filter-panel__footer">
        {hidden && <span className="atlas-filter-panel__hidden" role="status">{hidden}</span>}
        <Button variant="ghost" className="atlas-filter-panel__reset" disabled={panel.activeCount === 0} onClick={onReset}>Reset</Button>
        <Button variant="default" className="atlas-filter-panel__done" onClick={onClose}>Done</Button>
      </div>
    </motion.div>
  );
}
