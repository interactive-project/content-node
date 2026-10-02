import { canonicalLocale } from '@interactive-project/protocol/content';
import { copyGeneratedJson } from '@interactive-project/protocol/generation/json';
export const contentLimits = Object.freeze({ maxBytes: 2097152, maxDepth: 64, maxCollectionSize: 2000, maxStringLength: 100000, maxNodes: 50000, maxContentDepth: 16, maxContentNodes: 2000 });
export class ContentNormalizationError extends Error { constructor(code) { super('Content normalization failed.'); this.name = 'ContentNormalizationError'; this.code = code; } }
/** Pure bounded normalization; validation remains required before rendering. */
export function normalizeContent(input) {
  const { maxContentDepth, maxContentNodes, ...jsonLimits } = contentLimits;
  const prepared = copyGeneratedJson(input, jsonLimits);
  if (!prepared.valid) throw new ContentNormalizationError(prepared.diagnostics[0].code);
  let contentNodes = 0;
  const newline = value => value.replace(/\r\n?/g, '\n');
  function visit(value, contentDepth = 0) {
    if (!value || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(child => visit(child, contentDepth));
    if (['text','markdown','math','image','code','audio','video','group','content-ref'].includes(value.kind)) {
      if (++contentNodes > maxContentNodes || contentDepth > maxContentDepth) throw new ContentNormalizationError('content.composition');
    }
    const result = Object.create(null);
    const keys = Object.keys(value);
    if (value.kind === 'group' && value.layout === undefined) keys.push('layout');
    for (const key of keys.sort()) {
      const child = key === 'layout' && value.kind === 'group' && value.layout === undefined ? 'block' : value[key];
      if (key === 'language') {
        try { result[key] = canonicalLocale(child); } catch { throw new ContentNormalizationError('content.locale'); }
      } else if (value.kind === 'localized-text' && key === 'defaultLocale') {
        try { result[key] = canonicalLocale(child); } catch { throw new ContentNormalizationError('content.locale'); }
      } else if (value.kind === 'localized-text' && key === 'translations') {
        const translations = Object.create(null);
        if (!child || typeof child !== 'object' || Array.isArray(child)) throw new ContentNormalizationError('content.locale');
        for (const locale of Object.keys(child)) {
          let canonical; try { canonical = canonicalLocale(locale); } catch { throw new ContentNormalizationError('content.locale'); }
          if (Object.hasOwn(translations, canonical)) throw new ContentNormalizationError('content.localeCollision');
          const translation = visit(child[locale], contentDepth);
          if (typeof translation?.text === 'string') translation.text = newline(translation.text);
          translations[canonical] = translation;
        }
        result[key] = Object.fromEntries(Object.keys(translations).sort().map(locale => [locale, translations[locale]]));
      } else {
        result[key] = visit(child, contentDepth + (value.kind === 'group' && key === 'children' ? 1 : 0));
        if (key === 'source' && ['markdown','math','code'].includes(value.kind) && typeof child === 'string') result[key] = newline(child);
      }
    }
    return result;
  }
  const result = visit(prepared.value);
  function freeze(value) { if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; }
  return freeze(result);
}
