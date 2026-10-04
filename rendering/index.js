import { selectLocalizedText } from '@interactive-project/protocol/content';

const KINDS = new Set(['text', 'markdown', 'math', 'image', 'code', 'audio', 'video', 'group', 'content-ref']);
const NEVER_ALLOWED_SCHEMES = new Set(['javascript:', 'data:', 'file:', 'vbscript:']);
const MESSAGE_CATALOG = Object.freeze({
  en: Object.freeze({ unsupported: 'This content is not supported here.', unsupportedLanguage: 'This programming language is not supported here.', mediaUnavailable: 'This media is unavailable. The text alternative is shown.', blockedAsset: 'This media location is not allowed. The text alternative is shown.', renderError: 'This content could not be rendered. The text alternative is shown.', emptyCode: 'Empty code snippet.' }),
  es: Object.freeze({ unsupported: 'Este contenido no es compatible aquí.', unsupportedLanguage: 'Este lenguaje de programación no es compatible aquí.', mediaUnavailable: 'Este medio no está disponible. Se muestra la alternativa textual.', blockedAsset: 'La ubicación de este medio no está permitida. Se muestra la alternativa textual.', renderError: 'No se pudo mostrar este contenido. Se muestra la alternativa textual.', emptyCode: 'Fragmento de código vacío.' })
});

function normalizedOrigins(values = []) {
  return new Set(values.map(value => {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.origin !== value.replace(/\/$/, '')) throw new TypeError('Origins must be exact HTTPS origins.');
    return url.origin;
  }));
}

/** Check a Markdown target against an explicit scheme/origin allowlist. Relative links are local. */
export function isAllowedContentUri(value, { allowedSchemes = ['https', 'mailto'], allowedOrigins = [] } = {}) {
  if (typeof value !== 'string' || !value || /[\u0000-\u0020\\]/.test(value)) return false;
  if (!/^[a-z][a-z\d+.-]*:/i.test(value)) return !value.startsWith('//');
  let url;
  try { url = new URL(value); } catch { return false; }
  if (NEVER_ALLOWED_SCHEMES.has(url.protocol.toLowerCase())) return false;
  const schemes = new Set(allowedSchemes.map(scheme => `${scheme.replace(/:$/, '').toLowerCase()}:`));
  if (!schemes.has(url.protocol.toLowerCase())) return false;
  if (url.protocol === 'mailto:') return true;
  if (url.protocol === 'https:') return normalizedOrigins(allowedOrigins).has(url.origin);
  return true;
}

function chosen(localized, locales) {
  return selectLocalizedText(localized, locales);
}

function plainAlternative(node, locales) {
  switch (node.kind) {
    case 'text': return chosen(node.value, locales);
    case 'markdown':
    case 'math': return chosen(node.plainText, locales);
    case 'image': return chosen(node.alt, locales);
    case 'audio':
    case 'video': return chosen(node.transcript, locales);
    case 'content-ref': return chosen(node.plainText, locales);
    case 'code': {
      const caption = node.caption ? chosen(node.caption, locales) : null;
      const locale = caption?.locale ?? locales[0] ?? 'en';
      return { text: [caption?.text, node.source || MESSAGE_CATALOG[locale.split('-')[0]]?.emptyCode || MESSAGE_CATALOG.en.emptyCode].filter(Boolean).join('\n'), locale, direction: caption?.direction ?? 'auto' };
    }
    case 'group': {
      const alternatives = node.children.map(child => plainAlternative(child, locales));
      const first = alternatives[0] ?? { locale: locales[0] ?? 'en', direction: 'auto' };
      return { text: alternatives.map(item => item.text).filter(Boolean).join('\n'), locale: first.locale, direction: first.direction };
    }
    default: return { text: '', locale: locales[0] ?? 'en', direction: 'auto' };
  }
}

function messageFor(key, locale, localize) {
  if (localize) {
    try {
      const translated = localize(`content.${key}`, locale);
      if (typeof translated === 'string' && translated.trim()) return { text: translated, locale };
    } catch { /* Fall back to the built-in English/Spanish message. */ }
  }
  const base = locale.toLowerCase().split('-')[0];
  return MESSAGE_CATALOG[base]?.[key]
    ? { text: MESSAGE_CATALOG[base][key], locale }
    : { text: MESSAGE_CATALOG.en[key], locale: 'en' };
}

function resultBase(node, alternative) {
  return { kind: node.kind, accessibleText: alternative.text, locale: alternative.locale, direction: alternative.direction };
}

function fallback(node, alternative, reason, key, localize, messageLocale = alternative.locale) {
  const message = messageFor(key, messageLocale, localize);
  return {
    ...resultBase(node, alternative),
    status: 'fallback',
    reason,
    renderedValue: null,
    message: { key: `content.${key}`, ...message }
  };
}

