import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { copyGeneratedJson } from '@interactive-project/protocol/generation/json';
import { canonicalLocale } from '@interactive-project/protocol/content';
import { validateSharedContent } from '@interactive-project/protocol/validation/shared-content';
import { contentLimits } from '../index.js';
const require = createRequire(import.meta.url);
const shared = JSON.parse(readFileSync(require.resolve('@interactive-project/protocol/schemas/shared-content.v1.schema.json')));
const schema = JSON.parse(readFileSync(new URL('../schemas/content-node.v1.schema.json', import.meta.url)));
const ajv = new Ajv2020({ strict: true, allErrors: true, ownProperties: true }); addFormats(ajv); ajv.addSchema(shared);
const validate = ajv.compile(schema), escape = text => text.replace(/~/g,'~0').replace(/\//g,'~1');
const diagnostic = (code,path,message) => ({code,path,severity:'error',message});
export function validateContent(input) {
  const {maxContentDepth,maxContentNodes,...jsonLimits}=contentLimits;
  const prepared=copyGeneratedJson(input,jsonLimits);
  if(!prepared.valid) return {valid:false,diagnostics:prepared.diagnostics};
  const value=prepared.value;
  if(!validate(value)) {
    const errors=validate.errors.map(error=>diagnostic('content.schema',error.instancePath+(error.params.missingProperty!==undefined?'/'+escape(error.params.missingProperty):error.params.additionalProperty!==undefined?'/'+escape(error.params.additionalProperty):''),'The value violates the ContentNode schema.'));
    return {valid:false,diagnostics:[...new Map(errors.map(e=>[JSON.stringify(e),e])).values()]};
  }
  const diagnostics=[]; let count=0;
  function visit(node,path,depth) {
    if(++count>maxContentNodes || depth>maxContentDepth) { diagnostics.push(diagnostic('content.composition',path,'The content composition exceeds its budget.')); return; }
    if(node.language!==undefined) {try {if(canonicalLocale(node.language)!==node.language) throw Error();}catch {diagnostics.push(diagnostic('content.locale',path+'/language','A canonical supported locale is required.'));}}
    function sharedValue(value,pointer) {const result=validateSharedContent(value); if(!result.valid) diagnostics.push(...result.diagnostics.map(e=>({...e,path:pointer+e.path})));}
    if(node.kind==='content-ref') {sharedValue(node,path); return;}
    for(const key of ['value','plainText','accessibility','asset','alt','caption','transcript','poster']) if(node[key]!==undefined) sharedValue(node[key],path+'/'+key);
    if(['image','audio','video'].includes(node.kind) && !node.asset.mediaType.startsWith(node.kind+'/')) diagnostics.push(diagnostic('content.mediaType',path+'/asset/mediaType','The asset type must match its content variant.'));
    if(node.poster && !node.poster.mediaType.startsWith('image/')) diagnostics.push(diagnostic('content.mediaType',path+'/poster/mediaType','The poster must be an image asset.'));
    if(node.kind==='video') {let end=0; for(let i=0;i<node.captions.length;i++){const cue=node.captions[i]; if(cue.end<=cue.start || cue.start<end) diagnostics.push(diagnostic('content.captionOrder',path+'/captions/'+i,'Captions must have increasing nonoverlapping intervals.'));end=cue.end;sharedValue(cue.text,path+'/captions/'+i+'/text');}}
    if(node.kind==='group') node.children.forEach((child,i)=>visit(child,path+'/children/'+i,depth+1));
  }
  visit(value,'',0);
  return diagnostics.length?{valid:false,diagnostics}:{valid:true,diagnostics:[]};
}
