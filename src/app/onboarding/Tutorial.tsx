import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../packages/components/primitives/button';
import { useAtlasSettings } from '../keyboard/useMapHotkeys';
import type { SettingsService, TutorialId } from '../services/SettingsService';
import { useDialogFocus } from './useDialogFocus';

export interface TutorialStep { title: string; body: string; selector?: string }
interface TutorialProps {
  settings?: SettingsService;
  id: TutorialId;
  steps: TutorialStep[];
  action?: { label: string; onClick: () => void };
}
export function Tutorial(props: TutorialProps): React.JSX.Element | null {
  const settings = useAtlasSettings(props.settings);
  if (!settings?.shouldShowTutorial(props.id)) return null;
  return <TutorialCard {...props} settings={settings} />;
}
function TutorialCard({ settings, id, steps, action }: TutorialProps & { settings: SettingsService }): React.JSX.Element {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const bodyId = useId();
  const step = steps[index]!;
  const finish = useCallback(() => settings.completeTutorial(id), [settings, id]);
  useDialogFocus(card, finish);
  useEffect(() => {
    const measure = (): void => {
      const target = step.selector ? document.querySelector(step.selector) : null;
      const bounds = target?.getBoundingClientRect();
      setRect(bounds && bounds.width && bounds.height ? bounds : null);
    };
    measure();
    // Follow the asset manager's entrance and resizes without assuming a fixed layout.
    const timer = window.setInterval(measure, 200);
    window.addEventListener('resize', measure);
    return () => { window.clearInterval(timer); window.removeEventListener('resize', measure); };
  }, [step.selector]);
  const width = Math.min(360, window.innerWidth - 32);
  const height = card.current?.offsetHeight ?? 240;
  const placement: React.CSSProperties = rect ? {
    width,
    left: Math.max(16, Math.min(rect.left, window.innerWidth - width - 16)),
    top: Math.max(16, Math.min(rect.bottom + 16 + height < window.innerHeight ? rect.bottom + 16 : rect.top - height - 16, window.innerHeight - height - 16)),
  } : { width, left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };
  return createPortal(
    <div className="atlas-vtt-plugin atlas-vtt-root atlas-onboarding-overlay">
      {rect ? <div className="atlas-onboarding-spotlight" style={{ left: rect.left - 4, top: rect.top - 4, width: rect.width + 8, height: rect.height + 8 }} /> : <div className="atlas-onboarding-dimmer" />}
      <div ref={card} className="atlas-onboarding-card" style={placement} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={bodyId}>
        <div className="atlas-onboarding-content">
          <div className="atlas-onboarding-eyebrow">Getting started · {index + 1} / {steps.length}</div>
          <h3 id={titleId}>{step.title}</h3>
          <p id={bodyId}>{step.body}</p>
        </div>
        <div className="atlas-onboarding-actions">
          <Button variant="ghost" onClick={finish}>Skip</Button>
          <div className="atlas-onboarding-actions-end">
            {index > 0 && <Button variant="ghost" onClick={() => setIndex(index - 1)}>Back</Button>}
            {index < steps.length - 1 ? <Button onClick={() => setIndex(index + 1)}>Next</Button> :
              <Button onClick={() => { finish(); action?.onClick(); }}>{action?.label ?? 'Got it'}</Button>}
          </div>
        </div>
      </div>
    </div>, document.body,
  );
}
