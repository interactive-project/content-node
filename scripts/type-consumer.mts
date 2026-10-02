import { normalizeContent, type ContentNode } from '@interactive-project/content-node';
import { validateContent } from '@interactive-project/content-node/validation';
const node: ContentNode = {kind:'code',schemaVersion:'1.0.0',programmingLanguage:'javascript',source:'1+1'};
const normalized = normalizeContent(node);
if(normalized.kind==='code') {
 const source:string=normalized.source; void source;
 // @ts-expect-error Normalized values are readonly.
 normalized.source='mutated';
 // @ts-expect-error Content snippets do not grant execution.
 const executable:ContentNode={...node,execute:true}; void executable;
}
const result=validateContent(node); if(!result.valid) { const pointer:string=result.diagnostics[0].path;void pointer;}
