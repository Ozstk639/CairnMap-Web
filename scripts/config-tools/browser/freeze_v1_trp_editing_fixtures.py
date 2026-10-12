import json
from pathlib import Path
from browser_check import Browser
b=Browser();root=Path(__file__).resolve().parents[3]
b.call('Page.navigate',{'url':'http://127.0.0.1:5189/scripts/config-tools/v1-workflow-oracle.html?componentKey=tradePointWorkflow'});b.wait('!!window.v1WorkflowOracle',40)
cases=b.evaluate("""(async()=>{
 const {getFormatDef}=await import('/src/components/Common/featureFormats.ts');
 const {SCHEMA_TRP_TRADE,projectRegistryScene}=await import('/src/components/Common/workflowEditorRegistry/index.ts');
 const {parseFeatureInfoByRegistry,mergeEditorDraftIntoFeatureInfo,mergeUnparsedEntriesIntoFeatureInfo,CLASSIFICATION_DRAFT_KEY}=await import('/src/components/Common/workflowEditorParser.ts');
 const {readMultipartGeometry,withCanonicalMultipartGeometry}=await import('/src/core/geometry/multipartGeometry.ts');
 const def=getFormatDef('交易点'),view=projectRegistryScene(SCHEMA_TRP_TRADE,'editor'),coords=[{x:20,y:0,z:13}],result=[];
 for(let index=0;index<3;index++){
  const values={ID:'ZTRP_EDIT_'+index,Name:'V1 trade '+index,Kind:'NOM',SKind:'NOM',Interaction:'右键',Situation:'Enable',elevation:0,Trade:[{TradeNum:0,Note:'original note',OfferItems:[{Name:'Stone',Img:'',Count:0,ItemID:'minecraft:stone',Brief:'offered'}],ReceiveItems:[{Name:'Emerald',Img:'',Count:'1',ItemID:'minecraft:emerald',Brief:'received'}]}]};
  const original=def.buildFeatureInfo({op:'create',mode:'point',coords,values,groups:{tags:[{tagKey:'Land',tagValue:'LAND_TEST'},{tagKey:'UAdm',tagValue:'ADM_POINT'},{tagKey:'UAdmG',tagValue:'ADM_AREA'}],extensions:[{extGroup:'link',extKey:'wiki',extType:'text',extValue:'https://example.invalid/trp'},{extGroup:'character',extKey:'brief',extType:'text',extValue:'TRP original brief'}]},worldId:'zth',editorId:'original-creator',now:new Date('2026-10-07T00:00:00Z')});
  original.opaque={zero:0,no:false,empty:[],nothing:null};original.tags={...original.tags,audit:false};original.extensions={...original.extensions,foreign:{zero:0,no:false,list:[{a:0,b:false}]}};
  if(index===2){original.trade=original.Trade;delete original.Trade;}
  const parsed=parseFeatureInfoByRegistry(original,view),edited=structuredClone(parsed.values);edited.Name='V1 edited TRP '+index;
  if(index===1)edited.Trade[0].OfferItems[0].Count='2';
  if(index===2){edited[CLASSIFICATION_DRAFT_KEY]='SPE||SPE||';edited.ID='ZTRP_RENAMED';edited.elevation='-2';}
  const merged=mergeEditorDraftIntoFeatureInfo({originalFeatureInfo:original,view,draftValues:edited}),hydrated=def.hydrate(merged);
  let updated=def.buildFeatureInfo({op:'edit',mode:'point',coords,values:hydrated.values,groups:hydrated.groups,worldId:'zth',editorId:'editing-user',prevFeatureInfo:original,now:new Date('2026-10-12T00:00:00Z')});
  updated=mergeUnparsedEntriesIntoFeatureInfo(updated,parsed.unparsedEntries);updated=withCanonicalMultipartGeometry(updated,readMultipartGeometry(original,'Point').geometry);
  result.push({case:index,original,projectedValues:parsed.values,editedValues:edited,updated,view});
 }
 return result;
})()""")
fixture={'schemaVersion':'cairnmap.v1-trp-editor-reference.v1','sourceHead':'0b82863d4fea3791f98917ba6d13f70e1f27eb15','source':'untouched frozen V1 schema_TRP/editor parser/actual formatter; canonical and legacy trade','cases':cases};path=root/'scripts/config-tools/fixtures/v1-trp-editing-reference.json';path.write_text(json.dumps(fixture,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps({'path':str(path),'cases':len(cases)},ensure_ascii=False))
