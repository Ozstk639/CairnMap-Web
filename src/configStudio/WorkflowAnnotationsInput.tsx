import { useState } from 'react';
import type { ClassificationPath, ConfigPackageV3, WorkflowDefinition, WorkflowControl } from './types';
import { resolveEffectiveFields } from './runtime';
import { blankAnnotation, type AnnotationRow, type OutputAnnotations, type WorkflowAnnotations } from './workflowAnnotations';
export function WorkflowAnnotationsInput({config,workflow,control,value,onChange,classifications}:{config:ConfigPackageV3;workflow:WorkflowDefinition;control:WorkflowControl;value:unknown;onChange:(value:WorkflowAnnotations)=>void;classifications:Record<string,ClassificationPath|undefined>}) {
  const [outputId,setOutputId]=useState(workflow.outputs[0]?.id??'');
  const output=workflow.outputs.find(output=>output.id===outputId)??workflow.outputs[0];
  const stored=(value??{}) as WorkflowAnnotations,current=stored[output.id]??{};
  const update=(patch:Partial<OutputAnnotations>)=>onChange({...stored,[output.id]:{...current,...patch}});
  const fields=resolveEffectiveFields(config,classifications[output.id]??output.classification).filter(field=>field.key.startsWith('tags.'));
  const automatic=output.assignments.filter(row=>/^(tags|extensions)\./.test(row.target));
  const showValue=(row:AnnotationRow,change:(patch:Partial<AnnotationRow>)=>void)=>row.type==='null'?<span>空值 null</span>:row.type==='bool'?<select aria-label="标签扩展值" value={String(row.value)} onChange={event=>change({value:event.target.value==='true'})}><option value="">选择是/否</option><option value="true">是</option><option value="false">否</option></select>:row.type==='json'?<textarea aria-label="标签扩展值" value={typeof row.value==='string'?row.value:JSON.stringify(row.value)} onChange={event=>change({value:event.target.value})}/>:<input aria-label="标签扩展值" type={row.type==='number'?'number':'text'} value={String(row.value??'')} onChange={event=>change({value:event.target.value})}/>;
  return <section className="space-y-3 rounded border bg-slate-50 p-3 [&_input]:min-w-0 [&_input]:rounded [&_input]:border [&_input]:px-2 [&_input]:py-1 [&_select]:min-w-0 [&_select]:rounded [&_select]:border [&_select]:px-2 [&_select]:py-1 [&_textarea]:min-w-0 [&_textarea]:rounded [&_textarea]:border" aria-label="结构化标签与扩展">
    {workflow.outputs.length>1?<label>所属输出<select aria-label="标签扩展所属输出" value={output.id} onChange={event=>setOutputId(event.target.value)}>{workflow.outputs.map((output,index)=><option key={output.id} value={output.id}>输出 {index+1} · {output.classification.class}</option>)}</select></label>:null}
    {automatic.length?<details><summary className="text-xs">已有自动填写路径与来源</summary><ul className="text-xs">{automatic.map(row=><li key={row.id}>{row.target} ← {row.expression}</li>)}</ul><p className="text-xs">这些值来自上方输入。相同路径填写不同值会阻止保存，请直接修改已有输入。</p></details>:null}
    {(['tags','extensions'] as const).filter(namespace=>control.tagsExtensions?.[namespace==='tags'?'tagsEnabled':'extensionsEnabled']!==false).map(namespace=>{
      const extension=namespace==='extensions',rows=current[namespace]?.length?current[namespace]!:[blankAnnotation(extension)];
      const setRows=(next:AnnotationRow[])=>update({[namespace]:next.length?next:[blankAnnotation(extension)]});
      return <fieldset key={namespace} className="space-y-2"><legend className="font-medium">{extension?'扩展':'标签'}</legend>{rows.map((row,index)=>{
        const change=(patch:Partial<AnnotationRow>)=>setRows(rows.map((value,i)=>i===index?{...value,...patch}:value));
        const known=fields.find(field=>field.key===`tags.${row.key}`);
        return <div key={index} className="grid min-w-0 gap-2 rounded border bg-white p-2 sm:grid-cols-2">
          {extension?<input aria-label="扩展组名" placeholder="组 / 命名空间" value={row.group??''} onChange={event=>change({group:event.target.value})}/>:<select aria-label="标签已注册字段" value={known?row.key:'__other__'} onChange={event=>{const field=fields.find(field=>field.key===`tags.${event.target.value}`);change({key:field?event.target.value:'',type:field?.type==='number'||field?.optionValueType==='number'?'number':field?.type==='boolean'||field?.optionValueType==='boolean'?'bool':'text',value:field?.type==='boolean'||field?.optionValueType==='boolean'?false:''});}}><option value="__other__">其他字段（自行填写）</option>{fields.map(field=><option key={field.key} value={field.key.slice(5)}>{field.labels.zh}（{field.key.slice(5)}）</option>)}</select>}
          <input aria-label={extension?'扩展字段名':'标签字段名'} placeholder="字段名" value={row.key} onChange={event=>change({key:event.target.value})}/>
          <select aria-label="标签扩展值类型" value={row.type} onChange={event=>change({type:event.target.value as AnnotationRow['type'],value:event.target.value==='bool'?false:event.target.value==='null'?null:''})}><option value="text">文本</option><option value="number">数字</option><option value="bool">布尔</option><option value="null">null</option><option value="json">已有复杂对象 / 数组</option></select>
          {known?.options?.length&&(known.type==='enum'||known.input==='select')?<select aria-label="标签扩展值" value={String(row.value??'')} onChange={event=>change({value:event.target.value})}><option value="">请选择</option>{known.options.map(option=><option key={option.value} value={option.value}>{option.label.zh}</option>)}</select>:showValue(row,change)}
          <button type="button" className="text-left text-xs text-rose-700" onClick={()=>setRows(rows.filter((_,i)=>i!==index))}>删除{extension?'扩展':'标签'}行</button>
        </div>;
      })}<button type="button" className="rounded border bg-white px-2 py-1 text-xs" onClick={()=>setRows([...rows,blankAnnotation(extension)])}>添加{extension?'扩展':'标签'}行</button></fieldset>;
    })}
    <details><summary className="text-xs">高级对象查看与编辑（保留复杂数据）</summary><div className="grid gap-2 sm:grid-cols-2">{(['tags','extensions'] as const).map(namespace=><label key={namespace} className="text-xs">{namespace}<textarea aria-label={`${namespace} 高级对象`} className="w-full rounded border p-2 font-mono" rows={3} value={current.advancedText?.[namespace]??JSON.stringify(current.advanced?.[namespace]??{},null,2)} onChange={event=>update({advancedText:{...current.advancedText,[namespace]:event.target.value}})}/></label>)}</div></details>
  </section>;
}
