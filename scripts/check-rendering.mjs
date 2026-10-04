import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRendererRegistry, isAllowedContentUri } from '../rendering/index.js';
const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const hosts = read('../fixtures/rendering/hosts.json');
const text = read('../fixtures/text.json');
const math = read('../fixtures/math.json');
const code = read('../fixtures/code.json');
const image = read('../fixtures/image.json');
const markdown = { kind: 'markdown', schemaVersion: '1.0.0', source: '<img src=x onerror=alert(1)> [bad](javascript:alert(1)) ![remote](https://cdn.example.org/p.png)', plainText: text.value };

assert.equal(isAllowedContentUri('javascript:alert(1)'), false);
assert.equal(isAllowedContentUri('javascript:alert(1)', { allowedSchemes: ['javascript'] }), false);
assert.equal(isAllowedContentUri('data:text/html,x'), false);
assert.equal(isAllowedContentUri('//evil.example/x'), false);
assert.equal(isAllowedContentUri('https://cdn.example.org/x', { allowedOrigins: ['https://cdn.example.org'] }), true);
assert.equal(isAllowedContentUri('https://other.example/x', { allowedOrigins: ['https://cdn.example.org'] }), false);
assert.equal(isAllowedContentUri('tel:+15555550123', { allowedSchemes: ['https', 'mailto', 'tel'] }), true);
assert.equal(isAllowedContentUri('../local/path'), true);

const initialized = [], disposed = [], semanticResults = [], fallbackResults = [], hostValues = [];
for (const profile of hosts) {
  const registry = createRendererRegistry({ localePreferences: ['es-MX'], drivers: [{
    id: profile.host,
    capabilities: { kinds: ['text'] },
    initialize() { initialized.push(profile.host); },
    supports(node) { return node.kind === 'text'; },
    render(request) {
      assert.equal(Object.isFrozen(request.node), true);
      assert.equal(Object.isFrozen(request.node.value), true);
      assert.equal(request.locale, 'es');
      assert.equal(request.direction, 'auto');
      return { value: { host: profile.host, shape: profile.resultShape, visibleText: request.accessibleText } };
    },
    dispose() { disposed.push(profile.host); }
  }] });
  assert.deepEqual(registry.detect(text), [profile.host]);
  const result = await registry.render(text);
  assert.equal(result.status, 'rendered');
  semanticResults.push([result.kind, result.accessibleText, result.locale, result.direction, result.status]);
  hostValues.push(JSON.stringify(result.renderedValue));
  const fallback = await registry.render(math);
  assert.equal(fallback.status, 'fallback');
  fallbackResults.push([fallback.kind, fallback.accessibleText, fallback.locale, fallback.direction, fallback.status, fallback.reason, fallback.message.locale, fallback.message.text]);
  await registry.dispose();
}
assert.equal(new Set(semanticResults.map(JSON.stringify)).size, 1, 'host adapters preserve shared semantics');
assert.equal(new Set(fallbackResults.map(JSON.stringify)).size, 1, 'host adapters preserve accessible fallback semantics');
assert.equal(new Set(hostValues).size, hosts.length, 'host-native output shapes need not match');
assert.deepEqual(initialized, hosts.map(host => host.host));
assert.deepEqual(disposed, hosts.map(host => host.host));

let imageLookups = 0, markdownLookups = 0;
const markdownRegistry = createRendererRegistry({
  policy: { markdown: { allowedOrigins: ['https://cdn.example.org'] } },
  resolveAsset: async asset => { markdownLookups++; return asset.uri; },
  drivers: [{ id: 'markdown-host', capabilities: { kinds: ['markdown'] }, async render(request) {
    assert.equal(request.source, markdown.source);
    assert.equal(request.markdownPolicy.rawHtml, 'escape');
    assert.equal(request.isMarkdownUriAllowed('javascript:alert(1)'), false);
    assert.equal(request.isMarkdownUriAllowed('https://evil.example/x'), false);
    assert.equal(request.isMarkdownUriAllowed('https://cdn.example.org/x'), true);
    assert.equal(await request.resolveMarkdownAsset('javascript:alert(1)'), null);
    assert.equal(await request.resolveMarkdownAsset('https://cdn.example.org/p.png'), 'https://cdn.example.org/p.png');
    return { value: { host: 'markdown' } };
  } }]
});
assert.equal((await markdownRegistry.render(markdown)).status, 'rendered');
assert.equal(markdownLookups, 1, 'disallowed embedded assets never reach the host resolver');
await markdownRegistry.dispose();

const mathRegistry = createRendererRegistry({ drivers: [{ id: 'math-host', capabilities: { kinds: ['math'] }, render(request) {
  assert.equal(request.source, math.source);
  assert.equal(request.accessibleText, 'One half plus one half equals one.');
  return { value: { formula: true }, source: request.source, accessibleAlternative: request.accessibleText };
} }] });
const mathResult = await mathRegistry.render(math);
assert.equal(mathResult.status, 'rendered');
assert.equal(mathResult.source, math.source);
await mathRegistry.dispose();

const codeRegistry = createRendererRegistry({ drivers: [{ id: 'code-host', capabilities: { kinds: ['code'], programmingLanguages: ['javascript'] }, render(request) {
  assert.equal(request.source, code.source);
  assert.equal(request.accessibleText.includes(code.source), true);
  return { value: { highlighted: false }, source: request.source, accessibleAlternative: request.accessibleText };
} }] });
const codeResult = await codeRegistry.render(code);
assert.equal(codeResult.status, 'rendered');
assert.equal(codeResult.source, code.source);
await codeRegistry.dispose();

