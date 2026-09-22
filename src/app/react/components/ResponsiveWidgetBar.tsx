import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useStore } from 'zustand';
import { useMapHotkeys, useAtlasSettings, useHotkeyLabels } from '../../keyboard/useMapHotkeys';
import { canRunMapHotkeys, matchesMapHotkey } from '../../keyboard/mapHotkeys';
import type { WidgetSyncService, WidgetAnimationType, WidgetAnimationPayloads } from '../../services/WidgetSyncService';
import type { ViewAtlasStore } from '../../storeFactory';
import type { AnyWidget } from '../../types/widgetTypes';
import { TimerWidgetDisplay } from './TimerWidgetDisplay';
import { CounterWidgetDisplay, stepCounter } from './CounterWidgetDisplay';

interface ResponsiveWidgetBarProps {
  isPlayerView?: boolean;
  store: ViewAtlasStore;
  viewId?: string;
  widgetSyncService?: WidgetSyncService;
}

export function ResponsiveWidgetBar({ isPlayerView = false, store, viewId, widgetSyncService }: ResponsiveWidgetBarProps) {
  const settings = useAtlasSettings();
  const hotkeyLabel = useHotkeyLabels();
  // Initialize all refs first
  const componentId = useRef(viewId || `widget-bar-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`).current;
  const timeoutRef = useRef<number | null>(null);
  const heldKeys = useRef<Set<string>>(new Set());
  const heldCodes = useRef(new Map<string, number>());
  const pulseTimeouts = useRef<Map<string, number>>(new Map());
  const pulseIntensity = useRef<Map<string, number>>(new Map());
  
  // Select only what this component renders so drag ticks and selection
  // changes elsewhere in the store do not re-render the widget bar.
  const storedWidgetSettings = useStore(store, (state) => state.widgetSettings);
  const [isActive, setIsActive] = useState(true);
  const [activeWidgets, setActiveWidgets] = useState<Set<string>>(new Set());
  const [pulsingWidgets, setPulsingWidgets] = useState<Set<string>>(new Set());
  const [heldNumberKeys, setHeldNumberKeys] = useState<Set<number>>(new Set());
  
  // Reset timer for active state
  const resetActiveTimer = useCallback(() => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
    }
    
    setIsActive(true);
    // Broadcast widget bar active state
    if (widgetSyncService) {
      widgetSyncService.broadcastWidgetAnimation(componentId, 'active', 'widget-bar', { isActive: true });
    }
    
    timeoutRef.current = window.setTimeout(() => {
      setIsActive(false);
      // Broadcast widget bar passive state
      if (widgetSyncService) {
        widgetSyncService.broadcastWidgetAnimation(componentId, 'active', 'widget-bar', { isActive: false });
      }
    }, 4000);
  }, [componentId, widgetSyncService]);
  
  // Helper to broadcast animations
  const broadcastAnimation = useCallback(<T extends WidgetAnimationType>(animationType: T, widgetId: string, data?: WidgetAnimationPayloads[T]): void => {
    if (widgetSyncService) {
      widgetSyncService.broadcastWidgetAnimation(componentId, animationType, widgetId, data);
    }
  }, [widgetSyncService, componentId]);
  
  // Handle any interaction
  const handleInteraction = useCallback((widgetId?: string) => {
    resetActiveTimer();
    
    if (widgetId) {
      setActiveWidgets(prev => new Set(prev).add(widgetId));
      // Broadcast active state
      broadcastAnimation('active', widgetId, { duration: 150 });
      
      window.setTimeout(() => {
        setActiveWidgets(prev => {
          const next = new Set(prev);
          next.delete(widgetId);
          return next;
        });
      }, 150);
    }
  }, [resetActiveTimer, broadcastAnimation]);
  
  
  
  // Trigger pulse animation with stacking intensity
  const triggerPulse = useCallback((widgetId: string) => {
    // Clear existing timeout if any
    const existingTimeout = pulseTimeouts.current.get(widgetId);
    if (existingTimeout) {
      window.clearTimeout(existingTimeout);
    }
    
    // Increase intensity for rapid clicks (max 3)
    const currentIntensity = pulseIntensity.current.get(widgetId) || 0;
    const newIntensity = Math.min(currentIntensity + 1, 3);
    pulseIntensity.current.set(widgetId, newIntensity);
    
    // Add to pulsing widgets
    setPulsingWidgets(prev => new Set(prev).add(widgetId));
    
    // Broadcast the pulse animation
    broadcastAnimation('pulse', widgetId, { intensity: newIntensity });
    
    // Set new timeout
    const timeout = window.setTimeout(() => {
      setPulsingWidgets(prev => {
        const next = new Set(prev);
        next.delete(widgetId);
        return next;
      });
      pulseTimeouts.current.delete(widgetId);
      pulseIntensity.current.delete(widgetId);
    }, 150);
    
    pulseTimeouts.current.set(widgetId, timeout);
  }, [broadcastAnimation]);
  
  // Initialize with active state
  useEffect(() => {
    resetActiveTimer();
    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, [resetActiveTimer]);
  
  // Listen for animation events from other views
  useEffect(() => {
    if (!widgetSyncService) {
      return;
    }
    
    const unsubscribe = widgetSyncService.subscribeToAnimations(componentId, (animationState) => {
      const { animationType, widgetId, data } = animationState;
      
      switch (animationType) {
        case 'pulse':
          // Trigger pulse animation
          setPulsingWidgets(prev => new Set(prev).add(widgetId));
          if (data?.intensity) {
            pulseIntensity.current.set(widgetId, data.intensity);
          }
          window.setTimeout(() => {
            setPulsingWidgets(prev => {
              const next = new Set(prev);
              next.delete(widgetId);
              return next;
            });
            pulseIntensity.current.delete(widgetId);
          }, 150);
          break;
          
        case 'active':
          // Handle widget bar active/passive state
          if (widgetId === 'widget-bar' && data?.isActive !== undefined) {
            setIsActive(data.isActive);
            // Reset timer without broadcasting (to avoid infinite loop)
            if (data.isActive && timeoutRef.current) {
              window.clearTimeout(timeoutRef.current);
              timeoutRef.current = window.setTimeout(() => {
                setIsActive(false);
                // Don't broadcast here - let the original view handle it
              }, 4000);
            }
          } else {
            // Show active state for individual widgets
            setActiveWidgets(prev => new Set(prev).add(widgetId));
            if (data?.duration) {
              window.setTimeout(() => {
                setActiveWidgets(prev => {
                  const next = new Set(prev);
                  next.delete(widgetId);
                  return next;
                });
              }, data.duration);
            }
          }
          break;
          
        case 'key-held':
          // Update held keys display
          if (data?.keyNumber !== undefined) {
            if (data.held) {
              setHeldNumberKeys(prev => new Set(prev).add(data.keyNumber));
            } else {
              setHeldNumberKeys(prev => {
                const next = new Set(prev);
                next.delete(data.keyNumber);
                return next;
              });
            }
          }
          break;
      }
    });
    
    return unsubscribe;
  }, [componentId, widgetSyncService]);
  
  // Keyboard shortcut tracking
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!canRunMapHotkeys(e, viewId)) return;
      const num = ([1, 2, 3, 4, 5] as const).find(n => matchesMapHotkey(e, `widget${n}`, settings));
      if (!num) return;
      e.preventDefault();
      heldKeys.current.add(String(num));
      heldCodes.current.set(e.code || e.key, num);
      handleInteraction();
      setHeldNumberKeys(prev => new Set(prev).add(num));
      broadcastAnimation('key-held', 'number-key', { keyNumber: num, held: true });
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const num = heldCodes.current.get(e.code || e.key);
      if (!num) return;
      heldCodes.current.delete(e.code || e.key);
      heldKeys.current.delete(String(num));
      setHeldNumberKeys(prev => { const next = new Set(prev); next.delete(num); return next; });
      broadcastAnimation('key-held', 'number-key', { keyNumber: num, held: false });
    };

    const handleBlur = () => {
      heldKeys.current.clear();
      heldCodes.current.clear();
      // Clear all possible held keys (1-5)
      for (let i = 1; i <= 5; i++) {
        broadcastAnimation('key-held', 'number-key', { keyNumber: i, held: false });
      }
      setHeldNumberKeys(new Set());
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [handleInteraction, broadcastAnimation, settings, viewId]);
  
  const visibleWidgets: AnyWidget[] = Object.values<AnyWidget>(storedWidgetSettings?.widgets ?? {})
    .filter((widget) => widget.visible && (!isPlayerView || widget.visibleToPlayers))
    .sort((a, b) => a.order - b.order);
  const visibleWidgetsRef = useRef(visibleWidgets);
  visibleWidgetsRef.current = visibleWidgets;

  const handleCounterValueChange = useCallback((widgetId: string) => {
    triggerPulse(widgetId);
    handleInteraction();
  }, [triggerPulse, handleInteraction]);

  // Hold 1-5 and press +/- to step the counter at that position
  const stepHeldWidget = (delta: number): void => {
    for (let i = 1; i <= 5; i++) {
      if (!heldKeys.current.has(String(i))) continue;
      const target = visibleWidgetsRef.current[i - 1];
      if (target?.type === 'counter') {
        stepCounter(store, target.id, delta);
        handleInteraction(target.id);
      }
      break;
    }
  };

  useMapHotkeys({
    increase: () => stepHeldWidget(1),
    increaseAlt: () => stepHeldWidget(1),
    decrease: () => stepHeldWidget(-1),
  }, viewId);

  // For player view, always show widgets regardless of globalVisible setting
  if (!isPlayerView && storedWidgetSettings?.globalVisible === false) {
    return null;
  }
  if (visibleWidgets.length === 0) {
    return null;
  }

  return (
    <div
      onMouseEnter={() => handleInteraction()}
      onMouseLeave={resetActiveTimer}
      className={`atlas-widget-bar atlas-widget-bar-top ${isActive ? 'active' : 'passive'}`}
    >
      <div className="atlas-widget-container">
        {visibleWidgets.map((widget, index) => {
          const position = index < 5 ? index + 1 : null;
          const shared = {
            store,
            isActive: activeWidgets.has(widget.id),
            isPulsing: pulsingWidgets.has(widget.id),
            pulseIntensity: pulseIntensity.current.get(widget.id) || 1,
            position,
            shortcutLabel: position ? hotkeyLabel(`widget${position as 1 | 2 | 3 | 4 | 5}`) : undefined,
            isKeyHeld: !!position && heldNumberKeys.has(position),
            onInteraction: handleInteraction,
          };
          if (widget.type === 'timer') {
            return <TimerWidgetDisplay key={widget.id} widget={widget} isPlayerView={isPlayerView} {...shared} />;
          }
          return <CounterWidgetDisplay key={widget.id} widget={widget} onValueChange={handleCounterValueChange} {...shared} />;
        })}
      </div>
    </div>
  );
}
