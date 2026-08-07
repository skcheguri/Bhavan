// Generates the source images that @capacitor/assets expands into every
// Android density (and iOS size later).
//
//   node scripts/generate-app-assets.mjs && npx @capacitor/assets generate --android
//
// Committed so the assets can be rebuilt when the mark changes, rather
// than becoming binaries nobody knows how to regenerate.
//
// Three source files, because they are not interchangeable:
//   icon-foreground.png  the mark alone on transparency, sized into the
//                        middle ~60% so Android's adaptive-icon mask can
//                        crop to a circle/squircle without clipping it
//   icon-background.png  flat brand colour behind that foreground
//   splash.png           mark centred small on brand colour; the splash is
//                        shown at many aspect ratios and only the centre
//                        is guaranteed visible
//
// @capacitor/assets also wants a plain `icon.png` for the legacy square
// launcher icon on pre-adaptive Android.

import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const BRAND = '#E07856';
const HOUSE =
  '<path d="M16 7 L26 15.5 V25 a1 1 0 0 1 -1 1 H7 a1 1 0 0 1 -1 -1 V15.5 Z" fill="#FFF5F2"/>' +
  '<rect x="13" y="18" width="6" height="8" fill="#E07856"/>';

/** The mark, scaled and centred on a 32-unit canvas. */
function mark({ scale, background, rounded = false }) {
  const offset = (32 - 32 * scale) / 2;
  const bg = background
    ? `<rect width="32" height="32" ${rounded ? 'rx="7"' : ''} fill="${background}"/>`
    : '';
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${bg}` +
      `<g transform="translate(${offset},${offset}) scale(${scale})">${HOUSE}</g></svg>`
  );
}

/** Flat colour, no mark -- the adaptive icon's background layer. */
function solid(colour) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
      `<rect width="32" height="32" fill="${colour}"/></svg>`
  );
}

const targets = [
  // The house glyph is drawn with a brand-coloured door, so on a
  // transparent foreground it needs its own fill to stay visible; scaling
  // to 0.55 keeps it inside the adaptive-icon safe zone.
  { file: 'icon-foreground.png', size: 1024, svg: mark({ scale: 0.55, background: null }) },
  { file: 'icon-background.png', size: 1024, svg: solid(BRAND) },
  { file: 'icon.png', size: 1024, svg: mark({ scale: 1, background: BRAND, rounded: true }) },
  { file: 'splash.png', size: 2732, svg: mark({ scale: 0.22, background: BRAND }) },
  { file: 'splash-dark.png', size: 2732, svg: mark({ scale: 0.22, background: BRAND }) },
];

await mkdir('assets', { recursive: true });

for (const { file, size, svg } of targets) {
  await sharp(svg).resize(size, size).png().toFile(`assets/${file}`);
  console.log(`assets/${file}  ${size}x${size}`);
}
