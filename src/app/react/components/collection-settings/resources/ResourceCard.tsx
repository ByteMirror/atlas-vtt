import React, { useEffect, useRef } from 'react';
import { cn } from '../../../../../utils/cn';
import { DropdownSwatchGrid } from '../../../../packages/components/primitives/DropdownSwatchGrid';
import { RESOURCE_COLORS } from '../../../../resources/resourceColors';
import type { ResourceDefinition } from '../../../../resources/resourceTypes';
import type { SocketPlace } from './resourceSockets';

interface ResourceCardProps {
  place: SocketPlace;
  resource: ResourceDefinition;
  /** Statblock fields of the collection's creatures that hold a quantity. */
  fieldSuggestions: readonly string[];
  /** The resource was just placed: its name is typed next. */
  focusName: boolean;
  onChange: (partial: Partial<ResourceDefinition>) => void;
}

/** "bar below the token" as the card's heading. */
const heading = (where: string): string => where.replace(/^./, (first) => first.toUpperCase());

/**
 * The name, statblock field and colour of the selected socket's resource. The fields found
 * in the collection's statblocks are offered to click; typing in the field narrows them.
 */
export function ResourceCard({ place, resource, fieldSuggestions, focusName, onChange }: ResourceCardProps): React.ReactElement {
  const nameRef = useRef<HTMLInputElement>(null);
  // A socket that was just filled starts with its name
  useEffect(() => {
    if (focusName) nameRef.current?.focus();
  }, [focusName, place.slot]);

  const typed = resource.field.trim().toLowerCase();
  const narrowed = fieldSuggestions.filter((field) => field.toLowerCase().includes(typed));
  // A field that is one of the suggestions narrows nothing: the others stay on offer
  const offered = fieldSuggestions.some((field) => field.toLowerCase() === typed) ? fieldSuggestions : narrowed;

  return (
    <div className="atlas-csm-resource-card">
      <div className="atlas-csm-resource-card__head">
        <span className="atlas-csm-resource-card__dot" style={{ backgroundColor: resource.color }} />
        <span>{heading(place.where)} · {place.shape === 'bar' ? 'always shown' : 'shown on hover'}</span>
      </div>
      <div className="atlas-csm-resource-card__fields">
        <label className="atlas-csm-resource-card__field">
          Name
          <input ref={nameRef} type="text" className="atlas-csm-input" placeholder="e.g. Ammo"
            aria-invalid={resource.name.trim() === '' ? true : undefined}
            value={resource.name} onChange={(event) => onChange({ name: event.target.value })} />
        </label>
        <label className="atlas-csm-resource-card__field">
          Statblock field
          <input type="text" className="atlas-csm-input" placeholder="e.g. hp" spellCheck={false}
            aria-invalid={resource.field.trim() === '' ? true : undefined}
            value={resource.field} onChange={(event) => onChange({ field: event.target.value })} />
        </label>
      </div>
      <DropdownSwatchGrid label="Colour" swatches={RESOURCE_COLORS} value={resource.color} onChange={(color) => onChange({ color })} />
      {offered.length > 0 && (
        <div className="atlas-csm-resource-card__chips" role="group" aria-label="Fields in this collection's statblocks">
          {offered.map((field) => (
            <button key={field} type="button" className={cn('atlas-csm-field-chip', field === resource.field && 'atlas-selected')}
              aria-pressed={field === resource.field} onClick={() => onChange({ field })}>
              {field}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
