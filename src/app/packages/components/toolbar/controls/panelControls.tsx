import React from "react"
import { Command, Dices, ImageIcon } from "lucide-react"
import { CoinIcon } from "../../../../react/components/CoinIcon"
import { DiceDropdownMenu } from "../../../../react/components/dice/DiceDropdownMenu"
import { ToolButton } from "../../primitives/ToolButton"
import { buttonItem } from "../toolbarItems"
import type { ToolbarControl } from "../toolbarControl"

/** Panels and windows the toolbar opens; none of them pins, since they float on their own. */
export const PANEL_CONTROLS: ToolbarControl[] = [
  {
    id: 'dice', priority: 75, dmOnly: false, available: true,
    item: ({ dice, hotkeyLabel }) => ({
      // The dice tray hangs from this button.
      pinned: dice.open,
      element: (
        <div ref={dice.buttonRef} className="relative flex items-center">
          <ToolButton icon={Dices} label="Roll Dice" shortcut={hotkeyLabel('diceTray')} isActive={dice.open} onClick={dice.toggle} />
          {dice.tool && (
            <DiceDropdownMenu diceTool={dice.tool} isOpen={dice.open} onToggle={dice.toggle} triggerRef={dice.buttonRef} />
          )}
        </div>
      ),
      menuEntry: { icon: Dices, label: "Roll Dice", shortcut: hotkeyLabel('diceTray'), isActive: dice.open, onSelect: dice.toggle },
    }),
  },
  {
    id: 'loot', priority: 45, dmOnly: true, available: true,
    item: ({ loot, hotkeyLabel }) => buttonItem({
      icon: CoinIcon, label: "Loot Roller", shortcut: hotkeyLabel('lootRoller'),
      isActive: loot.open, pinned: false, onClick: () => loot.setOpen(!loot.open),
    }),
  },
  {
    id: 'assets', priority: 80, dmOnly: true, available: true,
    item: ({ assets, hotkeyLabel }) => buttonItem({
      icon: ImageIcon, label: "Asset Manager", shortcut: hotkeyLabel('assets'),
      isActive: assets.open, pinned: false, onClick: assets.openManager,
    }),
  },
  {
    id: 'palette', priority: 55, dmOnly: true, available: true,
    item: ({ palette, hotkeyLabel }) => buttonItem({
      icon: Command, label: "Command Palette", shortcut: hotkeyLabel('palette'),
      isActive: palette.open, pinned: false, onClick: () => palette.setOpen(!palette.open),
    }),
  },
]
