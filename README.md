# Interactive Project Content Node

Portable, versioned text, markdown, TeX source, image, code snippet, audio, video, ContentRef and bounded group composition.

- [Content contract and deterministic normalization](docs/content-v1.md)
- [Host-neutral rendering contract and safety policy](docs/rendering-v1.md)
- [Draft 2020-12 JSON Schema](schemas/content-node.v1.schema.json)
- [Shared conformance fixtures](fixtures/conformance.json)

The pure package entry normalizes already typed content without UI, rendering, fetching or execution. The optional `@interactive-project/content-node/rendering` entry provides an async driver registry and accessible fallback orchestration; concrete framework renderers and asset retrieval remain host-owned. The optional Node validation entry checks structural and semantic invariants using offline schemas. Protocol owns reusable LocalizedText, Accessibility, AssetRef and ContentRef; protocol never imports this package.

Run npm ci --ignore-scripts, install scripts/requirements.txt, then npm test. Development pins Protocol to commit 0280e004ba863621a257b96819f34295c8db0ea7; no npm release of either package is asserted.
