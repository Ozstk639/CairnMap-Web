import type { ClassificationPath, ConfigPackageV3, GeometryKind } from './types';
import { hasDescendants, pathDepth, pathMatchesScope, resolveGeometryProfile } from './runtime';
const levels=['class','kind','skind','skind2'] as const;
const names=['Class','Kind','SKind','SKind2'];
/** Only direct children beyond the fixed scope are displayed; saved values stay full paths. */
export function WorkflowCategoryInput({config,scope,value,onChange,geometry}:{config:ConfigPackageV3;scope:ClassificationPath;value:string;onChange:(value:string)=>void;geometry?:GeometryKind}) {
  let selected:ClassificationPath=scope;try{selected=JSON.parse(value)||scope;}catch{/* Empty starts at scope. */}
  const depth=pathDepth(scope);
  return <div className="grid gap-2">{levels.slice(depth).map((level,offset)=>{
    const index=depth+offset;
    if(index>depth&&!selected[levels[index-1]])return null;
    const options=config.nodes.filter(node=>pathDepth(node.path)===index+1&&levels.slice(0,index).every(key=>node.path[key]===selected[key])&&pathMatchesScope(node.path,scope)&&(!geometry||hasDescendants(config,node.path)||resolveGeometryProfile(config,node.path,geometry)?.enabled));
    if(!options.length)return null;
    return <label key={level} className="grid gap-1 text-xs"><span>{names[index]}</span><select aria-label={`工作流分类 ${names[index]}`} className="w-full rounded border px-2 py-1 text-sm" value={selected[level]??''} onChange={event=>{const next:ClassificationPath={class:scope.class};for(const key of levels.slice(0,index))if(selected[key])next[key]=selected[key];if(event.target.value)next[level]=event.target.value;onChange(JSON.stringify(next));}}><option value="">请选择分类</option>{options.map(node=><option key={node.nodeId} value={node.path[level]}>{node.path[level]}（{node.classificationLabels?.[level]?.zh??node.path[level]}）</option>)}</select></label>;
  })}</div>;
}