function capabilityMatches(driver, node) {
  const capabilities = driver.capabilities;
  if (!capabilities.kinds.includes(node.kind)) return false;
  if (node.kind === 'code' && capabilities.programmingLanguages && !capabilities.programmingLanguages.map(language => language.toLowerCase()).includes(node.programmingLanguage.toLowerCase())) return false;
  if (['image', 'audio', 'video'].includes(node.kind) && capabilities.mediaTypes && !capabilities.mediaTypes.map(type => type.toLowerCase()).includes(node.asset.mediaType.toLowerCase())) return false;
  try { return !driver.supports || driver.supports(node) === true; }
  catch { return false; }
}

function validateDriver(driver) {
  if (!driver || typeof driver.id !== 'string' || !driver.id.trim() || !driver.capabilities || !Array.isArray(driver.capabilities.kinds) || typeof driver.render !== 'function') {
    throw new TypeError('A renderer requires an id, declared kind capabilities, and a render function.');
  }
  if (driver.capabilities.kinds.some(kind => !KINDS.has(kind))) throw new TypeError('A renderer declares an unknown content kind.');
  for (const key of ['kinds', 'programmingLanguages', 'mediaTypes']) {
    const values = driver.capabilities[key];
    if (values !== undefined && (!Array.isArray(values) || values.some(value => typeof value !== 'string'))) throw new TypeError(`Renderer ${key} must be an array of strings.`);
  }
  if (driver.priority !== undefined && !Number.isFinite(driver.priority)) throw new TypeError('Renderer priority must be finite.');
  for (const hook of ['initialize', 'dispose', 'supports']) if (driver[hook] !== undefined && typeof driver[hook] !== 'function') throw new TypeError(`Renderer ${hook} must be a function.`);
}

