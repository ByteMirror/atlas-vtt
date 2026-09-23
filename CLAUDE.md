# Context
- We are working on Atlas VTT, a Virtual Tabletop plugin for Obsidian.md
- **IMPORTANT**: We use PIXI.js v8 (not v7). Obsidian bundles PIXI v7 globally, but we must use our own PIXI v8 imports.

# Coding pattern preferences
- Adhere to the single responsibility principle SOC
- always prefer best practice solutions
- Avoid duplication of code whenever possible, which means checking for
other areas of the codebase that might already have similar code and
functionality
- Before you code anything with PixiJS or alter Pixi code always check online first if you are adhering to the newest pixiJS V8 best practices.
- If you believe that you would benefit from up to date information on some framework when e.g fixing a warning about PixiJS v8, please just use web search without asking.
- You are careful to only make changes that are requested or you are
confident are well understood and related to the change being requested
- When fixing an issue or bug, do not introduce a new pattern or
technology without first exhausting all options for the existing
implementation. And if you finally do this, make sure to remove the old
ipmlementation afterwards so we don't have duplicate logic.
- Keep the codebase very clean and organized
- Avoid writing scripts in files if possible, egpecially if the script
is likely only to be run once
- Avoid having files over 200-300 lines of code. Refactor at that point.
- Mocking data is only needed for actual test files, never mock data otherwise
- Never add stubbing or fake data patterns to code 
- In Typescript always type out return types in functions to make onboarding new team members easier and to provide clearer intentions 
- Prefer SCSS classes and Obsidian native styles (see obsidian-colors.md). Tailwind utilities exist in older components and are scoped under `.atlas-vtt-plugin`; do not add new Tailwind usage.

# UI Design Principles
- **Uniform padding**: Every container must use equal padding on all sides and the same value for gaps between child elements. A tooltip, modal, or toolbar with `padding: 8px` must also use `gap: 8px` between its children. Never use asymmetric padding (e.g. `6px 12px`) unless there is an explicit, justified reason.
- **Consistent stroke/border style**: All elevated surfaces (toolbars, tooltips, modals, popovers) share the same border treatment defined in the `atlas-elevated-surface` mixin (`styles/_mixins.scss`). Use it instead of ad-hoc border values.
- **Nested border radius**: The mathematical formula is `inner = outer - padding`, but this only matters when elements are flush against the container edge. For elements separated by padding (buttons inside panels), step down one level in the radius scale instead: containers use `$radius-xl` (12px), inner elements use `$radius-l` (8px). Both look clearly rounded and the padding gap prevents the eye from comparing curves directly.
- **Reuse shared components**: Toolbar buttons must use the `ToolButton` component. Don't create custom button markup/classes that duplicate what `ToolButton` + `Button` already provide.

# Memory Notes

## Successfully Hiding Obsidian Tabs for Note Preview
To hide tabs while maintaining full editing functionality in the note preview window:

1. **CSS Approach**: Add styles to hide tab headers with a specific data attribute:
   ```css
   .workspace-tab-header[data-atlas-preview="true"] {
     display: none !important;
   }
   .workspace-tab-container:has(.workspace-tab-header[data-atlas-preview="true"]):not(:has(.workspace-tab-header:not([data-atlas-preview="true"]))) {
     display: none !important;
   }
   ```

2. **Leaf Management**: 
   - Create a new leaf with `this.app.workspace.getLeaf(true)`
   - Mark the leaf and its tab header with `data-atlas-preview="true"` attribute
   - **Critical**: Call `leaf.detach()` to remove the leaf from the main workspace split
   - This prevents the leaf from affecting the active view while keeping it functional

3. **View Preservation**:
   - Store the original active leaf before creating the preview leaf
   - After opening the file in the preview leaf, restore the original active leaf
   - Use `this.app.workspace.setActiveLeaf(originalActiveLeaf, { focus: false })`

4. **Content Rendering**:
   - After detaching, manually append the leaf's view container to the preview window
   - This maintains full editing capabilities while preventing workspace navigation

This approach ensures the user stays on the map canvas while previewing notes with full editing support.

## Hexagonal Grids
Hex geometry lives in `src/app/grid/hexGeometry.ts` and rendering in `src/app/grid/hexGridDrawer.ts`.

