import { refuse } from './uvttFields';
import type { UvttImage, UvttImageType } from './uvttTypes';

/** A data URL's head, which some exporters put before the image. What it claims is not read. */
const DATA_URL_HEAD = /^\s*data:[^,]{0,100},/;

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

/** The image format the bytes begin as, by their signature. */
export function imageTypeOf(bytes: Uint8Array): UvttImageType | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  return null;
}

/** A file path or an address where the image should be: short, and ending as an image file or beginning as an address does. */
function isReference(text: string): boolean {
  return text.length <= 2048 && (/^\s*[a-z][a-z0-9+.-]*:\/\//i.test(text) || /\.(?:png|webp|jpe?g|gif|bmp|avif|svg)(?:\?.*)?\s*$/i.test(text));
}

function toBytes(binary: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** Decodes base64 in the standard alphabet or, where that fails, in the one written for URLs. */
function decodeBase64(text: string): Uint8Array<ArrayBuffer> {
  try {
    return toBytes(atob(text));
  } catch {
    try {
      return toBytes(atob(text.replace(/-/g, '+').replace(/_/g, '/')));
    } catch {
      return refuse('The map image in the file is damaged (it is not valid base64).');
    }
  }
}

/** The map image of a file: its `image` field decoded, and its type as the bytes themselves say. */
export function readImage(value: unknown): UvttImage {
  if (typeof value !== 'string' || value === '') return refuse('The file holds no map image.');
  if (isReference(value)) return refuse('This file refers to its image instead of containing it.');
  const bytes = decodeBase64(value.replace(DATA_URL_HEAD, ''));
  const type = imageTypeOf(bytes);
  return type ? { bytes, type } : refuse('The map image in the file is not a PNG, WebP or JPEG image.');
}
