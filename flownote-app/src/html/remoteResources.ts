import type {
  HtmlBlockConfig, LocalizedResource, LocalizedResourceType, LocalizationIssue,
} from '../note/mixedTypes';

export interface RemoteDependency {
  source: string;
  type: LocalizedResourceType;
}

export interface RemoteResourceInspection {
  dependencies: RemoteDependency[];
  unresolved: LocalizationIssue[];
  localizedCount: number;
  status: 'none' | 'remote' | 'partial' | 'local';
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function localizedResource(value: unknown): LocalizedResource | null {
  const item = record(value);
  if (!item || typeof item.source !== 'string' || typeof item.path !== 'string'
    || !['script', 'stylesheet', 'image', 'style-asset'].includes(String(item.type))
    || typeof item.mime !== 'string' || typeof item.sha256 !== 'string') return null;
  return {
    source: item.source,
    path: item.path,
    type: item.type as LocalizedResourceType,
    mime: item.mime,
    sha256: item.sha256,
  };
}

function localizationIssue(value: unknown): LocalizationIssue | null {
  const item = record(value);
  if (!item || typeof item.source !== 'string' || typeof item.reason !== 'string') return null;
  return { source: item.source, reason: item.reason };
}

export function localizedResources(config?: HtmlBlockConfig): LocalizedResource[] {
  const resources = record(config?.resources);
  const values = resources?.localized;
  if (!Array.isArray(values)) return [];
  return values.map(localizedResource).filter((value): value is LocalizedResource => !!value);
}

export function persistedLocalizationIssues(config?: HtmlBlockConfig): LocalizationIssue[] {
  const resources = record(config?.resources);
  const values = resources?.localizationIssues;
  if (!Array.isArray(values)) return [];
  return values.map(localizationIssue).filter((value): value is LocalizationIssue => !!value);
}

function httpsSource(value: string | null): string | null {
  const source = value?.trim() ?? '';
  if (!source) return null;
  try {
    const url = new URL(source);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function unsupportedHttp(value: string | null, issues: LocalizationIssue[]) {
  const source = value?.trim() ?? '';
  if (/^http:\/\//i.test(source)) issues.push({ source, reason: 'insecure-http-not-supported' });
}

function cssWithoutImports(css: string, issues: LocalizationIssue[]): string {
  const pattern = /@import\s+(?:url\(\s*)?(?:['"])?([^'")\s;]+)(?:['"])?\s*\)?[^;]*;/gi;
  const stripped = css.replace(pattern, (_match, source: string) => {
    issues.push({ source, reason: 'css-import-not-supported' });
    return '';
  });
  return stripped;
}

function cssDependencies(css: string, dependencies: RemoteDependency[], issues: LocalizationIssue[]) {
  const input = cssWithoutImports(css, issues);
  const pattern = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;
  for (const match of input.matchAll(pattern)) {
    const raw = match[2].trim();
    const source = httpsSource(raw);
    if (source) dependencies.push({ source, type: 'style-asset' });
    else unsupportedHttp(raw, issues);
  }
}

function uniqueDependencies(values: RemoteDependency[]): RemoteDependency[] {
  const seen = new Set<string>();
  return values.filter(value => {
    const key = `${value.type}\0${value.source}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueIssues(values: LocalizationIssue[]): LocalizationIssue[] {
  const seen = new Set<string>();
  return values.filter(value => {
    const key = `${value.reason}\0${value.source}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function inspectRemoteResources(html: string, config?: HtmlBlockConfig): RemoteResourceInspection {
  const dependencies: RemoteDependency[] = [];
  const unresolved: LocalizationIssue[] = [];
  const document = new DOMParser().parseFromString(html, 'text/html');

  for (const element of document.querySelectorAll<HTMLElement>('*')) {
    const tag = element.tagName.toLowerCase();
    if (tag === 'link' && (element.getAttribute('rel') ?? '').split(/\s+/).some(value => value.toLowerCase() === 'stylesheet')) {
      const raw = element.getAttribute('href');
      const source = httpsSource(raw);
      if (source) dependencies.push({ source, type: 'stylesheet' });
      else unsupportedHttp(raw, unresolved);
    } else if (tag === 'script' && element.hasAttribute('src')) {
      const raw = element.getAttribute('src');
      const source = httpsSource(raw);
      if (source) {
        if ((element.getAttribute('type') ?? '').trim().toLowerCase() === 'module') {
          unresolved.push({ source, reason: 'module-script-not-supported' });
        } else dependencies.push({ source, type: 'script' });
      } else unsupportedHttp(raw, unresolved);
    } else if (tag === 'img') {
      const raw = element.getAttribute('src');
      const source = httpsSource(raw);
      if (source) dependencies.push({ source, type: 'image' });
      else unsupportedHttp(raw, unresolved);
    }

    if (tag === 'style') cssDependencies(element.textContent ?? '', dependencies, unresolved);
    const style = element.getAttribute('style');
    if (style) cssDependencies(style, dependencies, unresolved);
  }

  if (/\bfetch\s*\(/i.test(html)) unresolved.push({ source: 'fetch()', reason: 'dynamic-fetch-not-supported' });
  if (/\b(?:Shared)?Worker\s*\(/i.test(html)) unresolved.push({ source: 'Worker', reason: 'worker-not-supported' });
  if (/\bWebAssembly\b/i.test(html)) unresolved.push({ source: 'WebAssembly', reason: 'wasm-not-supported' });

  const allDependencies = uniqueDependencies(dependencies);
  const persistedIssues = persistedLocalizationIssues(config);
  const allIssues = uniqueIssues([...unresolved, ...persistedIssues]);
  const localized = localizedResources(config);
  const localizedSources = new Set(localized.map(item => item.source));
  const localizedCount = allDependencies.filter(item => localizedSources.has(item.source)).length;

  let status: RemoteResourceInspection['status'];
  if (!allDependencies.length && !allIssues.length) status = 'none';
  else if (allDependencies.length && localizedCount === allDependencies.length && !allIssues.length) status = 'local';
  else if (localizedCount > 0 || (!allDependencies.length && allIssues.length)) status = 'partial';
  else status = 'remote';

  return { dependencies: allDependencies, unresolved: allIssues, localizedCount, status };
}
