export interface FrontmatterEnvelope {
  prefix: string;
  body: string;
}

function lineEnd(source: string, start: number): { contentEnd: number; next: number } {
  for (let index = start; index < source.length; index++) {
    const char = source[index];
    if (char === '\n') return { contentEnd: index, next: index + 1 };
    if (char === '\r') return { contentEnd: index, next: source[index + 1] === '\n' ? index + 2 : index + 1 };
  }
  return { contentEnd: source.length, next: source.length };
}

function trimmedLine(source: string, start: number, end: number): string {
  return source.slice(start, end).replace(/[ \t]+$/g, '');
}

export function hasFrontmatterOpener(source: string): boolean {
  const bom = source.startsWith('\uFEFF') ? 1 : 0;
  const first = lineEnd(source, bom);
  const opener = trimmedLine(source, bom, first.contentEnd);
  if (opener !== '---' && opener !== '+++') return false;
  const preview = source.slice(first.next, Math.min(source.length, first.next + 8192)).replace(/\r\n?/g, '\n');
  return opener === '---'
    ? /(^|\n)[A-Za-z0-9_.-]+[ \t]*:[ \t]*/.test(preview)
    : /(^|\n)[A-Za-z0-9_.-]+[ \t]*=[ \t]*/.test(preview);
}

export function splitFrontmatter(source: string): FrontmatterEnvelope | null {
  const bom = source.startsWith('\uFEFF') ? 1 : 0;
  const first = lineEnd(source, bom);
  const opener = trimmedLine(source, bom, first.contentEnd);
  if ((opener !== '---' && opener !== '+++') || first.next === source.length && first.contentEnd === source.length) return null;

  let cursor = first.next;
  while (cursor <= source.length) {
    const current = lineEnd(source, cursor);
    const line = trimmedLine(source, cursor, current.contentEnd);
    const closes = line === opener || opener === '---' && line === '...';
    if (closes) {
      let bodyStart = current.next;
      while (bodyStart < source.length) {
        const separator = lineEnd(source, bodyStart);
        if (!/^[ \t]*$/.test(source.slice(bodyStart, separator.contentEnd))) break;
        bodyStart = separator.next;
        if (separator.next === separator.contentEnd) break;
      }
      return { prefix: source.slice(0, bodyStart), body: source.slice(bodyStart) };
    }
    if (current.next <= cursor) break;
    cursor = current.next;
  }
  return null;
}
