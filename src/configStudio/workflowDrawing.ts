import { coerceWorkflowValues } from './workflowValues';
import { multipartGeometryFromSinglePath, serializeMultipartGeometry, validateMultipartGeometry, type MultipartCoord, type MultipartGeometry } from '../core/geometry/multipartGeometry';
import type { WorkflowDefinition, WorkflowStep } from './types';
import { workflowConditionMatches } from './workflowExpression';

export type WorkflowDrawingCapture = { coordinates:MultipartCoord[]; geometry?:MultipartGeometry; point?:{x:number;y?:number;z:number} };
export const drawingKey=(step:WorkflowStep)=>step.geometryRole==='auxiliary'?step.id:step.outputId!;
export function enabledDrawing(step:WorkflowStep,workflow:WorkflowDefinition,slots:Record<string,unknown>):boolean {
  if(step.geometryRole==='auxiliary'&&step.drawing?.bindings?.length&&!step.drawing.bindings.some(binding=>activeOutputIds(workflow,slots).includes(binding.outputId)))return false;
  return workflowConditionMatches(step.when,slots) && (step.geometryRole==='auxiliary'||workflowConditionMatches(workflow.outputs.find(output=>output.id===step.outputId)?.when,slots));
}
export function activeOutputIds(workflow:WorkflowDefinition,slots:Record<string,unknown>):string[] {
  return workflow.outputs.filter(output=>workflowConditionMatches(output.when,slots)&&workflow.steps.filter(step=>step.kind==='geometry'&&step.geometryRole!=='auxiliary'&&step.outputId===output.id).every(step=>enabledDrawing(step,workflow,slots))).map(output=>output.id);
}
export function serializeDrawingCapture(step:WorkflowStep,capture:WorkflowDrawingCapture,slots:Record<string,unknown>):{value:unknown;height?:number;geometry:MultipartGeometry} {
  for(const point of capture.coordinates)if(!Number.isFinite(point.x)||!Number.isFinite(point.z)||point.y!=null&&!Number.isFinite(point.y))throw new Error('坐标必须为有限数值。');
  const type=step.geometry?.[0];if(!type)throw new Error('绘制必须指定几何类型。');
  const geometry=capture.geometry??multipartGeometryFromSinglePath(type,capture.coordinates);
  const error=validateMultipartGeometry(geometry);if(error)throw new Error(error);
  if(geometry.type!==type)throw new Error('采集几何与绘制类型不一致。');
  if(step.drawing?.returnFormat==='pointObject'&&geometry.parts.length!==1)throw new Error('单点坐标对象格式必须且只能采集一个点。');
  if(step.drawing?.multiple===false&&geometry.parts.length>1)throw new Error('此绘制只允许一个部件。');
  const entered=step.drawing?.heightSlot?slots[step.drawing.heightSlot]:undefined;
  const rawHeight=capture.point?.y;
  const height=typeof rawHeight==='number'&&Number.isFinite(rawHeight)?rawHeight:entered!==''&&entered!=null&&Number.isFinite(Number(entered))?Number(entered):undefined;
  const selected=structuredClone(geometry);
  if(type==='Point'&&step.geometryRole==='auxiliary'&&height!==undefined)for(const point of (selected as Extract<MultipartGeometry,{type:'Point'}>).parts)point.y=height;
  if(step.drawing?.returnFormat==='pointObject') {
    if(selected.type!=='Point'||selected.parts.length!==1)throw new Error('单点坐标对象格式必须且只能采集一个点。');
    return {value:{...selected.parts[0]},height,geometry:selected};
  }
  return {value:serializeMultipartGeometry(selected),height,geometry:selected};
}
/** Every final batch reads the same draft snapshot, never React's old state. */
export function captureDrawingSnapshot(workflow:WorkflowDefinition,rawSlots:Record<string,unknown>,previous:Record<string,WorkflowDrawingCapture>,capture?:((id:string,type:string)=>WorkflowDrawingCapture | MultipartCoord[])) {
  const slots=coerceWorkflowValues(workflow,rawSlots);const captures={...previous};
  for(const step of workflow.steps.filter(step=>step.kind==='geometry')) {
    const key=drawingKey(step);if(!enabledDrawing(step,workflow,slots)){for(const slot of [step.drawing?.captureSlot,step.drawing?.pointSlot])if(slot)for(const token of [slot,`${slot}_RAW_POINT`,`${slot}_X`,`${slot}_Y`,`${slot}_Z`,`${slot}_HEIGHT`])delete slots[token];for(const control of step.controls??[])if(control.slot)delete slots[control.slot];continue;}
    if(capture){const next=capture(key,step.geometry![0]);captures[key]=Array.isArray(next)?{coordinates:next}:next;}
    const result=serializeDrawingCapture(step,captures[key]??{coordinates:[]},slots);
    if(step.drawing?.captureSlot){slots[step.drawing.captureSlot]=result.value;slots[`${step.drawing.captureSlot}_RAW_POINT`]=captures[key]?.point??captures[key]?.coordinates[0];}
    if(step.drawing?.pointSlot)slots[step.drawing.pointSlot]=captures[key]?.point??captures[key]?.coordinates[0];
    if(step.drawing?.captureSlot)slots[`${step.drawing.captureSlot}_HEIGHT`]=result.height;
    const rawPoint=captures[key]?.point??captures[key]?.coordinates[0];for(const slot of [step.drawing?.captureSlot,step.drawing?.pointSlot])if(slot)for(const axis of ['x','y','z'] as const)slots[`${slot}_${axis.toUpperCase()}`]=typeof rawPoint?.[axis]==='number'?rawPoint[axis]:undefined;
  }
  return {slots,captures};
}
/** Preserve already collected components when editing the current component. */
export function mergeDrawingCapture(previous:WorkflowDrawingCapture|undefined,next:WorkflowDrawingCapture,type:import('./types').GeometryKind,action:'replace'|'part'|'ring'='replace'):WorkflowDrawingCapture {
  const current=next.geometry??multipartGeometryFromSinglePath(type,next.coordinates),old=previous?.geometry;
  if(!old||old.type!==current.type||current.type==='Point')return {...next,geometry:current};
  if(current.type==='LineString'&&old.type==='LineString')return {...next,geometry:{type:'LineString',parts:[...old.parts.slice(0,action==='part'?undefined:-1),...current.parts]}};
  if(current.type==='Polygon'&&old.type==='Polygon'){
    if(action==='part')return {...next,geometry:{type:'Polygon',parts:[...old.parts,...current.parts]}};
    const last=old.parts[old.parts.length-1]??[];
    const rings=action==='ring'?[...last,...current.parts[0]]:last.length>1?[...last.slice(0,-1),...current.parts[0]]:current.parts[0];
    return {...next,geometry:{type:'Polygon',parts:[...old.parts.slice(0,-1),rings]}};
  }
  return {...next,geometry:current};
}
