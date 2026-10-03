/** The bytes of a base64 data URL, such as an audio sample imported with `?inline`. */
export function dataUrlToArrayBuffer(dataUrl: string): ArrayBuffer {
  const binary = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0)).buffer;
}
