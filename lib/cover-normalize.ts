import jpeg from 'jpeg-js';
import {PNG} from 'pngjs';
import {MAX_COVER_BYTES, MAX_COVER_DIMENSION, readRaster, validateCover} from './cover-image.ts';

const MAX_SOURCE_SIDE = 6144;
const MAX_SOURCE_PIXELS = 18_000_000;
type Raster = {width: number; height: number; data: Uint8Array};

function decodeRaster(bytes: Uint8Array, mime: 'image/png' | 'image/jpeg'): Raster {
  try {
    if (mime === 'image/jpeg') {
      const decoded = jpeg.decode(bytes, {useTArray: true, formatAsRGBA: true, maxResolutionInMP: 18, maxMemoryUsageInMB: 96});
      return {width: decoded.width, height: decoded.height, data: new Uint8Array(decoded.data)};
    }
    const png = PNG.sync.read(Buffer.from(bytes));
    return {width: png.width, height: png.height, data: new Uint8Array(png.data)};
  } catch (error) {
    if (error instanceof Error && /^(La |El |Usa )/.test(error.message)) throw error;
    throw new Error('No se pudo convertir esta imagen. Elige un JPG o PNG.');
  }
}

function scaleTo(raster: Raster, width: number, height: number): Raster {
  if (width === raster.width && height === raster.height) return raster;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const sy = Math.min(raster.height - 1, Math.floor((y + 0.5) * raster.height / height));
    const row = sy * raster.width;
    for (let x = 0; x < width; x++) {
      const from = (row + Math.min(raster.width - 1, Math.floor((x + 0.5) * raster.width / width))) * 4;
      const to = (y * width + x) * 4;
      data[to] = raster.data[from];
      data[to + 1] = raster.data[from + 1];
      data[to + 2] = raster.data[from + 2];
      data[to + 3] = 255;
    }
  }
  return {width, height, data};
}

function fit(raster: Raster) {
  let scale = Math.min(1, MAX_COVER_DIMENSION / Math.max(raster.width, raster.height));
  const qualities = [82, 72, 60, 48, 40];
  for (let attempt = 0; attempt < 6; attempt++) {
    const width = Math.max(1, Math.min(MAX_COVER_DIMENSION, Math.round(raster.width * scale)));
    const height = Math.max(1, Math.min(MAX_COVER_DIMENSION, Math.round(raster.height * scale)));
    const resized = scaleTo(raster, width, height);
    const encoded = jpeg.encode({data: resized.data, width, height}, qualities[Math.min(attempt, qualities.length - 1)]);
    const bytes = new Uint8Array(encoded.data);
    try {
      validateCover(bytes, 'image/jpeg');
      return bytes;
    } catch { scale *= 0.7; }
  }
  throw new Error('No se pudo convertir esta imagen dentro del límite de 2 MB.');
}

export function prepareCover(bytes: Uint8Array): {bytes: Uint8Array; mime: 'image/png' | 'image/jpeg'} {
  if (!bytes.length) throw new Error('La portada debe pesar como máximo 2 MB.');
  if (bytes.length <= MAX_COVER_BYTES) {
    try {
      const valid = validateCover(bytes, readRaster(bytes).mime);
      return {bytes, mime: valid.mime};
    } catch (error) {
      if (!(error instanceof Error) || error.message !== 'La portada debe medir como máximo 4096 × 4096 píxeles.') throw error;
    }
  } else if (bytes.length > 8 * 1024 * 1024) throw new Error('La imagen de origen es demasiado grande para convertirla.');
  const info = readRaster(bytes);
  if (info.width > MAX_SOURCE_SIDE || info.height > MAX_SOURCE_SIDE || info.width * info.height > MAX_SOURCE_PIXELS) throw new Error('La imagen de origen es demasiado grande para convertirla.');
  const output = fit(decodeRaster(bytes, info.mime));
  return {bytes: output, mime: validateCover(output, 'image/jpeg').mime};
}
