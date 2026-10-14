import type { WorkflowDefinition, WorkflowStep } from './types';
/** Lift legacy auxiliary points into ordinary, condition-controlled tasks. */
export function migrateWorkflowDrawings(value:WorkflowDefinition):WorkflowDefinition {
  const workflow=structuredClone(value);if(workflow.mode!=='composed')return workflow;
  const steps:WorkflowStep[]=[];
  for(const original of workflow.steps){
    if(original.kind!=='geometry'){steps.push(original);continue;}
    const {auxiliaryPoints:points,...drawing}=original.drawing??{};
    const main={...original,geometryRole:original.geometryRole??'output' as const,drawing:{...drawing}};
    if(main.geometryRole==='output'&&main.drawing.pointSlot){main.drawing.captureSlot??=`${main.drawing.pointSlot}_GEOMETRY`;main.drawing.returnFormat??=main.geometry?.[0]==='Point'?'coordP':main.geometry?.[0]==='LineString'?'coordL':'coordG';}
    if(workflow.outputs.find(output=>output.id===main.outputId)?.classification.class==='TPP' && main.label.zh==='绘制')main.label={...main.label,zh:'起点坐标'};
    steps.push(main);
    for(const point of points??[]){
      const moved=(main.controls??[]).filter(control=>point.when && JSON.stringify(control.when)===JSON.stringify(point.when));
      main.controls=main.controls?.filter(control=>!moved.includes(control));
      const extra:WorkflowStep={id:`extra-${point.id}`,kind:'geometry',geometryRole:'auxiliary',label:point.label,when:point.when,geometry:['Point'],controls:moved.map(control=>{const{when:_when,...next}=control;return next;}),drawing:{enabledFromThisPage:true,allowBack:true,keepDrawingWhenBack:true,captureSlot:point.slot,returnFormat:'pointObject',multiple:false,heightSlot:moved.find(control=>control.kind==='number')?.slot,bindings:[]}};
      steps.push(extra);
      const output=workflow.outputs.find(output=>output.id===original.outputId);
      if(output?.classification.class==='TPP'){
        const known=output.assignments.filter(assignment=>['TGTcoordinate.x','TGTcoordinate.y','TGTcoordinate.z','TGTelevation'].includes(assignment.target));
        const recognized=known.every(assignment=>['-64',`${point.slot}_X`,`${point.slot}_Y`,`${point.slot}_Z`,extra.drawing?.heightSlot].includes(assignment.expression));
        if(recognized){output.assignments=output.assignments.filter(assignment=>!known.includes(assignment));extra.drawing!.bindings=[{outputId:output.id,target:'TGTcoordinate',value:'geometry'},{outputId:output.id,target:'TGTelevation',value:'height'}];}
      }
    }
    const output=workflow.outputs.find(output=>output.id===main.outputId);
    if(output&&['TPP','WRP'].includes(output.classification.class)&&main.drawing.pointSlot){
      const elevation=(main.controls??[]).find(control=>control.slot==='SOURCE_ELEVATION');
      const rows=output.assignments.filter(assignment=>assignment.target==='elevation');
      if(elevation&&rows.length&&rows.every(assignment=>['SOURCE_ELEVATION','SOURCE_POINT_Y'].includes(assignment.expression))){
        output.assignments=output.assignments.filter(assignment=>!rows.includes(assignment));main.drawing.heightSlot=elevation.slot;main.drawing.bindings=[...(main.drawing.bindings??[]),{outputId:output.id,target:'elevation',value:'height'}];
      }
    }
  }
  workflow.steps=steps;
  for(const step of steps.filter(step=>step.geometryRole==='output'&&step.drawing?.pointSlot)){
    const slot=step.drawing!.pointSlot!;
    const used=workflow.outputs.some(output=>output.assignments.some(row=>new RegExp(`\\b${slot}(?:_[XYZ])?\\b`).test(row.expression)||JSON.stringify(row.when??{}).includes(`"${slot}`)))||steps.some(item=>JSON.stringify([item.when,...(item.controls??[]).flatMap(control=>[control.when,...(control.requiredWhen??[])])]).includes(`"${slot}`))||workflow.outputs.some(output=>JSON.stringify(output.when??{}).includes(`"${slot}`));
    if(!used)delete step.drawing!.pointSlot;
  }
  return workflow;
}
