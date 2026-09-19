export function managedMarkdownImageTarget(fileName: string, source: string): string | null {
  const stem = fileName.replace(/\.(md|markdown)$/i, '');
  if (stem === fileName || !stem) return null;
  const prefix = `${stem}.assets/`;
  if (!source.startsWith(prefix) || source.includes('\\') || /[?#]/.test(source)) return null;
  const rest = source.slice(prefix.length);
  const parts = rest.split('/');
  if (!parts.length || parts.some(part => !part || part === '.' || part === '..')) return null;
  return `assets/images/${parts.join('/')}`;
}
