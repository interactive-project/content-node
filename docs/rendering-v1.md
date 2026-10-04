# Host-neutral rendering contract v1

`@interactive-project/content-node/rendering` coordinates renderer selection and fallbacks; it does not select a UI framework, parse Markdown, produce DOM, or fetch media. Callers validate a `ContentNode` first. Drivers are trusted host code, not executable behavior supplied by content data. An application can register a DOM, React, Vue, Svelte, server, or custom driver without changing the portable ContentNode schema.

## Registration, capabilities and lifecycle

Each driver has a stable host-local `id`, declared `capabilities.kinds`, and a `render(request)` function. It may further declare programming languages/media types, a synchronous `supports(node)` predicate, a priority, and async `initialize()` / `dispose()` hooks. `detect(node)` returns eligible IDs in descending priority then stable ID order. Drivers initialize once, in registration order, on first render or explicit initialization; disposal runs once in reverse order and waits for in-flight renders. Registration/removal ends when initialization starts. Initialization failures are recoverable render failures, and initialized drivers are unwound. Each render receives a deep-frozen JSON snapshot, so a driver cannot mutate the caller's content or another render's source.

The registry does not infer support from a package name. A driver must declare the kinds and (when relevant) languages/media it really handles. An absent kind gets an explicit `unsupported` result; a code node for which all declared code drivers lack its language gets `unsupported-language`. A renderer can return any ephemeral host value, but that value is never part of portable content data.

## Safe Markdown and media

Markdown is source text, never trusted HTML. The registry always supplies `markdownPolicy.rawHtml: "escape"`; adapters must parse with raw HTML disabled or escaped and must not pass source to `innerHTML`, `dangerouslySetInnerHTML`, or an equivalent raw insertion API. This package does not include a Markdown parser or claim to sanitize arbitrary renderer output. Select and review the parser/renderer as trusted host code.

Markdown links use `isMarkdownUriAllowed` on the parser's final decoded destination before becoming navigable. Relative in-document links are allowed; absolute targets are restricted to the configured schemes and exact HTTPS origins. Defaults allow `https` and `mailto`, but no remote HTTPS origin until an origin is explicitly listed. Additional schemes require explicit host configuration; script/data/file URLs remain blocked even if listed. Protocol-relative URLs, control characters, and backslash-obfuscated targets are rejected. Markdown images must use `resolveMarkdownAsset`, which applies the HTTPS origin allowlist before calling the host resolver. Drivers must not bypass these helpers for links or images.

ContentNode image/audio/video assets are resolved only through the host-supplied `resolveAsset` callback. A URI-bearing asset is passed to that callback only when its scheme and exact origin are allowed by `policy.assets`; defaults permit HTTPS syntax but no remote origins. The host resolver owns network permission, must recheck redirect destinations and credentials, and owns MIME/type and byte limits, integrity verification, caching, and cancellation. No callback, rejected URI, thrown fetch, or missing asset yields a recoverable `media-unavailable` or `blocked-asset-uri` result with the localized alt/transcript. ContentRef IDs are never fetched by this registry.

## Accessibility, source and recovery

Every result has a plain-text `accessibleText`, chosen locale, and direction. Text, Markdown, math, image, media, and ContentRef use their declared LocalizedText alternatives; groups compose child alternatives; code includes its caption and exact source (or a localized empty-snippet message). Recovery messages use the host's first locale preference, independently of the selected content translation (which may fall back to a different locale). Hosts remain responsible for mapping locale/direction and the plain alternative into their own accessible semantics.

Math and code drivers receive exact `source` plus `accessibleText`, and must return both unchanged as `source` and `accessibleAlternative`. A mismatch is treated as a renderer error and falls back to the accessible text. Math must expose the supplied plain-language equivalent; code remains display-only and must expose its source without execution. Unknown languages, unavailable media, aborts, and renderer exceptions return a localized message key/text and usable fallback, so hosts can retry or replace a driver without losing content. Hosts can supply `localize(key, locale)`; English and Spanish recovery messages are built in, with English as the last resort.

## Host conformance fixtures and compatibility

`fixtures/rendering/hosts.json` records DOM, React, Vue, and Svelte host profiles. The headless tests run each profile through the same semantic contract and require equivalent fallback, language/direction, and source behavior while allowing distinct host result shapes. These are adapter-contract fixtures, not claims that framework packages or production host adapters ship from this repository. Real framework behavior still needs integration tests in each owning host repository.

This is an additive optional package subpath. It changes no ContentNode, Protocol, ActivitySpec, or stored data schema, so there is no content migration. Existing consumers can continue using the pure root export. Host adapters and concrete renderer dependencies remain opt-in and separately owned.
