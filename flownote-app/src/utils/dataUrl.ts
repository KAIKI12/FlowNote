export function bytesDataUrl(mime: string, bytes: number[]): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.slice(offset, offset + 0x8000));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}
