import type { RenderConditionFormula, RenderFieldCondition, RenderFieldGroup } from './types';
type Ast={kind:'term';id:string}|{kind:'not';child:Ast}|{kind:'and'|'or';left:Ast;right:Ast};
const cache=new WeakMap<RenderConditionFormula,Ast>();
const termCache=new WeakMap<RenderConditionFormula,Map<string,RenderFieldCondition>>();
function parse(text:string,known:Set<string>):Ast {
  if(text.length>16384)throw Error('条件公式超过 16 KiB。');
  const tokens:string[]=[];const re=/\s*([A-Z][A-Z0-9_]*|[()])/igy;let offset=0;
  while(offset<text.length){if(!text.slice(offset).trim())break;re.lastIndex=offset;const token=re.exec(text);if(!token)throw Error(`条件公式在第 ${offset+1} 个字符无效。`);tokens.push(token[1].toUpperCase());offset=re.lastIndex;}
  let index=0;
  const unary=(depth:number):Ast=>{if(depth>32)throw Error('条件公式超过 32 层。');const token=tokens[index++];if(token==='NOT')return {kind:'not',child:unary(depth+1)};if(token==='('){const result=or(depth+1);if(tokens[index++]!==')')throw Error('条件公式括号不配对。');return result;}if(!token||!known.has(token))throw Error(`未知条件/组 ${token??'（空）'}。`);return {kind:'term',id:token};};
  const balanced=(items:Ast[],kind:'and'|'or'):Ast=>{if(items.length===1)return items[0];const mid=Math.floor(items.length/2);return {kind,left:balanced(items.slice(0,mid),kind),right:balanced(items.slice(mid),kind)};};
  const and=(depth:number):Ast=>{const items=[unary(depth)];while(tokens[index]==='AND'){index++;items.push(unary(depth));}return balanced(items,'and');};
  const or=(depth:number):Ast=>{const items=[and(depth)];while(tokens[index]==='OR'){index++;items.push(and(depth));}return balanced(items,'or');};
  const result=or(0);if(index!==tokens.length)throw Error(`多余的条件符号 ${tokens[index]}。`);return result;
}
export function compileRenderFormula(formula:RenderConditionFormula):Ast {
  if(Object.isFrozen(formula)&&cache.has(formula))return cache.get(formula)!;
  if(!formula.terms.length||formula.terms.length>256)throw Error('条件公式需要 1–256 个原子条件。');
  if((formula.groups?.length??0)>256||formula.expression.length+(formula.groups??[]).reduce((sum,g)=>sum+g.expression.length,0)>16384)throw Error('条件及命名组公式总长度超过 16 KiB，或命名组超过 256 项。');
  if(formula.terms.some(t=>!/^C\d+$/.test(t.id))||formula.groups?.some(g=>!/^G\d+$/.test(g.id)))throw Error('条件使用 C 编号，命名组使用 G 编号。');
  const ids=[...formula.terms.map(t=>t.id),...(formula.groups??[]).map(g=>g.id)];if(ids.some(id=>!/^C\d+$|^G\d+$/.test(id))||new Set(ids).size!==ids.length)throw Error('条件/组编号无效或重复。');
  const known=new Set(ids),termIds=new Set(formula.terms.map(t=>t.id)),groups=new Map(formula.groups?.map(g=>[g.id,g.expression])),compiledGroups=new Map<string,Ast>();
  const resolve=(ast:Ast,stack:Set<string>,depth:number):Ast=>{
    if(depth>32)throw Error('组合公式超过 32 层。');
    if(ast.kind==='term'){if(termIds.has(ast.id))return ast;if(stack.has(ast.id))throw Error(`条件组循环引用 ${ast.id}。`);if(compiledGroups.has(ast.id))return compiledGroups.get(ast.id)!;const next=new Set(stack);next.add(ast.id);const result=resolve(parse(groups.get(ast.id)!,known),next,depth+1);compiledGroups.set(ast.id,result);return result;}
    return ast.kind==='not'?{...ast,child:resolve(ast.child,stack,depth+1)}:{...ast,left:resolve(ast.left,stack,depth+1),right:resolve(ast.right,stack,depth+1)};
  };
  for(const [id,text] of groups)if(!compiledGroups.has(id))compiledGroups.set(id,resolve(parse(text,known),new Set([id]),0));
  const ast=resolve(parse(formula.expression,known),new Set(),0);if(Object.isFrozen(formula))cache.set(formula,ast);return ast;
}
function evaluate(ast:Ast,read:(id:string)=>boolean,memo=new Map<Ast,boolean>()):boolean {if(memo.has(ast))return memo.get(ast)!;const result=ast.kind==='term'?read(ast.id):ast.kind==='not'?!evaluate(ast.child,read,memo):ast.kind==='and'?evaluate(ast.left,read,memo)&&evaluate(ast.right,read,memo):evaluate(ast.left,read,memo)||evaluate(ast.right,read,memo);memo.set(ast,result);return result;}
export function matchesAtomicCondition(condition:RenderFieldCondition,read:(key:string)=>unknown):boolean {
  const raw=read(condition.field);
  if(condition.kind!=='fieldCompare'){const value=String(raw??'').trim();return condition.kind==='fieldEquals'?value===condition.value:condition.kind==='fieldIn'?condition.values.includes(value):condition.present?value.length>0:value.length===0;}
  const empty=raw==null||typeof raw==='string'&&!raw.trim()||Array.isArray(raw)&&!raw.length;
  if(condition.operator==='present'||condition.operator==='empty')return condition.operator==='empty'?empty:!empty;
  if(condition.operator==='in'||condition.operator==='notIn'){const hit=condition.values?.some(value=>value===raw)??false;return condition.operator==='in'?hit:!hit;}
  if(condition.operator==='eq'||condition.operator==='ne')return condition.operator==='eq'?raw===condition.value:raw!==condition.value;
  if(typeof raw!=='number'||!Number.isFinite(raw)||typeof condition.value!=='number'||!Number.isFinite(condition.value))return false;
  return condition.operator==='gt'?raw>condition.value:condition.operator==='ge'?raw>=condition.value:condition.operator==='lt'?raw<condition.value:raw<=condition.value;
}
export function matchesRenderFormula(formula:RenderConditionFormula,read:(key:string)=>unknown):boolean {
  try {const ast=compileRenderFormula(formula);let terms=termCache.get(formula);if(!terms){terms=new Map(formula.terms.map(t=>[t.id,t.condition]));if(Object.isFrozen(formula))termCache.set(formula,terms);}const values=new Map<string,boolean>();return evaluate(ast,id=>{if(!values.has(id))values.set(id,matchesAtomicCondition(terms!.get(id)!,read));return values.get(id)!;});}catch{return false;}
}
export function formulaContradiction(formula:RenderConditionFormula):boolean {
  const ast=compileRenderFormula(formula);
  const facts:Array<{condition:RenderFieldCondition;positive:boolean}>=[],terms=new Map(formula.terms.map(t=>[t.id,t.condition]));
  const conjunction=(node:Ast,positive=true):boolean=>node.kind==='term'?(facts.push({condition:terms.get(node.id)!,positive}),true):node.kind==='not'?conjunction(node.child,!positive):node.kind==='and'&&positive?conjunction(node.left)&&conjunction(node.right):node.kind==='or'&&!positive?conjunction(node.left,false)&&conjunction(node.right,false):false;
  if(conjunction(ast))for(const field of new Set(facts.map(f=>f.condition.field))) {
    const constraints=facts.filter(f=>f.condition.field===field),literals=constraints.flatMap(({condition:c})=>c.kind==='fieldEquals'?[c.value]:c.kind==='fieldIn'?c.values:c.kind==='fieldCompare'?c.values??(c.value!==undefined?[c.value]:[]):[]);
    if(literals.length>256)continue;
    const numbers=[...new Set(literals.flatMap(v=>typeof v==='number'?[v]:typeof v==='string'&&v.trim()&&Number.isFinite(Number(v))?[Number(v)]:[]))].sort((a,b)=>a-b);
    const candidates:unknown[]=[undefined,null,'',0,false,true,[],[null],[''],{},...literals.map(value=>[value]),...literals,...numbers,...numbers.flatMap((v,i)=>[v-Math.max(1,Math.abs(v)*.1),v+Math.max(1,Math.abs(v)*.1),...(i?[numbers[i-1]/2+v/2]:[])])];
    let other='__other__';while(literals.includes(other))other+='_';candidates.push(other);
    if(!candidates.some(value=>constraints.every(({condition,positive})=>matchesAtomicCondition(condition,()=>value)===positive)))return true;
  }
  if(formula.terms.length>10)return false;
  for(let mask=0;mask<2**formula.terms.length;mask++)if(evaluate(ast,id=>Boolean(mask&(1<<formula.terms.findIndex(t=>t.id===id)))))return false;return true;
}
export function automaticConditionExpression(terms:RenderConditionFormula['terms']):string {return terms.map((term,index)=>`${index?(term.relation==='NOT'?'AND NOT ':term.relation+' '):term.relation==='NOT'?'NOT ':''}${term.id}`).join(' ');}
export function renderGroupToFormula(group:RenderFieldGroup):RenderConditionFormula {
  if(group.formula)return structuredClone(group.formula);
  const terms:RenderConditionFormula['terms']=[];
  const visit=(node:RenderFieldGroup|RenderFieldCondition):string=>{if(!('op' in node)){const id='C'+(terms.length+1);terms.push({id,relation:'AND',condition:structuredClone(node)});return id;}return node.op==='not'?`NOT (${node.items.map(visit).join(' AND ')})`:`(${node.items.map(visit).join(node.op==='all'?' AND ':' OR ')})`;};
  return {terms,expression:visit(group),manual:true};
}
