# Portable content v1

Every concrete node has kind and exact schemaVersion 1.0.0. The closed discriminated schema owns text, markdown, math, image, code, audio, video and group; protocol's existing content-ref is also a valid child/root. Each node may carry canonical BCP 47 language and protocol Accessibility metadata. Localized text uses Protocol 1.0.0's explicit default, canonical locale keys, Unicode direction and deterministic host-preference fallback. There is no automatic language guessing or translation.

| Kind | Required data | Meaning |
| --- | --- | --- |
| text | value LocalizedText | Plain multilingual text; no markup interpretation |
| markdown | source, plainText LocalizedText | Markdown source and plain fallback; dialect/rendering safety belongs to a renderer policy |
| math | format tex, source, plainText LocalizedText | Formula source and readable equivalent; never rendered HTML/SVG or native math object |
| image | AssetRef, alt LocalizedText | Image asset with required informative alternative text; optional caption |
| code | source, programmingLanguage | Display-only snippet; optional caption; execution flags, services and runtime objects are rejected |
| audio | AssetRef, transcript LocalizedText | Audio with textual equivalent and optional caption |
| video | AssetRef, transcript LocalizedText, timed captions | Captioned video with transcript, optional caption/poster image |
| group | nonempty children | Ordered recursive mixed content; optional inline/block layout defaults to block |
| content-ref | Protocol id and plainText | Opaque shared-content identity and portable fallback; never a fetch command |

Asset identity, optional durable locator, media type, integrity and attribution reuse the exact Protocol AssetRef. Image/audio/video media types must match their kind; poster type must be image. No filesystem paths, signed URLs, credentials, query/fragment URLs or provider-native objects are persisted. Asset existence, integrity, MIME decoding, network origin and fetch permission require host validation when rendering; the headless contract does not retrieve assets.

Timed captions use seconds from zero, ordered nonoverlapping start/end intervals with end greater than start and values no greater than 86,400. Caption text/transcript/alt/title remain LocalizedText, preserving explicit defaults and directions. This first version supports informative images and captioned/transcribed media. Decorative-image exceptions, silent-video policies, rich transcript trees and additional formula encodings require a later explicit contract decision; not silent defaults.

## Bounded composition and normalization

Children preserve array order. Maximum group width is 200, content depth 16 (root depth zero), and total content nodes 2,000. Before schema evaluation, a descriptor-based JSON copy imposes 2 MiB UTF-8, JSON depth 64, 2,000 collection entries, 100,000 Unicode code points per string and 50,000 JSON values. Snippets/markdown allow 100,000 characters, TeX 16,000, and LocalizedText entries 4,000. Limits reject rather than truncate, flatten or omit data. Getters, prototypes carrying executable behavior, cycles, sparse arrays and non-JSON values reject without calling serializers.

normalizeContent is a pure convenience for typed ContentNode values. It enforces resource/composition limits, canonicalizes language/default/translation locale identifiers, rejects locale collisions, normalizes CRLF and CR to LF in snippet/markdown/math sources and localized text, sorts object and translation keys, retains array order, supplies block for omitted group layout and returns an isolated deeply frozen value. It does not collapse whitespace, Unicode-normalize strings, rewrite math/code, resolve references/assets, execute snippets, parse Markdown or sanitize/render HTML. Canonicalization depends on the supported host Intl locale implementation. Repeated normalization is idempotent. Structurally/semantically validate the normalized result before rendering; the normalization function itself is not a replacement for schema validation.

validateContent consumes unknown input, applies bounds, validates closed variants, then shared locale/default/asset semantics, media types, caption order and recursive content budgets. Diagnostics have stable content.* or Protocol input/generation codes, RFC 6901 pointers and static safe messages. Validation preserves the caller input. Schemas resolve offline through a pinned installed Protocol schema; data cannot register or retrieve schemas.

## Reuse, compatibility and verification

A node can live in a domain-owned prompt, feedback, flashcard face, graph label or embedded activity configuration, provided that domain declares its content boundary. Shared ContentRef remains usable by consumers without this package; its plainText fallback still works. Protocol does not import ContentNode. Real domain/Core/host rendering contracts remain subject to their later implementation issues. Embedding fixtures validate the shared ActivitySpec envelope for quiz/flashcards/whiteboard without asserting those concrete engines are already released.

Tests run the same 18 valid/invalid structural fixtures through JavaScript Ajv and independent Python Draft 2020-12; semantic failures are classified separately. They check each variant, multilingual fallback, mathematical prompts, media captions, mixed groups, schema/TypeScript consistency, ES2022-only imports, normalization/nonmutation/idempotence, exact composition/string/byte boundaries, invalid locators, unknown reference fallback and code/math separation. No browser renderer or media execution is claimed. Sanitization/rendering and host accessibility implementations belong to content-node#2/#3.

Existing Protocol wire schemas and versions remain unchanged. New authored ContentNode data is versioned 1.0.0 with no earlier released content format to migrate. The package is implemented in repository version 0.1.0; npm publication is separate. Shared decision: improvement-proposals/decisions/content-node-v1.md.