- **Size convention**: `grid.size` is the flat-to-flat distance of a hex (width of a pointy-top hex, height of a flat-top hex), the same convention Foundry VTT and Owlbear Rodeo use. Circumradius is `size / sqrt(3)`. A size-1 token therefore has the same pixel diameter on hex and square grids.
- **Orientation**: `hex-vertical` = pointy-top (rows), `hex-horizontal` = flat-top (columns).
- **Coordinates**: axial `(q, r)` with cube rounding for pixel-to-hex (Red Blob Games). Never round `q` and `r` independently.
- **Origin**: `(offsetX, offsetY)` is the top-left of hex `(0, 0)`'s bounding box, so a hex map whose first hex is flush with the image corner aligns at offset 0.
- **Drawing**: each row/column emits one zig-zag polyline plus one straight edge per hex, so every edge is drawn exactly once (no edge deduplication, no double-drawn lines). The `Graphics` is drawn in world space and clipped by a map-sized mask; do not bake it into a texture (that introduced sub-pixel offsets in the past).
- **Distance**: hex steps via `axialDistance`; square grids use Chebyshev distance.
- **Dotted style**: vertex markers are single filled polygons (`drawVertexMarker`), never overlapping strokes, so the centre stays crisp at any opacity. The `GridSystem` fills for dotted and strokes otherwise.
- **Alignment**: on hex grids each measurement is one hex edge (two neighbouring corners); `hexAlignmentMath.ts` detects orientation from edge angles, seeds the lattice from the first edge, and fuses further edges with a beam search over lattice-vertex assignments plus least squares. Two edges along one axis are inherently scale-ambiguous; a third edge in another direction resolves it, so the 4-quadrant flow is the precise one.
- **Auto-detect**: `src/app/pixi/gridDetection/` works as propose, fit, verify. *Propose*: the power spectrum of the map's line contrast (square = axis peaks, hex = six peaks at 30°+k·60° pointy / k·60° flat) is summed over harmonics, because thin lines are a comb whose fundamental is its weakest peak on textured art; two views propose (contrast before and after downsampling, for thin and thick lines). The spectrum never decides anything. *Fit*: `edgeProfile.ts` averages the image along each cell edge before rectifying, so faint lines add up coherently; `latticeSearch.ts` profiles ~800 edges once and scores every nearby size/offset by reading those profiles (one vote per edge, so heavy ink cannot outvote a faint grid); `latticeFit.ts` then measures each edge's sub-pixel distance to its line and solves size and offset in one robust least-squares (distances are linear in the three unknowns because every grid point is `origin + size * latticeCoordinate`; Tukey weights with a shrinking cutoff drop hidden edges and map art). Edges come from the real drawers via `gridTemplate.ts`, so detection and rendering cannot disagree. *Verify*: `support` is the chance-corrected share of edges with a line within 0.75 px, taken over the weakest edge direction (another grid type can share one direction's lines, never all); below 0.05 the map has no grid and the manual tool is the fallback. Size multiples are compared at equal edge length (longer edges see fainter lines) and the smallest within 75% of the best wins. Size changes scale about the image centre. Mind the half-pixel convention: detected pixel indices get `+0.5` before becoming world coordinates.

## Undo/Redo History
History lives in `src/app/stores/history.ts` (zundo on top of the view store) and tracks only `objects`, `grid`, `background` and `widgetValues`.

- **One gesture = one undo step**: any interaction that writes to the store while the pointer is down (token drag, pin drag, wall vertex/light drag, eraser sweep, live-updating config panels) must call `beginHistoryTransaction(store)` when it starts and `endHistoryTransaction(store)` when it ends, including on cancel/destroy. Multi-step edits use `runHistoryTransaction(store, fn)`; writes that must never be undoable use `runUntracked`.
- **Prefer a single store action** for bulk edits (`updateTokens`, `setTokenPositions`) over raw `store.setState` with an Immer draft.
- Renderers that derive state from `objects` (vision, spatial audio) subscribe to the `objects` reference, so undo/redo refreshes them without dirty flags.

## Rendering and teardown
- **Render on change**: `src/app/pixi/RenderScheduler.ts` replaces the Application's per-tick render. It renders only when PIXI's render groups hold pending changes (moved, added, removed or hidden children; updated Graphics, Sprites or Text). Ticker callbacks still run every frame. Anything PIXI cannot see must call `requestRender(app)`: pixels uploaded into an existing texture (`source.update()`), hand-animated filter properties, renderer settings, off-screen renders that consume pending updates (`generateTexture`).
- **Destroy with `destroyTree`** (`src/app/pixi/utils/destroyTree.ts`): in PIXI 8 `destroy({ children: true })` keeps every Graphics' geometry registered with the renderer until the app is destroyed. Never detach a display object with `removeChild` alone when it is not reused.
- **Rebuild only what changed**: store-driven renderers compare the new record with the previous one (Immer keeps unchanged references) and move objects in place instead of recreating them on every update, e.g. during drags.
- **Player window**: mirrors the DM canvas only after it rendered (`getRenderedFrames`) or when player-visible inputs change. Popouts are closed when the main window unloads, since Obsidian leaves them open across reloads and each one would keep the previous session alive.
