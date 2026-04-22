// Small image helpers shared between the PDF and PPTX renderers.
//
// Logos uploaded as PNG/JPEG often carry a solid white background. When we place the same
// logo on a grey header, a dark title slide, or anywhere that isn't white, that background
// shows through as an ugly white box. `stripNearWhite` turns near-white pixels transparent
// so a single logo PNG works on any backdrop.

import type { Buffer } from 'node:buffer';

/**
 * Return a PNG buffer where near-white pixels (r,g,b each above `threshold`) are alpha=0.
 * Existing alpha is preserved; only opaque-white pixels are zeroed out.
 *
 * Defaults match the threshold the Python templates used (`r,g,b > 230`).
 */
export async function stripNearWhite(buf: Buffer, threshold = 230): Promise<Buffer> {
  const mod: any = await import('sharp');
  const sharp = mod.default ?? mod;
  const img = sharp(buf).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  if (channels !== 4) {
    // Shouldn't happen after ensureAlpha(), but bail out safely if it does.
    return buf;
  }

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r >= threshold && g >= threshold && b >= threshold) {
      data[i + 3] = 0;
    }
  }

  return await sharp(data, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();
}
