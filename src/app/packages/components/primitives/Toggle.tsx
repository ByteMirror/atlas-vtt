import React, { FC } from "react"
import { Check, X } from "lucide-react"
import { cn } from "src/utils/cn"
import { Tooltip, TooltipTrigger, TooltipContent } from "./tooltip"

export interface ToggleProps {
  /** Current toggle state (on=true, off=false) */
  value: boolean
  /** Callback when user toggles */
  onChange: () => void
  /** Icon to show when value is true */
  iconOn?: React.ComponentType<React.SVGProps<SVGSVGElement>>
  /** Icon to show when value is false */
  iconOff?: React.ComponentType<React.SVGProps<SVGSVGElement>>
  /** Tooltip text when toggle is true */
  tooltipOn: string
  /** Tooltip text when toggle is false */
  tooltipOff: string
  /** Optional wrapper className */
  className?: string
}

export const Toggle: FC<ToggleProps> = ({
  value,
  onChange,
  iconOn: IconOn = Check,
  iconOff: IconOff = X,
  tooltipOn,
  tooltipOff,
  className,
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <div className={cn("atlas-toggle", className)} onClick={onChange}>
        <div className={value ? "atlas-toggle__switch atlas-toggle__switch--on" : "atlas-toggle__switch atlas-toggle__switch--off"}>
          <div className={value ? "atlas-toggle__thumb atlas-toggle__thumb--on" : "atlas-toggle__thumb atlas-toggle__thumb--off"}>
            {value ? (
              <IconOn className="atlas-toggle__icon" />
            ) : (
              <IconOff className="atlas-toggle__icon" />
            )}
          </div>
        </div>
      </div>
    </TooltipTrigger>
    <TooltipContent
      side="top"
      sideOffset={10}
      className="border-[var(--background-modifier-border)] bg-[var(--background-secondary)] text-[var(--text-normal)]"
    >
      <p>{value ? tooltipOn : tooltipOff}</p>
    </TooltipContent>
  </Tooltip>
) 