/** Create a host-neutral async renderer registry. It never parses markup or fetches assets itself. */
export function createRendererRegistry({ drivers = [], localePreferences = [], localize, policy = {}, resolveAsset } = {}) {
  const markdownOrigins = [...(policy.markdown?.allowedOrigins ?? [])];
  const assetOrigins = [...(policy.assets?.allowedOrigins ?? [])];
  normalizedOrigins(markdownOrigins);
  normalizedOrigins(assetOrigins);
  const markdownPolicy = Object.freeze({ allowedSchemes: Object.freeze([...(policy.markdown?.allowedSchemes ?? ['https', 'mailto'])]), allowedOrigins: Object.freeze(markdownOrigins), rawHtml: 'escape' });
  const assetPolicy = Object.freeze({ allowedSchemes: Object.freeze([...(policy.assets?.allowedSchemes ?? ['https'])]), allowedOrigins: Object.freeze(assetOrigins) });
  const registered = new Map();
  const initialized = [];
  let started = false;
  let disposed = false;
  let initPromise;
  let disposePromise;
  let initError;
  let activeRenders = 0;
  let resolveIdle;

  function register(driver) {
    if (started || disposed) throw new Error('Renderers cannot be registered after initialization or disposal.');
    validateDriver(driver);
    if (registered.has(driver.id)) throw new Error(`Renderer id already registered: ${driver.id}`);
    const capabilities = Object.freeze({
      kinds: Object.freeze([...driver.capabilities.kinds]),
      ...(driver.capabilities.programmingLanguages && { programmingLanguages: Object.freeze(driver.capabilities.programmingLanguages.map(value => value.toLowerCase())) }),
      ...(driver.capabilities.mediaTypes && { mediaTypes: Object.freeze(driver.capabilities.mediaTypes.map(value => value.toLowerCase())) })
    });
    const stableDriver = Object.freeze({ ...driver, priority: driver.priority ?? 0, capabilities });
    registered.set(driver.id, stableDriver);
    let active = true;
    return () => {
      if (!active) return;
      if (started) throw new Error('Renderers cannot be removed after initialization.');
      if (registered.get(driver.id) === stableDriver) registered.delete(driver.id);
      active = false;
    };
  }

  for (const driver of drivers) register(driver);

  function detect(node) {
    if (!node || typeof node !== 'object' || !KINDS.has(node.kind)) return [];
    return [...registered.values()]
      .filter(driver => capabilityMatches(driver, node))
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.id.localeCompare(b.id))
      .map(driver => driver.id);
  }

  async function initialize() {
    if (disposed) throw new Error('Renderer registry has been disposed.');
    if (!initPromise) {
      started = true;
      initPromise = (async () => {
        try {
          for (const driver of registered.values()) {
            await driver.initialize?.();
            initialized.push(driver);
          }
        } catch (error) {
          initError = error;
          for (const driver of initialized.splice(0).reverse()) {
            try { await driver.dispose?.(); } catch { /* Preserve the initialization failure. */ }
          }
        }
      })();
    }
    await initPromise;
    return { initialized: !initError, error: initError };
  }

  async function renderActive(input, options = {}) {
    if (!input || typeof input !== 'object' || !KINDS.has(input.kind)) throw new TypeError('render expects a valid ContentNode; validate content before rendering.');
    const node = JSON.parse(JSON.stringify(input));
    const freezeTree = value => {
      if (value && typeof value === 'object') {
        for (const child of Object.values(value)) freezeTree(child);
        Object.freeze(value);
      }
      return value;
    };
    freezeTree(node);
    if (disposed) throw new Error('Renderer registry has been disposed.');
    const locales = options.localePreferences ?? localePreferences;
    const alternative = plainAlternative(node, locales);
    const base = resultBase(node, alternative);
    const fail = (reason, key) => fallback(node, alternative, reason, key, localize, locales[0] ?? alternative.locale);
    const init = await initialize();
    if (!init.initialized) return fail('render-error', 'renderError');
    if (options.signal?.aborted) return fail('aborted', 'renderError');

    const ids = detect(node);
    if (!ids.length) {
      const codeDrivers = [...registered.values()].filter(driver => driver.capabilities.kinds.includes('code'));
      const languageUnsupported = node.kind === 'code' && codeDrivers.length > 0 && codeDrivers.every(driver => driver.capabilities.programmingLanguages && !driver.capabilities.programmingLanguages.includes(node.programmingLanguage.toLowerCase()));
      return fail(languageUnsupported ? 'unsupported-language' : 'unsupported', languageUnsupported ? 'unsupportedLanguage' : 'unsupported');
    }

    let asset;
    if (['image', 'audio', 'video'].includes(node.kind)) {
      if (!resolveAsset) return fail('media-unavailable', 'mediaUnavailable');
      if (node.asset.uri && !isAllowedContentUri(node.asset.uri, { ...assetPolicy, allowedSchemes: assetPolicy.allowedSchemes.filter(scheme => scheme.toLowerCase().replace(/:$/, '') === 'https') })) return fail('blocked-asset-uri', 'blockedAsset');
      try { asset = await resolveAsset(node.asset, options.signal); }
      catch { return fail('media-unavailable', 'mediaUnavailable'); }
      if (asset === undefined || asset === null) return fail('media-unavailable', 'mediaUnavailable');
    }

    const request = Object.freeze({
      node,
      kind: node.kind,
      locale: alternative.locale,
      direction: alternative.direction,
      accessibleText: alternative.text,
      source: ['markdown', 'math', 'code'].includes(node.kind) ? node.source : undefined,
      programmingLanguage: node.kind === 'code' ? node.programmingLanguage : undefined,
      asset,
      signal: options.signal,
      markdownPolicy,
      isMarkdownUriAllowed: uri => isAllowedContentUri(uri, markdownPolicy),
      resolveMarkdownAsset: async uri => {
        if (!resolveAsset || !isAllowedContentUri(uri, { ...markdownPolicy, allowedSchemes: markdownPolicy.allowedSchemes.filter(scheme => scheme === 'https') })) return null;
        return resolveAsset(Object.freeze({ kind: 'markdown-asset', uri }), options.signal);
      }
    });

    let hadError = false;
    for (const id of ids) {
      const driver = registered.get(id);
      try {
        const output = await driver.render(request);
        if (!output || !Object.hasOwn(output, 'value')) throw new Error('Renderer did not return a value.');
        if (['math', 'code'].includes(node.kind) && (output.source !== node.source || output.accessibleAlternative !== alternative.text)) throw new Error('Math/code renderers must preserve source and the nonvisual alternative.');
        return { ...base, status: 'rendered', renderedValue: output.value, source: request.source };
      } catch { hadError = true; }
    }
    return fail(hadError ? 'render-error' : 'unsupported', hadError ? 'renderError' : 'unsupported');
  }

  async function render(node, options = {}) {
    if (disposed) throw new Error('Renderer registry has been disposed.');
    activeRenders++;
    try { return await renderActive(node, options); }
    finally {
      activeRenders--;
      if (activeRenders === 0 && resolveIdle) {
        resolveIdle();
        resolveIdle = undefined;
      }
    }
  }

  async function dispose() {
    if (!disposePromise) {
      disposed = true;
      disposePromise = (async () => {
        if (initPromise) await initPromise;
        if (activeRenders > 0) await new Promise(resolve => { resolveIdle = resolve; });
        const errors = [];
        for (const driver of initialized.splice(0).reverse()) {
          try { await driver.dispose?.(); } catch (error) { errors.push(error); }
        }
        if (errors.length) throw new AggregateError(errors, 'One or more renderers failed to dispose.');
      })();
    }
    return disposePromise;
  }

  return Object.freeze({ register, detect, initialize, render, dispose });
}
