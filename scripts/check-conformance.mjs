import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { normalizeContent, contentLimits } from '../index.js';
import { validateContent } from '../validation/index.js';
import { validateSharedContent } from '@interactive-project/protocol/validation/shared-content';
import { selectLocalizedText } from '@interactive-project/protocol/content';
import { validateActivitySpec } from '@interactive-project/protocol/validation';
const require=createRequire(import.meta.url), read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url)));
const schema=read('../schemas/content-node.v1.schema.json'), shared=JSON.parse(readFileSync(require.resolve('@interactive-project/protocol/schemas/shared-content.v1.schema.json')));
const ajv=new Ajv2020({strict:true,allErrors:true});addFormats(ajv);ajv.addSchema(shared);const structural=ajv.compile(schema);
const manifest=read('../fixtures/conformance.json');
for(const entry of manifest){
 const node=read('../fixtures/'+entry.file), before=JSON.stringify(node), result=validateContent(node);
 assert.equal(result.valid,entry.valid,entry.file);assert.equal(JSON.stringify(node),before);
 if(entry.valid){
 const normalized=normalizeContent(node);assert(validateContent(normalized).valid);assert(Object.isFrozen(normalized));
 assert.equal(JSON.stringify(normalizeContent(normalized)),JSON.stringify(normalized),'Normalization must be idempotent');
 const serialized=JSON.parse(JSON.stringify(normalized));
 assert.equal(JSON.stringify(normalizeContent(serialized)),JSON.stringify(normalized),'Canonical content must survive JSON serialization round trips');
 }
 const structurallyValid=entry.valid||entry.structural===false;
 assert.equal(structural(node),structurallyValid,entry.file+': structural');
}
const mixed=read('../fixtures/mixed.json'), text=read('../fixtures/text.json');
assert.equal(selectLocalizedText(text.value,['es-MX']).text,'¿Cuánto es dos más dos?');
const embeddingFixtures=read('../fixtures/portability/activity-embeddings.json');
const configs={
 quiz:{prompt:mixed},
 flashcards:{cards:[{front:mixed,back:text}]},
 diagram:{nodes:[{id:'node-1',label:mixed}]},
 whiteboard:{objects:[{id:'object-1',label:mixed}]}
};
const embeddedCanonical=[];
for(const fixture of embeddingFixtures){
 const config=configs[fixture.activity], embedded=fixture.slot.reduce((value,key)=>value[key],config);
 const spec={protocolVersion:'1.0.0',id:'00000000-0000-4000-8000-000000000001',type:'interactive-project/'+fixture.activity,activitySchemaVersion:'0.0.1',metadata:{title:'Content portability fixture'},config};
 assert(validateActivitySpec(spec).valid);assert(validateContent(embedded).valid);
 embeddedCanonical.push(JSON.stringify(normalizeContent(embedded)));
}
assert.equal(new Set(embeddedCanonical).size,1,'one canonical content fixture keeps identical meaning across all four embedding slots');
const rtl=read('../fixtures/portability/rtl-text.json');
const arabic=selectLocalizedText(rtl.value,['ar-EG']);
assert.deepEqual(arabic,{text:'مرحبا',locale:'ar',direction:'rtl'});
const absentTranslation=selectLocalizedText(rtl.value,['fr-CA']);
assert.deepEqual(absentTranslation,{text:'Hello',locale:'en',direction:'ltr'});
const dirty=read('../fixtures/code.json');dirty.source='first\r\nsecond\rlast';dirty.language='en-us';
const normalized=normalizeContent(dirty);assert.equal(normalized.source,'first\nsecond\nlast');assert.equal(normalized.language,'en-US');assert.equal(dirty.language,'en-us');
const locale=read('../fixtures/text.json');locale.value.defaultLocale='EN-us';locale.value.translations={'en-us':{text:'hello\r\nworld'}};
const canonical=normalizeContent(locale);assert.equal(canonical.value.defaultLocale,'en-US');assert(validateSharedContent(canonical.value).valid);
locale.value.translations['en-US']={text:'collision'};assert.throws(()=>normalizeContent(locale),e=>e.code==='content.localeCollision');
const nested=depth=>{let node=read('../fixtures/code.json');for(let i=0;i<depth;i++)node={kind:'group',schemaVersion:'1.0.0',children:[node]};return node;};
assert(validateContent(nested(contentLimits.maxContentDepth)).valid);assert.equal(validateContent(nested(contentLimits.maxContentDepth+1)).diagnostics[0].code,'content.composition');
assert.throws(()=>normalizeContent(nested(contentLimits.maxContentDepth+1)),e=>e.code==='content.composition');
const nestedRoundTrip=normalizeContent(nested(contentLimits.maxContentDepth));
assert.equal(JSON.stringify(normalizeContent(JSON.parse(JSON.stringify(nestedRoundTrip)))),JSON.stringify(nestedRoundTrip));
const leaf=read('../fixtures/code.json'), group=children=>({kind:'group',schemaVersion:'1.0.0',children});
const many=group(Array.from({length:10},()=>group(Array(200).fill(leaf))));
assert.equal(validateContent(many).diagnostics[0].code,'content.composition');
const tooWide=group(Array(201).fill(leaf));assert(!validateContent(tooWide).valid);
const long=read('../fixtures/code.json');long.source='x'.repeat(100000);assert(validateContent(long).valid);long.source+='x';assert(!validateContent(long).valid);
const oversized=group(Array(30).fill({...leaf,source:'x'.repeat(100000)}));assert.equal(validateContent(oversized).diagnostics[0].code,'generation.maxBytes');
const cycle=group([]);cycle.children.push(cycle);assert.equal(validateContent(cycle).diagnostics[0].code,'input.cycle');
const getter={};Object.defineProperty(getter,'kind',{enumerable:true,get(){throw Error('Getter executed');}});assert.equal(validateContent(getter).diagnostics[0].code,'input.nonJson');
const dangerous=read('../fixtures/image.json');dangerous.asset.uri='javascript:alert(1)';assert.equal(validateContent(dangerous).diagnostics[0].code,'content.assetUri');
assert.equal(validateContent(read('../fixtures/invalid/temporary-object-url.json')).diagnostics[0].code,'content.assetUri');
const unknownRef=read('../fixtures/reference.json');assert(validateContent(unknownRef).valid,'Opaque references are validated without fetching assets');
const ts=(await import('typescript')).default;
const program=ts.createProgram([new URL('./type-consumer.mts',import.meta.url).pathname],{strict:true,noEmit:true,module:ts.ModuleKind.NodeNext,moduleResolution:ts.ModuleResolutionKind.NodeNext,lib:['lib.es2022.d.ts']});
const diagnostics=ts.getPreEmitDiagnostics(program);assert.equal(diagnostics.length,0,diagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\n')).join('\n'));
const checker=program.getTypeChecker(),source=program.getSourceFiles().find(s=>s.fileName.endsWith('/types/content-node.d.ts'));
const declarations=new Map(source.statements.filter(s=>s.name).map(s=>[s.name.text,s]));
function compare(type,shape,root=schema){
 if(shape.$ref){const ref=shape.$ref;root=ref.startsWith('#')?root:shared;shape=root.$defs[ref.split('/').at(-1)];}
 if(shape.properties){const props=checker.getPropertiesOfType(type);assert.deepEqual(props.map(p=>p.name).sort(),Object.keys(shape.properties).sort());for(const prop of props){assert.equal(!(prop.flags&ts.SymbolFlags.Optional),(shape.required??[]).includes(prop.name));compare(checker.getNonNullableType(checker.getTypeOfSymbolAtLocation(prop,source)),shape.properties[prop.name],root);}}
 else if(shape.const!==undefined||shape.enum){const values=type.isUnion()?type.types.map(t=>t.value):[type.value];assert.deepEqual(values.sort(),(shape.enum??[shape.const]).slice().sort());}
 else if(shape.type==='array'){if(shape.items.$ref==='#/$defs/content')assert.equal(checker.typeToString(checker.getIndexTypeOfType(type,ts.IndexKind.Number)),'ContentNode');else compare(checker.getIndexTypeOfType(type,ts.IndexKind.Number),shape.items,root);}
 else if(shape.type==='object'){compare(checker.getIndexTypeOfType(type,ts.IndexKind.String),shape.additionalProperties,root);}
 else assert.equal(checker.typeToString(type),shape.type);
}
for(const [type,def]of [['TextContent','text'],['MarkdownContent','markdown'],['MathContent','math'],['ImageContent','image'],['CodeContent','code'],['AudioContent','audio'],['VideoContent','video'],['GroupContent','group'],['CaptionCue','cue']])compare(checker.getTypeAtLocation(declarations.get(type)),schema.$defs[def]);
console.log('Content: '+manifest.length+' JS fixtures, canonical serialization, four domain embedding slots, localization/RTL, migration rejection, resource boundaries and types passed.');
