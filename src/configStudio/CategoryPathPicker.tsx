import type { ClassificationPath, ConfigPackageV3 } from './types';
import { classificationPathKey } from './runtime';
const levels = ['class','kind','skind','skind2'] as const;
const titles = ['Class','Kind','SKind','SKind2'];
export function CategoryPathPicker({config,value,onChange,disabled=false,label='分类',lockedClass,preferredPath}:{config:ConfigPackageV3;value:ClassificationPath;onChange:(value:ClassificationPath)=>void;disabled?:boolean;label?:string;lockedClass?:string;preferredPath?:ClassificationPath}) {
  return <fieldset disabled={disabled} className="grid min-w-0 gap-2 sm:grid-cols-2"><legend className="text-xs">{label}</legend>{levels.map((key,index)=>{
    const enabled=index===0 || Boolean(value[levels[index-1]]);
    const options=config.nodes.filter(node=>Object.keys(node.path).length===index+1 && levels.slice(0,index).every(parent=>node.path[parent]===value[parent])&&(!lockedClass||node.path.class===lockedClass)).sort((a,b)=>Number(b.path[key]===preferredPath?.[key])-Number(a.path[key]===preferredPath?.[key]));
    return <label key={key} className="min-w-0 text-xs">{titles[index]}<select aria-label={`${label} ${titles[index]}`} disabled={!enabled||Boolean(lockedClass&&index===0)} className="mt-1 w-full min-w-0 rounded border bg-white px-2 py-1" value={value[key]??''} onChange={event=>{
      const next:ClassificationPath={class:''};for(const parent of levels.slice(0,index))if(value[parent])next[parent]=value[parent];
      if(event.target.value)next[key]=event.target.value;onChange(next);
    }}><option value="">{enabled && !options.length?'无下级分类':`请选择 ${titles[index]}`}</option>{options.map(node=><option key={classificationPathKey(node.path)} value={node.path[key]}>{node.path[key]}（{node.classificationLabels?.[key]?.zh||node.path[key]}）</option>)}</select></label>;
  })}</fieldset>;
}
