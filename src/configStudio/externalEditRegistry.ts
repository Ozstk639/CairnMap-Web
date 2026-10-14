import type {WorkflowDefinition} from './types';
export const EXTERNAL_CAPTURE_OPTIONS=[
 {key:'railwayWorkflow',label:'铁路整体采集',reason:'railway-integrated' as const,classes:['RLE']},
 {key:'stationWorkflow',label:'车站整体采集',reason:'station-integrated' as const,classes:['STA','PLF','PFB','STB','SBP','STF']},
 {key:'tradePointWorkflow',label:'TRP 整体采集',reason:'trp-integrated' as const,classes:['TRP']},
];
export const EXTERNAL_EDIT_OPTIONS=[{key:'tradePointEditor',label:'TRP 工作流式编辑完成品',reason:'trp-integrated' as const,version:1,classes:['TRP']}];
export function validateExternalEditBinding(workflow:WorkflowDefinition):string[] {
 const definition=EXTERNAL_EDIT_OPTIONS.find(d=>d.key===workflow.external?.componentKey),scope=workflow.editor?.scope??workflow.target;
 if(!definition||workflow.external?.purpose!=='edit'||workflow.external.version!==definition.version||workflow.external.reason!==definition.reason)return ['外部编辑组件、用途、版本或登记理由无效。'];
 if(!workflow.editor?.enabled||!workflow.editor.dedicated||workflow.quickMapping!==false||scope?.class!=='TRP'||workflow.steps.length||workflow.outputs.length||!workflow.external.coveredClassifications?.length||workflow.external.coveredClassifications.some(p=>p.class!=='TRP'))return ['TRP 外部编辑须为有效 TRP 范围、专供编辑且关闭便捷测绘的登记完成品。'];return [];
}
export const createTrpEditingWorkflow=():WorkflowDefinition=>({id:'v3-editor-trp-external',label:{zh:'交易点（专供编辑）',en:''},mode:'external',quickMapping:false,editor:{enabled:true,dedicated:true,scope:{class:'TRP'}},target:{class:'TRP'},steps:[],outputs:[],external:{componentKey:'tradePointEditor',purpose:'edit',reason:'trp-integrated',version:1,coveredClassifications:[{class:'TRP'}]}});