const lifecycle = [];
const lifecycleRegistry = createRendererRegistry({ drivers: ['first', 'second'].map(id => ({
  id, capabilities: { kinds: ['text'] }, initialize() { lifecycle.push(`init:${id}`); },
  render: () => ({ value: null }), dispose() { lifecycle.push(`dispose:${id}`); }
})) });
await lifecycleRegistry.initialize();
await lifecycleRegistry.dispose();
assert.deepEqual(lifecycle, ['init:first', 'init:second', 'dispose:second', 'dispose:first']);

let releasePendingRender, markRenderStarted;
const renderStarted = new Promise(resolve => { markRenderStarted = resolve; });
const waitingForRender = createRendererRegistry({ drivers: [{ id: 'slow', capabilities: { kinds: ['text'] }, render: () => new Promise(resolve => {
  releasePendingRender = resolve;
  markRenderStarted();
}) }] });
const pendingRender = waitingForRender.render(text);
await renderStarted;
let disposalFinished = false;
const pendingDisposal = waitingForRender.dispose().then(() => { disposalFinished = true; });
const sameDisposal = waitingForRender.dispose();
await Promise.resolve();
assert.equal(disposalFinished, false, 'dispose waits for active renderer callbacks');
releasePendingRender({ value: 'finished' });
assert.equal((await pendingRender).status, 'rendered');
await pendingDisposal;
await sameDisposal;
assert.equal(disposalFinished, true);

const sourceBreaking = createRendererRegistry({ drivers: [{ id: 'bad-math', capabilities: { kinds: ['math'] }, render(request) {
  return { value: 'lost-source', source: `${request.source} `, accessibleAlternative: request.accessibleText };
} }] });
const mathFallback = await sourceBreaking.render(math, { localePreferences: ['es'] });
assert.equal(mathFallback.status, 'fallback');
assert.equal(mathFallback.reason, 'render-error');
assert.equal(mathFallback.accessibleText, 'One half plus one half equals one.');
assert.equal(mathFallback.locale, 'en', 'fallback text keeps its actual selected locale');
assert.equal(mathFallback.message.locale, 'es', 'recovery messages use the host locale preference');
assert.equal(mathFallback.message.text, 'No se pudo mostrar este contenido. Se muestra la alternativa textual.');
await sourceBreaking.dispose();

const jsOnly = createRendererRegistry({ localePreferences: ['es'], drivers: [{ id: 'js-only', capabilities: { kinds: ['code'], programmingLanguages: ['javascript'] }, render: request => ({ value: request.source, source: request.source, accessibleAlternative: request.accessibleText }) }] });
const python = { ...code, programmingLanguage: 'python' };
const unsupportedLanguage = await jsOnly.render(python);
assert.equal(unsupportedLanguage.reason, 'unsupported-language');
assert.equal(unsupportedLanguage.message.text, 'Este lenguaje de programación no es compatible aquí.');
assert.equal(unsupportedLanguage.accessibleText.includes(python.source), true);
await jsOnly.dispose();

const noMedia = createRendererRegistry({ localePreferences: ['es'], drivers: [{ id: 'image', capabilities: { kinds: ['image'] }, render: () => ({ value: 'unused' }) }] });
const missingMedia = await noMedia.render(image);
assert.equal(missingMedia.reason, 'media-unavailable');
assert.equal(missingMedia.accessibleText, 'A right triangle with sides three, four and five.');
assert.equal(missingMedia.message.text, 'Este medio no está disponible. Se muestra la alternativa textual.');
await noMedia.dispose();

const media = createRendererRegistry({
  policy: { assets: { allowedOrigins: ['https://assets.example.org'] } },
  resolveAsset: async asset => { imageLookups++; return { id: asset.id }; },
  drivers: [{ id: 'image-ok', capabilities: { kinds: ['image'], mediaTypes: ['image/png'] }, render: request => ({ value: request.asset }) }]
});
assert.equal((await media.render(image)).status, 'rendered');
const blockedImage = { ...image, asset: { ...image.asset, uri: 'https://other.example/triangle' } };
const blocked = await media.render(blockedImage);
assert.equal(blocked.reason, 'blocked-asset-uri');
assert.equal(imageLookups, 1, 'disallowed remote assets never reach the host resolver');
await media.dispose();

const failedInitialization = createRendererRegistry({ localePreferences: ['en'], drivers: [{ id: 'broken-init', capabilities: { kinds: ['text'] }, initialize() { throw new Error('private detail'); }, render: () => ({ value: 'never' }) }] });
const initFallback = await failedInitialization.render(text);
assert.equal(initFallback.reason, 'render-error');
assert.equal(initFallback.message.text, 'This content could not be rendered. The text alternative is shown.');
await failedInitialization.dispose();

const untranslatedRecovery = await createRendererRegistry({ drivers: [] }).render(text, { localePreferences: ['fr'] });
assert.equal(untranslatedRecovery.message.text, 'This content is not supported here.');
assert.equal(untranslatedRecovery.message.locale, 'en', 'message metadata matches built-in fallback language');

const abortController = new AbortController();
abortController.abort();
const aborted = await createRendererRegistry().render(text, { signal: abortController.signal });
assert.equal(aborted.reason, 'aborted');
console.log(`Rendering: ${hosts.length} host profiles, safe URI/HTML policy, source preservation, lifecycle, localization, media and recovery passed.`);
