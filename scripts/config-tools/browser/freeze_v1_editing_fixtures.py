"""Generate references exclusively through the frozen V1 formatter/editor parser."""
import json
from pathlib import Path
from browser_check import Browser
b=Browser();root=Path(__file__).resolve().parents[3]
b.call('Page.navigate',{'url':'http://127.0.0.1:5189/scripts/config-tools/v1-workflow-oracle.html?componentKey=railwayWorkflow'});b.wait('!!window.v1WorkflowOracle',40)
result=b.evaluate("""(async()=>{
 const {getFormatDef}=await import('/src/components/Common/featureFormats.ts');
 const {RAIL_SCHEMAS,projectRegistryScene}=await import('/src/components/Common/workflowEditorRegistry/index.ts');
 const {parseFeatureInfoByRegistry,mergeEditorDraftIntoFeatureInfo,mergeUnparsedEntriesIntoFeatureInfo}=await import('/src/components/Common/workflowEditorParser.ts');
 const {readMultipartGeometry,withCanonicalMultipartGeometry}=await import('/src/core/geometry/multipartGeometry.ts');
 const rows=[
  {code:'RLE',mode:'polyline',values:{ID:'ZRLE_EDIT',Name:'V1 railway',bureau:'RIA',line:'01',color:'#123456',direction:0,startplf:'ZPLF_A',endplf:'ZPLF_B'},groups:{}},
  {code:'STA',mode:'point',values:{ID:'ZSTA_EDIT',Name:'V1 station',STBuilding:'ZSTB_A',elevation:0},groups:{platforms:[{ID:'ZPLF_A'},{ID:'ZPLF_B'}]}},
  {code:'PLF',mode:'point',values:{ID:'ZPLF_EDIT',Name:'V1 platform',elevation:0,Situation:false,Connect:false},groups:{lines:[{ID:'ZRLE_A',stationCode:0,stationDistance:0,Avaliable:false,Overtaking:false,getin:false,getout:false,NextOT:false}]}},
  {code:'PFB',mode:'polygon',values:{ID:'ZPFB_EDIT',Name:'V1 boundary',LineID:'ZRLE_A',elevation:0,height:0},groups:{}},
  {code:'STB',mode:'polygon',values:{ID:'ZSTB_EDIT',Name:'V1 building',elevation:0,height:0},groups:{Floors:[{ID:'ZSTF_A',Group:'0'}]}},
  {code:'SBP',mode:'point',values:{ID:'ZSBP_EDIT',Name:'V1 building point',elevation:0},groups:{Floors:[],stations:[{ID:'ZSTA_A'}]}},
  {code:'STF',mode:'polygon',values:{ID:'ZSTF_EDIT',Name:'V1 floor',NofFloor:'0',staBuildingID:'ZSTB_A',Situation:'Enable',elevation:0,height:0},groups:{}}
 ];
 return rows.map(item=>{
  const schema=RAIL_SCHEMAS.find(s=>s.match.classCode===item.code),view=projectRegistryScene(schema,'editor'),def=getFormatDef(schema.match.subType),geometry=item.mode==='point'?'Point':item.mode==='polyline'?'LineString':'Polygon';
  const coords=item.mode==='point'?[{x:20,y:0,z:13}]:item.mode==='polyline'?[{x:20,y:-64,z:13},{x:70,y:-64,z:38}]:[{x:20,y:-64,z:13},{x:70,y:-64,z:13},{x:70,y:-64,z:38},{x:20,y:-64,z:38}];
  const original=def.buildFeatureInfo({op:'create',mode:item.mode,coords,values:item.values,groups:item.groups,worldId:'zth',editorId:'original-creator',now:new Date('2026-10-07T00:00:00Z')});
  original.opaque={zero:0,no:false,empty:[],nothing:null};original.tags={...(original.tags??{}),audit:'keep'};original.extensions={...(original.extensions??{}),link:{wiki:'https://example.invalid/v1'},character:{brief:'V1 brief'},foreign:{zero:0,no:false,list:[{a:0,b:false}]}};
  const parsed=parseFeatureInfoByRegistry(original,view),draft={...parsed.values,Name:'V1 edited '+item.code};
  const merged=mergeEditorDraftIntoFeatureInfo({originalFeatureInfo:original,view,draftValues:draft}),hydrated=def.hydrate(merged);
  let updated=def.buildFeatureInfo({op:'edit',mode:item.mode,coords,values:hydrated.values,groups:hydrated.groups,worldId:'zth',editorId:'editing-user',prevFeatureInfo:original,now:new Date('2026-10-12T00:00:00Z')});
  updated=mergeUnparsedEntriesIntoFeatureInfo(updated,parsed.unparsedEntries);updated=withCanonicalMultipartGeometry(updated,readMultipartGeometry(original,geometry).geometry);
  return {classCode:item.code,subType:schema.match.subType,mode:item.mode,view,coords,original,projectedValues:parsed.values,updated};
 });
})()""")
fixture={'schemaVersion':'cairnmap.v1-editor-reference.v1','sourceHead':'0b82863d4fea3791f98917ba6d13f70e1f27eb15','source':'untouched frozen V1 editor scene, parser and actual formatter/buildFeatureInfo','cases':result}
path=root/'scripts/config-tools/fixtures/v1-rail-editing-reference.json';path.write_text(json.dumps(fixture,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps({'path':str(path),'cases':len(result),'classCodes':[r['classCode'] for r in result]},ensure_ascii=False))
