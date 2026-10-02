import type { LocalizedText, Accessibility, AssetRef, ContentRef } from '@interactive-project/protocol/content';
export interface ContentBase { schemaVersion: '1.0.0'; language?: string; accessibility?: Accessibility }
export interface TextContent extends ContentBase { kind: 'text'; value: LocalizedText }
export interface MarkdownContent extends ContentBase { kind: 'markdown'; source: string; plainText: LocalizedText }
export interface MathContent extends ContentBase { kind: 'math'; format: 'tex'; source: string; plainText: LocalizedText }
export interface ImageContent extends ContentBase { kind: 'image'; asset: AssetRef; alt: LocalizedText; caption?: LocalizedText }
export interface CodeContent extends ContentBase { kind: 'code'; source: string; programmingLanguage: string; caption?: LocalizedText }
export interface AudioContent extends ContentBase { kind: 'audio'; asset: AssetRef; transcript: LocalizedText; caption?: LocalizedText }
export interface CaptionCue { start: number; end: number; text: LocalizedText }
export interface VideoContent extends ContentBase { kind: 'video'; asset: AssetRef; transcript: LocalizedText; captions: CaptionCue[]; caption?: LocalizedText; poster?: AssetRef }
export interface GroupContent extends ContentBase { kind: 'group'; layout?: 'inline' | 'block'; children: ContentNode[] }
export type ContentNode = TextContent | MarkdownContent | MathContent | ImageContent | CodeContent | AudioContent | VideoContent | GroupContent | ContentRef;
export type DeepReadonly<T> = T extends object ? { readonly [P in keyof T]: DeepReadonly<T[P]> } : T;
export declare const contentLimits: Readonly<{maxBytes:number;maxDepth:number;maxCollectionSize:number;maxStringLength:number;maxNodes:number;maxContentDepth:number;maxContentNodes:number}>;
export declare class ContentNormalizationError extends Error { readonly code: string }
export declare function normalizeContent(input: ContentNode): DeepReadonly<ContentNode>;
