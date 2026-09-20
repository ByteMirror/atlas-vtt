/**
 * Sets the mouse cursor shown over the PIXI canvas.
 *
 * PIXI's EventSystem writes the cursor as an inline style on the canvas, which
 * a CSS class cannot outrank, so cursor changes have to be written inline too.
 */
export function setCanvasCursor(canvas: HTMLCanvasElement, cursor: string): void {
  canvas.style.cursor = cursor;
}
