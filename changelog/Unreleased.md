## New

- Dynamic lighting. Switch it on per scene from the new Lighting tool and pick the time of day, from daylight to pitch black. Players see only what their tokens can see: walls always block their line of sight, and in the dark they see only what light reaches.
- Place candles, torches, lanterns and magical lights on the map, or hand one to a token from its right-click menu so it moves with the token. Light never passes a wall, flames cast soft shadows that widen with the flame's size, light bounces softly off floors and walls, and each flame glows and flickers.
- Give tokens vision from their right-click menu, and set a sight range and darkvision in Edit Token. Darkvision shows the dark in grey.
- Give a token a vision cone in Edit Token, from a narrow beam to a wide sweep. It faces the way the token is turned, and the edges of the cone are sharp.
- Give a token tremorsense. Players see tokens within its range through walls and in the dark, but not the map itself.
- Set a default vision per collection, in a new Vision tab of the collection settings: sight range, darkvision, tremorsense and cone. Tokens you place from the library start with it, with vision still switched off, and a game system can bring its own defaults.
- Open Lighting settings from the lighting menu to adjust a scene: switch token vision off so players see everything the light shows, stop remembering explored areas (what was already explored comes back when you switch it on again), pick the colours of explored and unexplored areas, and choose from which brightness a scene counts as lit.
- Tint a scene's ambient light with the colour swatch next to the Ambient light slider in the lighting menu.
- Areas the players have explored stay on their screen, dim and grey, and are saved with the scene. Forget them from the Lighting tool's menu.
- The GM sees the whole map with its lighting. Hold H, or switch on Preview player view, to see exactly what the players see.
- Open and close doors by clicking the door badges, with any tool.
- Double-click a light, or right-click it, to change its kind, colour, range, brightness, softness and flicker.
- Cairn is a built-in game system preset, with 5-foot squares and its conditions: Deprived, Fatigue, Critical Damage, Paralyzed, Delirious and Fleeing

## Improved

- Large token imports are much faster. 1,000 tokens from Fantasy Statblocks now take about 40 seconds instead of 11 minutes, and imports of thousands of tokens no longer slow down as they go
- The token creator and the Fantasy Statblocks list stay smooth with thousands of images
- Statblocks that share one image read and convert it only once
- In the GM view, every light shines at full strength and a faint icon marks every light; areas no token sees are shown slightly faded instead of dimmed
- Maps with flickering lights no longer keep the graphics card busy while nothing moves
- An open player window costs far less: the GM view stays smooth on large maps with lighting, and nothing is drawn for the players while nothing changes

## Fixed

- Collections can be deleted again when some of their files were already removed outside Obsidian, for example by git
- Edit Token opens again instead of crashing on its Vision switch
