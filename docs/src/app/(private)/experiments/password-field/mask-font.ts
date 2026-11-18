/* eslint-disable no-bitwise -- writing a binary font file */
/**
 * Builds a tiny TrueType font whose only glyph replaces the characters browsers use to mask
 * password inputs (U+2022 and U+25CF). Loaded with `unicode-range`, it only affects the mask,
 * so the caret, selection, scrolling and revealed text stay native.
 *
 * To stay small, the browser flattens the SVG path (`getPointAtLength`), and every font table
 * except the glyph outline and its metrics ships as a precomputed template. Browser-only.
 * Fonts can only fill outlines, so the path must describe filled shapes (nonzero winding).
 */

// Header, table directory and the fixed tables (OS/2, cmap, head, hhea, maxp, name, post).
// `glyf`, `hmtx` and `loca` are appended at runtime. Checksums are left at 0.
const TEMPLATE =
  'AAEAAAAKAIAAAwAgT1MvMgAAAAAAAACsAAAAYGNtYXAAAAAAAAABDAAAADRnbHlmAAAAAAAAAAAAAAAAaGVhZAAAAAAAAAFAAAAANmhoZWEAAAAAAAABeAAAACRobXR4AAAAAAAAAAAAAAAAbG9jYQAAAAAAAAAAAAAAAG1heHAAAAAAAAABnAAAACBuYW1lAAAAAAAAAbwAAAAGcG9zdAAAAAAAAAHEAAAAIAAEAlgBkAAFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABOT05FAEAgIiXPAyD/OAAAAyAAyAAAAAAAAAAAAfQCvAAAACAAAAAAAAEAAwABAAAADAAEACgAAAAGAAQAAQACICIlz///AAAgIiXP///f39oyAAEAAAAAAAAAAQAAAAEAAAAAAABfDzz1AAsD6AAAAAAAAAAAAAAAAAAAAAAAAP84A+gDIAAAAAgAAgABAAAAAAABAAADIP84AAAD6AAAAAAD6AABAAAAAAAAAAAAAAAAAAAAAgABAAAAAv//AP8AAAAAAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAGAAAAAwAAAAAAAP+cADIAAAAAAAAAAAAAAAAAAAAAAAAAAA==';
// Byte offsets of the `glyf`, `hmtx` and `loca` entries in the table directory.
const DIRECTORY_ENTRIES = [44, 92, 108];

export const MASK_UNICODE_RANGE = 'U+2022, U+25CF';

export interface MaskFontOptions {
  /** SVG path data for the glyph, in `viewBox` coordinates. */
  path: string;
  /** The SVG `viewBox` the path is drawn in. */
  viewBox?: string;
  /** Glyph height as a fraction of the font size. */
  size?: number;
  /** Extra space after each glyph as a fraction of the font size. */
  spacing?: number;
}

export interface MaskFont {
  family: string;
  /** An `@font-face` rule that loads the font for the mask characters only. */
  css: string;
  bytes: Uint8Array<ArrayBuffer>;
}

type Point = [number, number];

export function createMaskFont(options: MaskFontOptions): MaskFont {
  const { path, viewBox = '0 0 24 24', size = 0.6, spacing = 0.1 } = options;
  const [minX, minY, width, height] = viewBox
    .trim()
    .split(/[\s,]+/)
    .map(Number);

  // Font units: 1000 per em, with the glyph centered 300 units above the baseline.
  const scale = (size * 1000) / Math.max(width, height);
  const gap = spacing * 500;
  const advance = Math.round(width * scale + gap * 2);
  const bottom = 300 - (height * scale) / 2;

  // SVG's y axis points down and a font's points up, so flip while scaling.
  const contours = samplePath(path, Math.max(width, height) / 100)
    .map((contour) =>
      simplify(
        contour.map(([x, y]): Point => [
          Math.round((x - minX) * scale + gap),
          Math.round(bottom + (height - (y - minY)) * scale),
        ]),
      ),
    )
    .filter((contour) => contour.length > 2);

  const points = contours.flat();
  if (points.length === 0) {
    throw new Error('The path has no filled area.');
  }
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  const xMin = Math.min(...xs);

  // A simple glyph with every point on the curve and 16-bit coordinate deltas.
  let end = -1;
  const glyf = [
    ...words([
      contours.length,
      xMin,
      Math.min(...ys),
      Math.max(...xs),
      Math.max(...ys),
      ...contours.map((contour) => {
        end += contour.length;
        return end;
      }),
      0,
    ]),
    ...points.map(() => 1),
    ...words(points.map(([x], i) => x - (points[i - 1]?.[0] ?? 0))),
    ...words(points.map(([, y], i) => y - (points[i - 1]?.[1] ?? 0))),
  ];
  const hmtx = words([advance, 0, advance, xMin]);
  const loca = words([0, 0, 0, 0, glyf.length >>> 16, glyf.length]);

  const template = Uint8Array.from(atob(TEMPLATE), (char) => char.charCodeAt(0));
  const tables = [glyf, hmtx, loca];
  const padded = tables.map(pad);
  const bytes = new Uint8Array(
    template.length + padded.reduce((sum, table) => sum + table.length, 0),
  );
  const view = new DataView(bytes.buffer);
  bytes.set(template);
  let offset = template.length;
  padded.forEach((table, index) => {
    bytes.set(table, offset);
    view.setUint32(DIRECTORY_ENTRIES[index] + 8, offset);
    view.setUint32(DIRECTORY_ENTRIES[index] + 12, tables[index].length);
    offset += table.length;
  });

  const family = `base-ui-mask-${hash(`${path}|${viewBox}|${size}|${spacing}`)}`;
  const css =
    `@font-face{font-family:"${family}";` +
    `src:url(data:font/ttf;base64,${btoa(String.fromCharCode(...bytes))}) format("truetype");` +
    `unicode-range:${MASK_UNICODE_RANGE};font-display:block;}`;

  return { family, css, bytes };
}

/** Samples the path into polygons. A jump between samples marks the start of a new subpath. */
function samplePath(d: string, step: number): Point[][] {
  const element = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  element.setAttribute('d', d);
  const length = element.getTotalLength();
  const contours: Point[][] = [[]];
  let previous: DOMPoint | undefined;
  for (let at = 0; at <= length; at += step) {
    const point = element.getPointAtLength(at);
    if (previous && Math.hypot(point.x - previous.x, point.y - previous.y) > step * 2) {
      contours.push([]);
    }
    contours[contours.length - 1].push([point.x, point.y]);
    previous = point;
  }
  return contours;
}

/** Drops points that sit on a straight line between their neighbors, including duplicates. */
function simplify(contour: Point[]): Point[] {
  return contour.filter((point, index) => {
    const before = contour[(index - 1 + contour.length) % contour.length];
    const after = contour[(index + 1) % contour.length];
    return (
      (point[0] - before[0]) * (after[1] - point[1]) -
        (point[1] - before[1]) * (after[0] - point[0]) !==
      0
    );
  });
}

function words(values: number[]): number[] {
  return values.flatMap((value) => [(value >> 8) & 0xff, value & 0xff]);
}

function pad(table: number[]): number[] {
  return [...table, ...Array((4 - (table.length % 4)) % 4).fill(0)];
}

function hash(value: string): string {
  let result = 5381;
  for (let i = 0; i < value.length; i += 1) {
    result = ((result * 33) ^ value.charCodeAt(i)) >>> 0;
  }
  return result.toString(36);
}
