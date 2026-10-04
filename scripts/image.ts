/**
 * Intrinsic image dimensions, read straight from the file header.
 *
 * This exists so every figure can carry a width and height into the markup.
 * Without them the browser does not know how tall an image will be until the
 * bytes arrive, the article reflows when they do, and ScrollTrigger — which
 * measured all of its start and end positions on mount — ends up driving the
 * card and constellation animations against stale offsets. Reserving the box
 * up front is what keeps that from happening.
 *
 * Headers only, no decoding and no dependency.
 */

export class ImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageError";
  }
}

export interface Dimensions {
  width: number;
  height: number;
}

const ascii = (b: Uint8Array, at: number, length: number): string =>
  String.fromCharCode(...b.subarray(at, at + length));

/* ---- PNG ------------------------------------------------------------- */

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function png(b: Uint8Array): Dimensions | null {
  if (b.length < 24) return null;
  if (!PNG_MAGIC.every((byte, i) => b[i] === byte)) return null;
  // 8 byte signature, then the IHDR chunk: length, type, width, height.
  const view = new DataView(b.buffer, b.byteOffset);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/* ---- GIF ------------------------------------------------------------- */

function gif(b: Uint8Array): Dimensions | null {
  if (b.length < 10) return null;
  const header = ascii(b, 0, 6);
  if (header !== "GIF87a" && header !== "GIF89a") return null;
  const view = new DataView(b.buffer, b.byteOffset);
  return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
}

/* ---- JPEG ------------------------------------------------------------ */

/** Start-of-frame markers; DHT, JPG and DAC share the range but are not frames. */
const NOT_A_FRAME = new Set([0xc4, 0xc8, 0xcc]);

function jpeg(b: Uint8Array): Dimensions | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  const view = new DataView(b.buffer, b.byteOffset);

  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = b[i + 1]!;
    // Padding and standalone markers carry no length field.
    if (marker === 0xff || (marker >= 0xd0 && marker <= 0xd9)) {
      i += 2;
      continue;
    }
    const length = view.getUint16(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && !NOT_A_FRAME.has(marker)) {
      // length, precision, then height and width.
      return {
        height: view.getUint16(i + 5),
        width: view.getUint16(i + 7),
      };
    }
    i += 2 + length;
  }
  return null;
}

/* ---- WebP ------------------------------------------------------------ */

function webp(b: Uint8Array): Dimensions | null {
  if (b.length < 30) return null;
  if (ascii(b, 0, 4) !== "RIFF" || ascii(b, 8, 4) !== "WEBP") return null;
  const view = new DataView(b.buffer, b.byteOffset);
  const chunk = ascii(b, 12, 4);

  if (chunk === "VP8 ") {
    // Lossy: 3 byte frame tag, 3 byte sync code, then 14 bit dimensions.
    return {
      width: view.getUint16(26, true) & 0x3fff,
      height: view.getUint16(28, true) & 0x3fff,
    };
  }

  if (chunk === "VP8L") {
    // Lossless: one signature byte, then 14 bits each, minus one.
    const bits =
      view.getUint32(21, true) & 0x0fffffff;
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }

  if (chunk === "VP8X") {
    // Extended: 24 bit canvas size, minus one.
    const read24 = (at: number) =>
      b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16);
    return { width: read24(24) + 1, height: read24(27) + 1 };
  }

  return null;
}

/* ---- SVG ------------------------------------------------------------- */

function svg(bytes: Uint8Array): Dimensions | null {
  const head = new TextDecoder().decode(bytes.subarray(0, 2048));
  if (!head.includes("<svg")) return null;

  const attr = (name: string): number | null => {
    const m = new RegExp(`${name}\\s*=\\s*"([\\d.]+)(?:px)?"`).exec(head);
    return m ? Number(m[1]) : null;
  };

  const w = attr("width");
  const h = attr("height");
  if (w && h) return { width: Math.round(w), height: Math.round(h) };

  // No explicit size, so fall back to the viewBox's aspect.
  const box = /viewBox\s*=\s*"\s*[\d.-]+\s+[\d.-]+\s+([\d.]+)\s+([\d.]+)/.exec(head);
  if (box) {
    return { width: Math.round(Number(box[1])), height: Math.round(Number(box[2])) };
  }
  return null;
}

const READERS = [png, jpeg, gif, webp, svg];

/** Dimensions of an encoded image, or null if the format is not recognised. */
export function imageSize(bytes: Uint8Array): Dimensions | null {
  for (const read of READERS) {
    try {
      const size = read(bytes);
      if (size && size.width > 0 && size.height > 0) return size;
    } catch {
      // A truncated header reads as "unrecognised" rather than crashing.
    }
  }
  return null;
}

export const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".avif",
]);
