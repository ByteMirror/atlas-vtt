import React, { useState } from 'react';
import { ChevronDown, Eye, EyeOff, Pencil, Plus, Swords, Trash2, Users } from 'lucide-react';
import { cn } from '../../../../utils/cn';
import { Button } from '../../../packages/components/primitives/button';
import type { AnyWidget } from '../../../types/widgetTypes';
import { WidgetIconGlyph } from '../WidgetIconGlyph';
import { SettingToggleRow } from './SettingRows';
import { WidgetEditorForm, type WidgetDraft } from './WidgetEditorForm';

interface WidgetSettingsPanelProps {
  widgetSettings: any;
  setWidgetSettings: (settings: any) => void;
  updateWidget: (id: string, updates: any) => void;
  addWidget: (widget: any) => void;
  removeWidget: (widgetId: string) => void;
  sortedWidgets: any[];
  initiative: any;
  setInitiativeConfig: (config: any) => void;
  initiativeTrackerOpen: boolean;
  setInitiativeTrackerOpen: (open: boolean) => void;
}

const DEFAULT_TIMER_SECONDS = 300;

export const WidgetSettingsPanel = React.memo(function WidgetSettingsPanel({
  widgetSettings,
  setWidgetSettings,
  updateWidget,
  addWidget,
  removeWidget,
  sortedWidgets,
  initiative,
  setInitiativeConfig,
  initiativeTrackerOpen,
  setInitiativeTrackerOpen,
}: WidgetSettingsPanelProps): React.ReactElement {
  const [initiativeExpanded, setInitiativeExpanded] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const globalVisible: boolean =
    typeof widgetSettings?.globalVisible === 'boolean' ? widgetSettings.globalVisible : true;
  const autoSort: boolean = initiative?.config?.autoSort ?? true;

  const toggleGlobalVisible = (): void => {
    const currentSettings = widgetSettings || { globalVisible: true };
    const currentState = typeof currentSettings.globalVisible === 'boolean' ? currentSettings.globalVisible : true;
    setWidgetSettings({ ...currentSettings, globalVisible: !currentState });
  };

  const editingWidget: AnyWidget | undefined = sortedWidgets.find((widget) => widget.id === editingId);
  const editorOpen = isAdding || !!editingWidget;

  const closeEditor = (): void => {
    setIsAdding(false);
    setEditingId(null);
  };

  const handleSubmit = (draft: WidgetDraft): void => {
    if (editingWidget) {
      updateWidget(editingWidget.id, { label: draft.label, icon: draft.icon, color: draft.color });
    } else {
      const base = {
        id: `${draft.type}-${Date.now()}`,
        label: draft.label,
        icon: draft.icon,
        color: draft.color,
        visible: true,
        visibleToPlayers: true,
        order: sortedWidgets.length,
      };
      addWidget(
        draft.type === 'timer'
          ? { ...base, type: 'timer', value: DEFAULT_TIMER_SECONDS, duration: DEFAULT_TIMER_SECONDS, direction: 'down' }
          : { ...base, type: 'counter', value: 0 },
      );
    }
    closeEditor();
  };

  return (
    <div className="atlas-command-palette-panel">
      <div className="atlas-command-palette-panel-column">
        <SettingToggleRow label="Show all widgets" value={globalVisible} onToggle={toggleGlobalVisible} />

        <div className="atlas-command-palette-collapsible">
          <button
            type="button"
            className="atlas-command-palette-collapsible-header"
            onClick={() => setInitiativeExpanded(!initiativeExpanded)}
            aria-expanded={initiativeExpanded}
          >
            <span className="atlas-command-palette-collapsible-title">
              <Swords />
              <span>Initiative tracker</span>
            </span>
            <ChevronDown className={cn('atlas-command-palette-collapsible-chevron', initiativeExpanded && 'atlas-open')} />
          </button>

          {initiativeExpanded && (
            <div className="atlas-command-palette-collapsible-content">
              <SettingToggleRow
                label="Show initiative tracker"
                value={initiativeTrackerOpen}
                onToggle={() => setInitiativeTrackerOpen(!initiativeTrackerOpen)}
              />
              <SettingToggleRow
                label="Auto-sort by initiative"
                value={autoSort}
                onToggle={() => setInitiativeConfig({ autoSort: !autoSort })}
              />
            </div>
          )}
        </div>
      </div>

      <div className="atlas-command-palette-panel-column">
        {editorOpen ? (
          <div className="atlas-setting-group">
            <span className="atlas-setting-label">{editingWidget ? 'Edit widget' : 'New widget'}</span>
            <WidgetEditorForm
              key={editingWidget?.id ?? 'new'}
              {...(editingWidget ? { initial: editingWidget } : {})}
              submitLabel={editingWidget ? 'Save' : 'Add widget'}
              onSubmit={handleSubmit}
              onCancel={closeEditor}
            />
          </div>
        ) : (
        <div className="atlas-setting-group">
          <div className="atlas-setting-group atlas-setting-group--row">
            <span className="atlas-setting-label">Widgets</span>
            <Button
              variant="ghost"
              size="icon"
              className="atlas-command-palette-icon-btn"
              onClick={() => setIsAdding(true)}
              title="Add widget"
              aria-label="Add widget"
            >
              <Plus />
            </Button>
          </div>
          {sortedWidgets.length === 0 && (
            <span className="atlas-setting-hint">No widgets yet. Add a counter or timer with the plus button.</span>
          )}
          <div className="atlas-command-palette-widget-list">
            {sortedWidgets.map((widget) => (
              <div key={widget.id} className="atlas-command-palette-widget-item">
                <WidgetIconGlyph icon={widget.icon} size={20} color={widget.color} />
                <div className="atlas-command-palette-widget-info">
                  <div className="atlas-command-palette-widget-name">{widget.label}</div>
                  <div className="atlas-command-palette-widget-type">{widget.type}</div>
                </div>
                <div className="atlas-command-palette-widget-controls">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="atlas-command-palette-icon-btn"
                    onClick={() => setEditingId(widget.id)}
                    title="Edit name and icon"
                    aria-label="Edit name and icon"
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn('atlas-command-palette-icon-btn', widget.visible && 'atlas-active')}
                    onClick={() => updateWidget(widget.id, { visible: !widget.visible })}
                    title={widget.visible ? 'Hide widget' : 'Show widget'}
                    aria-label={widget.visible ? 'Hide widget' : 'Show widget'}
                    aria-pressed={widget.visible}
                  >
                    {widget.visible ? <Eye /> : <EyeOff />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn('atlas-command-palette-icon-btn', widget.visibleToPlayers && 'atlas-active')}
                    onClick={() => updateWidget(widget.id, { visibleToPlayers: !widget.visibleToPlayers })}
                    title={widget.visibleToPlayers ? 'Hide from players' : 'Show to players'}
                    aria-label={widget.visibleToPlayers ? 'Hide from players' : 'Show to players'}
                    aria-pressed={widget.visibleToPlayers}
                  >
                    <Users />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="atlas-command-palette-icon-btn atlas-icon-btn--danger"
                    onClick={() => removeWidget(widget.id)}
                    title="Delete widget"
                    aria-label="Delete widget"
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
            ))}
          </div>

        </div>
        )}
      </div>
    </div>
  );
});
