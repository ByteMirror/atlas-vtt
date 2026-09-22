import * as React from 'react';
import { X } from 'lucide-react';
import { Button, type ButtonProps } from './button';
import { LabelTooltip } from './tooltip';
import { cn } from '../../../../utils/cn';

export type CloseButtonProps = Omit<ButtonProps, 'variant' | 'size' | 'children'>;

/**
 * The one close control for modals, panels and popovers.
 * Ghost icon button at the standard control height so every "×" in the plugin
 * has the same size, hit area and hover treatment.
 */
export const CloseButton = React.forwardRef<HTMLButtonElement, CloseButtonProps>(
  ({ className, 'aria-label': ariaLabel = 'Close', title, ...props }, ref) => (
    <LabelTooltip label={title ?? ariaLabel}>
      <Button
        ref={ref}
        type="button"
        variant="ghost"
        size="icon"
        className={cn('atlas-close-btn', className)}
        {...props}
      >
        <X />
      </Button>
    </LabelTooltip>
  ),
);

CloseButton.displayName = 'CloseButton';
