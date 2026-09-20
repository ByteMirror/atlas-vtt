import * as React from 'react';
import { X } from 'lucide-react';
import { Button, type ButtonProps } from './button';
import { cn } from '../../../../utils/cn';

export type CloseButtonProps = Omit<ButtonProps, 'variant' | 'size' | 'children'>;

/**
 * The one close control for modals, panels and popovers.
 * Ghost icon button at the standard control height so every "×" in the plugin
 * has the same size, hit area and hover treatment.
 */
export const CloseButton = React.forwardRef<HTMLButtonElement, CloseButtonProps>(
  ({ className, 'aria-label': ariaLabel = 'Close', title, ...props }, ref) => (
    <Button
      ref={ref}
      type="button"
      variant="ghost"
      size="icon"
      className={cn('atlas-close-btn', className)}
      aria-label={ariaLabel}
      title={title ?? ariaLabel}
      {...props}
    >
      <X />
    </Button>
  ),
);

CloseButton.displayName = 'CloseButton';
