"""Gate and archive this r7 delivery; do not overwrite the historical r6 archive."""
import hashlib,json,re,shutil,subprocess
from datetime import datetime
from pathlib import Path
from browser_check import OUT
ROOT=Path(__file__).resolve().parents[3]
DEST=ROOT/'docs/90_roadmap-and-history/runtime-v32-frontend-runtime-editor-20261009'
DEST.mkdir(parents=True,exist_ok=True)
def read(name):return json.loads((OUT/name).read_text(encoding='utf-8'))
matrix=read('independent-matrix.json');hierarchy=read('independent-hierarchy.json');dense=read('independent-dense.json')
assert matrix['cases']==909 and matrix['failed']==0 and not matrix['runtimeErrors']
assert hierarchy['cases']==252 and hierarchy['failed']==0 and not hierarchy['runtimeErrors']
assert len(dense['results'])==6 and not any(row['issues'] for row in dense['results']) and not dense['errors']
native=read('native-workflow-matrix.json');external=read('external-lifecycle.json')
assert len(native['cases'])==34 and len({row['schemaKey'] for row in native['cases']})==17 and not native['errors']
assert len(external['results'])==3 and sum(len(row['v3']) for row in external['results'])==7 and not external['errors']
assert all(row['v1']==row['v3'] for row in external['results'])
performance=read('production-performance.json');data=read('runtime-data-result.json')
assert performance['scriptRatio']<=2 and performance['rows'][1]['cardP95Ms']<=100 and not performance['runtimeErrors']
assert performance['rows'][0]['host']['records']==performance['rows'][1]['host']['records']==463
assert performance['rows'][1]['host']['contract']==7 and performance['rows'][1]['disabledHover']['layerChanges']==0
assert [row['records'] for row in data['expanded']]==[1000,5000] and not data['runtimeErrors']
assert len({row['configStats']['epoch'] for row in data['expanded']})==1
assert all(row['configStats']['cachedPaths']<=1024 for row in data['expanded'])
manifest=read('delivery-manifest.json');imported=read('delivery-import.json')
assert manifest['contractRevision']==7 and manifest['packageRevision']==3 and manifest['verifiedFrozenSourceFiles']==520
assert manifest['jsonZipRoundTrip'] and manifest['validationErrors']==0 and imported['actualFileInput'] and imported['jsonContentEquality']
evidence_names=['independent-matrix.json','independent-hierarchy.json','independent-dense.json','native-workflow-matrix.json','external-lifecycle.json','workflow-capture-parity.json','interaction-states.json','interaction-parity.json','interaction-browser-result.json','render-browser-result.json','svg-offsets.json','bud-parity-browser.json','lifecycle-browser-result.json','studio-browser-result.json','studio-extended-result.json','field-binding-browser-result.json','delivery-import.json','delivery-manifest.json','delivery-validation.json','render-migration-sources.json','module-entry-result.json','module-retry-result.json','module-retry-measurement-result.json','app-mount-result.json','runtime-data-result.json','production-performance.json','runtime-performance.json','r7-editor-result.json','category-editor-result.json','density-order-result.json','extensions-grouping-result.json','module-help-result.json','verify-final.log','build-final.log']
for name in evidence_names:
 if name.endswith('.json'):
  report=read(name)
  for key in ['errors','runtimeErrors','runtime_errors']:
   if key in report:assert not report[key],(name,key,report[key])
