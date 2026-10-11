import type { FieldDefinition, RenderColorBinding } from './types';
export function scalarType(field:FieldDefinition):'string'|'number'|'boolean' {return field.type==='enum'?field.optionValueType??'string':field.type==='number'?'number':field.type==='boolean'?'boolean':'string';}
export function parseScalar(field:FieldDefinition,text:string):string|number|boolean {const type=scalarType(field);return type==='number'?(text.trim()?Number(text):NaN):type==='boolean'?text==='true':text;}
export function scalarValueErrors(field:FieldDefinition,value:unknown):string[] {
  if(field.cardinality!=='single'||field.type==='json')return [`${field.key} 需要明确的单值标量，不能比较对象/数组。`];
  if(typeof value!==scalarType(field)||typeof value==='number'&&!Number.isFinite(value))return [`${field.key} 的比较值类型不匹配。`];
  if(field.type==='enum'&&!field.options?.some(option=>option.value===String(value)))return [`${field.key} 的值不在已定义字典中。`];return [];
}
export const validMappedColor=(color:unknown):color is string=>typeof color==='string'&&/^#[a-f\d]{6}$/i.test(color);
type Mapping=Extract<RenderColorBinding,{mode:'valueMap'}>;
const indexes=new WeakMap<Mapping,Map<string|number|boolean,string>>();
export function resolveMappedColor(binding:Mapping,value:unknown):string {
  let index=indexes.get(binding);if(!index){index=new Map(binding.entries.map(entry=>[entry.value,entry.color]));if(Object.isFrozen(binding))indexes.set(binding,index);}
  return typeof value==='string'||typeof value==='number'||typeof value==='boolean'?index.get(value)??binding.fallbackColor:binding.fallbackColor;
}
