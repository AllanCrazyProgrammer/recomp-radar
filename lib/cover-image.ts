export const MAX_COVER_BYTES = 2 * 1024 * 1024;
export const MAX_COVER_DIMENSION = 4096;
export function validateCover(bytes: Uint8Array, declaredType: string) {
  if (!bytes.length || bytes.length > MAX_COVER_BYTES) throw new Error('La portada debe pesar como máximo 2 MB.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let mime: 'image/png' | 'image/jpeg', width = 0, height = 0;
  const png = [137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v);
  if (png && bytes.length >= 67) {
    if (view.getUint32(8) !== 13 || String.fromCharCode(...bytes.slice(12,16)) !== 'IHDR' || String.fromCharCode(...bytes.slice(-8,-4)) !== 'IEND') throw new Error('El archivo PNG no es válido.');
    mime = 'image/png'; width = view.getUint32(16); height = view.getUint32(20);
  } else if (bytes.length >= 12 && bytes[0] === 255 && bytes[1] === 216 && bytes[bytes.length-2] === 255 && bytes[bytes.length-1] === 217) {
    mime = 'image/jpeg';
    let at = 2;
    while (at + 4 <= bytes.length) {
      if (bytes[at++] !== 255) break;
      while (bytes[at] === 255) at++;
      const marker = bytes[at++];
      if (marker === 218 || marker === 217) break;
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
      if (at + 2 > bytes.length) break;
      const length = view.getUint16(at);
      if (length < 2 || at + length > bytes.length) break;
      if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker) && length >= 8) {
        height = view.getUint16(at+3); width = view.getUint16(at+5); break;
      }
      at += length;
    }
    if (!width || !height) throw new Error('El archivo JPG no es válido.');
  } else throw new Error('Usa una imagen JPG o PNG válida. No se admiten SVG ni otros formatos.');
  if (declaredType !== mime) throw new Error('El formato del archivo no coincide con su contenido. Usa JPG o PNG.');
  if (!width || !height || width > MAX_COVER_DIMENSION || height > MAX_COVER_DIMENSION) throw new Error('La portada debe medir como máximo 4096 × 4096 píxeles.');
  return {mime, width, height};
}