render=read('render-browser-result.json');assert render['roundTrip']=={'same':True,'revision':7}
assert len(render['positions'])==45 and all(row['tiles'] and row['tileErrors']==0 for row in render['lowZoomTiles'])
assert read('module-retry-result.json')['originalToolOpened'] and read('module-retry-measurement-result.json')['originalToolOpened']
assert len(read('app-mount-result.json')['checks'])>=5
verify=(OUT/'verify-final.log').read_text(encoding='utf-8-sig');build=(OUT/'build-final.log').read_text(encoding='utf-8-sig')
tests=re.findall(r'> cairnmap-web@[^\n]+ (test:[^\s]+)',verify)
assert len(tests)==25 and 'error TS' not in build and 'built in' in build
ledger=json.loads((ROOT/'scripts/config-tools/fixtures/v3-parameter-ledger.json').read_text(encoding='utf-8'))
def sha(file):return hashlib.sha256(file.read_bytes()).hexdigest()
files=[{'file':name,'sha256':sha(OUT/name),'bytes':(OUT/name).stat().st_size,'modifiedAt':datetime.fromtimestamp((OUT/name).stat().st_mtime).astimezone().isoformat()} for name in evidence_names]
summary={'schemaVersion':'cairnmap.v32-runtime-editor-acceptance.v1','generatedAt':datetime.now().astimezone().isoformat(),'status':'local_implementation_auto_acceptance_passed_manual_pending','candidateSourceHead':manifest['candidateSourceHead'],'branch':manifest['branch'],'frozenV1':manifest['frozenV1'],'sourceHashFilesChecked':520,'deterministicTestCommands':tests,'buildPassed':True,'render':{'independentCases':1161,'denseScenarios':6,'failed':0,'r6r7SemanticComparisons':5130,'referenceScope':'V1 freshly captured this implementation turn; reused only for final retest after frozen 520 hashes checked','nineDirectionsAndOffsets':45,'wholeImagePixelEqualityClaimed':False},'workflows':{'composed':17,'nativeUISubmissions':34,'externalWorkflows':3,'externalRecords':7,'fullRecordEquality':True,'externalScope':'frozen source components/formatters capture bridge, not full frozen host replay'},'actualApp':{'coldAndWarmTools':'passed','moduleFaultRetry':'explicit page reload restores measuring or measurement request','mountLifecycle':'actual creation, submission, mount, enable/disable, label/card pointer, delete recovery, world UI','fieldGeometryReplacement':'supplementary production storage/event protocol; full edit UI combinations manual'},'performance':{'productionScriptRatio':performance['scriptRatio'],'V3CardP95Ms':performance['rows'][1]['cardP95Ms'],'batchesPerMode':5,'sixZoomsPerBatch':6,'cardScope':'30 repeated real pointer opens of one visible feature per mode, next visible frame','disabledHoverLayerChanges':0,'expanded':data['expanded'],'expandedSmoothnessClaimed':False,'memoryScope':data['memoryScope']},'package':{'contractRevision':7,'revision':3,'diskZIPActualStudioImport':True,'roundTrip':True},'parameters':{'count':len(ledger['parameters']),'counts':ledger['counts'],'allValuesEndToEndClaimed':False},'manualAcceptance':{'agentBrowserAndRepresentativeVisual':'passed','user':'not_executed','promotionApproved':False},'remoteActions':{'push':False,'PR':False,'mainChanged':False,'RIASync':False},'evidenceDirectory':str(OUT),'evidenceFiles':files}
(OUT/'acceptance-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
for name in evidence_names:
 if name.endswith('.json'):shutil.copy2(OUT/name,DEST/name)
for name in ['acceptance-summary.json','CairnMap_V32_RuntimeEditor_r3.zip']:shutil.copy2(OUT/name,DEST/name)
original=ROOT.parent/'cairnmap-config-runtime-v32'
def git(*args):return subprocess.check_output(['git','-C',str(original),*args])
status=git('status','--porcelain').decode('utf-8');diff=git('diff','--binary','HEAD')
(DEST/'original-v32-state.json').write_text(json.dumps({'readAt':datetime.now().astimezone().isoformat(),'head':git('rev-parse','HEAD').decode().strip(),'statusEntries':status.splitlines(),'trackedDiffSha256':hashlib.sha256(diff).hexdigest(),'policy':'original dirty worktree preserved; no precise 12:04 rollback claimed'},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'renderCases':1161,'composedSubmissions':34,'externalRecords':7,'testGroups':25,'productionRatio':performance['scriptRatio'],'cardP95':performance['rows'][1]['cardP95Ms'],'archive':str(DEST)},ensure_ascii=False))
