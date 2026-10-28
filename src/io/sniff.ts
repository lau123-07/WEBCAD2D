
export function sniffKind(name, buf) {
  const u8 = new Uint8Array(buf.slice(0, 16));
  const head = new TextDecoder('windows-1252').decode(buf.slice(0, 32));
  if (/^AC10\d\d/.test(head) || /\.dwg$/i.test(name)) return 'dwg';
  if (head.startsWith('%PDF') || /\.pdf$/i.test(name)) return 'pdf';
  if ((u8[0] === 0xFF && u8[1] === 0xD8) || (u8[0] === 0x89 && u8[1] === 0x50) || head.startsWith('GIF8') ||
      (head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP') || head.startsWith('BM') ||
      /\.(jpe?g|png|gif|webp|bmp)$/i.test(name)) return 'image';
  if (/\.(heic|heif|tiff?)$/i.test(name)) return 'image-unsupported';
  if (head.startsWith('AutoCAD Binary DXF')) return 'dxfbin';
  return 'dxf';
}

export const baseName = n => n.replace(/\.[^.]+$/, '');
