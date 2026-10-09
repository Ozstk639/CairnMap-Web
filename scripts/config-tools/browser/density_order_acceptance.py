import json, os, time
from pathlib import Path
from browser_check import Browser
OUT=Path(os.environ.get('CAIRNMAP_ACCEPTANCE_OUT',str(Path(__file__).parent/'artifacts')));OUT.mkdir(parents=True,exist_ok=True)
b=Browser();b.call('Page.navigate',{'url':'http://127.0.0.1:5188/?workspace=config-lab&configMode=v3'});b.wait("!!document.querySelector('.leaflet-container')",40)
findmap="""(()=>{const e=document.querySelector('.leaflet-container');let f=e[Object.keys(e).find(k=>k.startsWith('__reactFiber'))];while(f){let h=f.memoizedState;while(h){for(const v of [h.memoizedState,h.memoizedState?.current])if(v?.getZoom&&v?._container){window.densityMap=v;return true;}h=h.next;}f=f.return;}return false;})()"""
b.wait(findmap)
result=b.evaluate("""(async()=>{const {layoutLabelsOnMap}=await import('/src/components/Rules/rendering/labelLayout.ts');const map=window.densityMap;
const run=(order,quota=false)=>{let calls=0;const base={placement:'center',text:'fixed',font:'14px monospace',declutter:{enabled:true,candidates:['C'],collisionRole:'optional',collisionAllowOverlap:true,minSpacingPx:0,densityEnabled:true,densityGridSizePx:100,densityMaxLabelsPerGrid:1,densityPreserveRequired:false,placementCacheEnabled:false,allowHide:true}};
const a={...base,id:'density-a',anchorLatLng:map.containerPointToLatLng([550,500]),declutter:{...base.declutter,priority:100}};
const target={...base,id:'density-b',anchorLatLng:map.containerPointToLatLng([quota?550:400,500]),placement:quota?'center':'E',text:'W'.repeat(28),declutter:{...base.declutter,priority:1,densityReduceOrder:order,allowAbbrev:true,abbrev:()=>{calls++;return 'W';}}};
const placed=layoutLabelsOnMap(map,[a,target],{preferNearCenter:false});const item=placed.find(p=>p.id==='density-b');return {hidden:item.hidden,text:item.text,calls,trace:item.densityActionTrace,reason:item.hiddenReason};};
return {hideFirst:run(['hideOptionalLabels','abbreviateOptionalLabels']),abbreviateFirst:run(['abbreviateOptionalLabels','hideOptionalLabels']),hardQuota:run(['abbreviateOptionalLabels','hideOptionalLabels'],true),emptyOrder:run([])};})()""")
assert result['hideFirst']['hidden'] and result['hideFirst']['calls']==0,result
assert not result['abbreviateFirst']['hidden'] and result['abbreviateFirst']['calls']==1,result
assert result['hardQuota']['hidden'],result
assert result['emptyOrder']['hidden'] and result['emptyOrder']['calls']==0,result
b.navigate('?workspace=config-studio');b.click('读取/新建');b.evaluate("(()=>{const e=[...document.querySelectorAll('button')].find(e=>e.textContent.includes('仅显示启用状态'));if(e)e.click();const g=document.querySelector('[data-rule-extensions]');g.open=true;[...g.querySelectorAll('details')].find(e=>e.querySelector('summary')?.dataset.moduleTitle==='候选、碰撞对象与稳定/密度策略').open=true;return true;})()")
order=b.evaluate("(()=>{const g=document.querySelector('[data-density-order]');return [...g.querySelectorAll('[role=checkbox][aria-checked=true]')].map(e=>e.textContent);})()")
assert order==[str(i+1) for i in range(len(order))],order
result['numberedUI']=order;b.screenshot('density-numbered-editor.png');b.click('放弃草稿')
result['runtimeErrors']=b.errors;(OUT/'density-order-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');assert not b.errors,b.errors;print(json.dumps(result,ensure_ascii=False))
