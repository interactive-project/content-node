import type { ContentNode, DeepReadonly } from '../types/content-node.js';
export interface ContentRenderSignal { readonly aborted: boolean }
export type RenderKind = ContentNode['kind'];
export interface RendererCapabilities {
  kinds: RenderKind[];
  programmingLanguages?: string[];
  mediaTypes?: string[];
}
export interface ContentRendererRequest {
  readonly node: DeepReadonly<ContentNode>;
  readonly kind: RenderKind;
  readonly locale: string;
  readonly direction: 'ltr' | 'rtl' | 'auto';
  readonly accessibleText: string;
  readonly source?: string;
  readonly programmingLanguage?: string;
  readonly asset?: unknown;
  readonly signal?: ContentRenderSignal;
  readonly markdownPolicy: Readonly<{ allowedSchemes: readonly string[]; allowedOrigins: readonly string[]; rawHtml: 'escape' }>;
  isMarkdownUriAllowed(uri: string): boolean;
  resolveMarkdownAsset(uri: string): Promise<unknown | null>;
}
export interface ContentRendererOutput {
  value: unknown;
  /** Required for math/code and must exactly equal the original source. */
  source?: string;
  /** Required for math/code and must exactly equal request.accessibleText. */
  accessibleAlternative?: string;
}
export interface ContentRendererDriver {
  id: string;
  priority?: number;
  capabilities: RendererCapabilities;
  supports?(node: DeepReadonly<ContentNode>): boolean;
  initialize?(): void | Promise<void>;
  render(request: ContentRendererRequest): ContentRendererOutput | Promise<ContentRendererOutput>;
  dispose?(): void | Promise<void>;
}
export interface RendererPolicy {
  markdown?: { allowedSchemes?: string[]; allowedOrigins?: string[] };
  assets?: { allowedSchemes?: string[]; allowedOrigins?: string[] };
}
export interface RenderResult {
  kind: RenderKind;
  status: 'rendered' | 'fallback';
  reason?: 'unsupported' | 'unsupported-language' | 'media-unavailable' | 'blocked-asset-uri' | 'render-error' | 'aborted';
  accessibleText: string;
  locale: string;
  direction: 'ltr' | 'rtl' | 'auto';
  renderedValue: unknown | null;
  source?: string;
  message?: { key: string; text: string; locale: string };
}
export declare function isAllowedContentUri(value: string, policy?: { allowedSchemes?: string[]; allowedOrigins?: string[] }): boolean;
export declare function createRendererRegistry(options?: {
  drivers?: ContentRendererDriver[];
  localePreferences?: string[];
  localize?: (messageKey: string, locale: string) => string;
  policy?: RendererPolicy;
  resolveAsset?: (asset: unknown, signal?: ContentRenderSignal) => unknown | null | Promise<unknown | null>;
}): Readonly<{
  register(driver: ContentRendererDriver): () => void;
  detect(node: ContentNode): string[];
  initialize(): Promise<{ initialized: boolean; error?: unknown }>;
  render(node: ContentNode, options?: { localePreferences?: string[]; signal?: ContentRenderSignal }): Promise<RenderResult>;
  dispose(): Promise<void>;
}>;
