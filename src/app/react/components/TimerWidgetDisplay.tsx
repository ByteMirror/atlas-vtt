import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, RotateCcw } from 'lucide-react';
import { useAtlasUI } from '../root/AtlasUIContext';
import type { TimerWidget } from '../../types/widgetTypes';
import { WidgetIconGlyph } from './WidgetIconGlyph';

interface TimerWidgetDisplayProps {
  widget: TimerWidget;
  store: any;
  isPlayerView: boolean;
  isActive: boolean;
  isPulsing: boolean;
  pulseIntensity: number;
  position: number | null;
  shortcutLabel?: string | undefined;
  isKeyHeld: boolean;
  onInteraction: (widgetId: string) => void;
}

/** Format seconds into MM:SS or H:MM:SS */
function formatTime(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = clamped % 60;

  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Parse a user-entered time string (M:SS, MM:SS, H:MM:SS, or plain minutes) into seconds */
function parseTimeInput(input: string): number | null {
  const trimmed = input.trim();

  // Try M:SS or MM:SS or H:MM:SS
  const parts = trimmed.split(':');
  if (parts.length === 2) {
    const mins = parseInt(parts[0]!, 10);
    const secs = parseInt(parts[1]!, 10);
    if (!isNaN(mins) && !isNaN(secs) && secs < 60) {
      return mins * 60 + secs;
    }
  }
  if (parts.length === 3) {
    const hrs = parseInt(parts[0]!, 10);
    const mins = parseInt(parts[1]!, 10);
    const secs = parseInt(parts[2]!, 10);
    if (!isNaN(hrs) && !isNaN(mins) && !isNaN(secs) && mins < 60 && secs < 60) {
      return hrs * 3600 + mins * 60 + secs;
    }
  }

  // Raw digits without colon → interpret as MMSS / MSS / SS / M
  // e.g. "0200" → 02:00, "0020" → 00:20, "0002" → 00:02, "130" → 1:30, "5" → 5:00
  if (/^\d+$/.test(trimmed)) {
    if (trimmed.length >= 3) {
      // Last two digits are seconds, rest are minutes
      const secStr = trimmed.slice(-2);
      const minStr = trimmed.slice(0, -2);
      const mins = parseInt(minStr, 10);
      const secs = parseInt(secStr, 10);
      if (secs < 60) {
        return mins * 60 + secs;
      }
    }
    // 1-2 digits → treat as minutes
    const asNum = parseInt(trimmed, 10);
    if (!isNaN(asNum) && asNum >= 0) {
      return asNum * 60;
    }
  }

  return null;
}

export function TimerWidgetDisplay({
  widget,
  store,
  isPlayerView,
  isActive,
  isPulsing,
  pulseIntensity,
  position,
  shortcutLabel,
  isKeyHeld,
  onInteraction,
}: TimerWidgetDisplayProps): React.ReactElement | null {
  const { view } = useAtlasUI();
  const [isRunning, setIsRunning] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isExpired, setIsExpired] = useState(false);
  const intervalRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const expireTimeoutRef = useRef<number | null>(null);

  const remainingSeconds = (widget.value) ?? 0;
  const duration = widget.duration ?? 300; // default 5 min

  // Clean up interval on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      if (expireTimeoutRef.current) window.clearTimeout(expireTimeoutRef.current);
    };
  }, []);

  // Tick logic
  useEffect(() => {
    if (!isRunning) {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = window.setInterval(() => {
      const state = store.getState();
      const currentWidget = state.widgetSettings?.widgets?.[widget.id] as TimerWidget | undefined;
      const current = (currentWidget?.value as number) ?? 0;

      if (current <= 1) {
        // Timer expired
        window.clearInterval(intervalRef.current!);
        intervalRef.current = null;
        store.getState().updateWidget(widget.id, { value: 0 });
        setIsRunning(false);
        setIsExpired(true);

        // Play ding sound
        const soundService = view?.serviceManager?.getSoundEffectService?.();
        soundService?.playTimerDing();

        // Clear expired flash after 3 seconds
        expireTimeoutRef.current = window.setTimeout(() => setIsExpired(false), 3000);
      } else {
        store.getState().updateWidget(widget.id, { value: current - 1 });
      }
    }, 1000);

    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isRunning, store, widget.id, view]);

  const handlePlayPause = useCallback((): void => {
    onInteraction(widget.id);
    if (remainingSeconds <= 0 && !isRunning) {
      // Reset to duration before starting
      store.getState().updateWidget(widget.id, { value: duration });
    }
    setIsRunning(prev => !prev);
    setIsExpired(false);
  }, [widget.id, remainingSeconds, isRunning, duration, store, onInteraction]);

  const handleReset = useCallback((): void => {
    onInteraction(widget.id);
    setIsRunning(false);
    setIsExpired(false);
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    store.getState().updateWidget(widget.id, { value: duration });
  }, [widget.id, duration, store, onInteraction]);

  const handleTimeClick = useCallback((): void => {
    if (isPlayerView || isRunning) return;
    onInteraction(widget.id);
    setIsEditing(true);
  }, [isPlayerView, isRunning, widget.id, onInteraction]);

  const commitEdit = useCallback((save: boolean): void => {
    if (save && inputRef.current) {
      const seconds = parseTimeInput(inputRef.current.value);
      if (seconds !== null && seconds > 0) {
        store.getState().updateWidget(widget.id, {
          value: seconds,
          duration: seconds,
        });
      }
    }
    setIsEditing(false);
  }, [store, widget.id]);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const widgetClasses = [
    'atlas-widget',
    'atlas-widget-timer',
    isActive ? 'widget-active' : '',
    isPulsing ? `widget-pulse pulse-intensity-${pulseIntensity}` : '',
    isKeyHeld ? 'widget-key-held' : '',
    isRunning ? 'timer-running' : '',
    isExpired ? 'timer-expired' : '',
  ].filter(Boolean).join(' ');

  const color = widget.color || '#4caf50';

  return (
    <div
      className={widgetClasses}
      style={{ '--widget-color': color, '--pulse-intensity': pulseIntensity } as React.CSSProperties}
    >
      <div className="atlas-widget-icon-wrapper">
        <WidgetIconGlyph icon={widget.icon} />
      </div>

      <div className="atlas-widget-content">
        <div className="atlas-widget-value-row">
          {/* GM-only controls: play/pause */}
          {!isPlayerView && (
            <button
              onClick={handlePlayPause}
              className="atlas-timer-btn"
              title={isRunning ? 'Pause' : 'Start'}
            >
              {isRunning ? <Pause /> : <Play />}
            </button>
          )}

          {/* Time display / edit */}
          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              className="atlas-timer-edit-input"
              defaultValue={formatTime(duration)}
              placeholder="MM:SS"
              onBlur={() => commitEdit(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitEdit(true);
                if (e.key === 'Escape') commitEdit(false);
              }}
            />
          ) : (
            <span
              className={`atlas-timer-display ${!isPlayerView && !isRunning ? 'editable' : ''}`}
              onClick={handleTimeClick}
            >
              {formatTime(remainingSeconds)}
            </span>
          )}

          {/* GM-only controls: reset */}
          {!isPlayerView && (
            <button
              onClick={handleReset}
              className="atlas-timer-btn"
              title="Reset"
            >
              <RotateCcw />
            </button>
          )}
        </div>

        <div className="atlas-widget-label">
          <span className="atlas-widget-label-text">{widget.label}</span>
          {position && (
            <span className="atlas-widget-shortcut">{shortcutLabel ?? position}</span>
          )}
        </div>
      </div>
    </div>
  );
}
