import React, { FC } from "react"
import { Check } from "lucide-react"
import { Button } from "./button"

export interface DropdownMenuItemProps {
  icon: React.ComponentType<{ className?: string }>
  label: string
  shortcut?: string
  isActive?: boolean
  destructive?: boolean
  onClick: () => void
}

export const DropdownMenuItem: FC<DropdownMenuItemProps> = ({
  icon: Icon,
  label,
  shortcut,
  isActive = false,
  destructive = false,
  onClick,
}) => {
  if (destructive) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="atlas-dropdown-btn--destructive w-full flex items-center justify-center gap-2"
        onClick={onClick}
      >
        <Icon className="h-4 w-4" />
        <span>{label}</span>
      </Button>
    )
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="atlas-dropdown-menu-item"
      onClick={onClick}
    >
      <span className="atlas-dropdown-menu-item__check">
        {isActive && <Check className="h-4 w-4" />}
      </span>
      <Icon className="h-4 w-4" />
      <span>{label}</span>
      {shortcut && <span className="atlas-dropdown-menu-item__shortcut">{shortcut}</span>}
    </Button>
  )
}
