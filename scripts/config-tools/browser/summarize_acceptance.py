"""Validate result counts and archive compact evidence for the local delivery."""
import hashlib,json,re,shutil,subprocess
from datetime import datetime
from pathlib import Path
from browser_check import OUT
ROOT=Path(__file__).resolve().parents[3]
DEST=ROOT/'docs/90_roadmap-and-history/runtime-v32-implementation-20261008'
DEST.mkdir(parents=True,exist_ok=True)
def read(name):return json.loads((OUT/name).read_text(encoding='utf-8'))
matrix=read('independent-matrix.json');hierarchy=read('independent-hierarchy.json');dense=read('independent-dense.json')
assert matrix['cases']==909 and matrix['failed']==0 and not matrix['runtimeErrors']
assert hierarchy['cases']==252 and hierarchy['failed']==0 and not hierarchy['runtimeErrors']
assert len(dense['results'])==6 and not any(r['issues'] for r in dense['results']) and not dense['errors']
native=read('native-workflow-matrix.json');external=read('external-lifecycle.json');states=read('interaction-states.json')
assert len(native['cases'])==34 and len({r['schemaKey'] for r in native['cases']})==17 and not native['errors']
assert len(external['results'])==3 and sum(len(r['v3']) for r in external['results'])==7 and not external['errors']
assert all(r['v1']==r['v3'] for r in external['results'])
assert len(states['cases'])==5 and not states['errors']
render=read('render-browser-result.json');svg=read('svg-offsets.json');bud=read('bud-parity-browser.json')
assert len(svg['cases'])==6 and not svg['errors'];assert len(bud['cases'])==6 and bud['emptyNameHidesPoint'] and not bud['errors']
assert len(render['lowZoomTiles'])==3 and all(r['tiles'] and r['tileErrors']==0 for r in render['lowZoomTiles']) and not render['runtimeErrors']
delivery=read('delivery-manifest.json');imported=read('delivery-import.json');binding=read('field-binding-browser-result.json')
assert delivery['validationErrors']==0 and delivery['jsonZipRoundTrip'] and delivery['verifiedFrozenSourceFiles']==520
assert imported['actualFileInput'] and imported['jsonContentEquality'] and not imported['errors']
assert binding['record']['tags']['acceptanceValues']==[3,4] and not binding['errors']
verify=(OUT/'verify-final.log').read_text(encoding='utf-8-sig');build=(OUT/'build-final.log').read_text(encoding='utf-8-sig')
tests=re.findall(r'> cairnmap-web@[^\n]+ (test:[^\s]+)',verify)
assert len(tests)==21 and 'error TS' not in build and 'built in' in build
ledger=json.loads((ROOT/'scripts/config-tools/fixtures/v3-parameter-ledger.json').read_text(encoding='utf-8'))
cards=json.loads((ROOT/'scripts/config-tools/fixtures/v1-independent-card-baseline.json').read_text(encoding='utf-8'))
def sha(file):return hashlib.sha256(file.read_bytes()).hexdigest()
evidence_names=['independent-matrix.json','independent-hierarchy.json','independent-dense.json','native-workflow-matrix.json','external-lifecycle.json','workflow-capture-parity.json','interaction-states.json','interaction-parity.json','interaction-browser-result.json','render-browser-result.json','svg-offsets.json','bud-parity-browser.json','lifecycle-browser-result.json','studio-browser-result.json','studio-extended-result.json','field-binding-browser-result.json','delivery-import.json','delivery-manifest.json','delivery-validation.json','verify-final.log','build-final.log']
files=[{'file':name,'sha256':sha(OUT/name),'bytes':(OUT/name).stat().st_size,'modifiedAt':datetime.fromtimestamp((OUT/name).stat().st_mtime).astimezone().isoformat()} for name in evidence_names]
summary={'schemaVersion':'cairnmap.v32-acceptance-summary.v1','generatedAt':datetime.now().astimezone().isoformat(),'candidateSourceHead':delivery['candidateSourceHead'],'branch':delivery['branch'],'frozenV1':delivery['frozenV1'],'status':'local_implementation_auto_acceptance_passed_manual_pending','sourceHashFilesChecked':520,'deterministicTestCommands':tests,'buildPassed':True,'independentRender':{'matrix':909,'hierarchy':252,'failed':0,'coveredNodes':95,'denseScenarios':6,'denseFeatureCount':dense['features'],'referenceMeasurements':'immutable saved V1 measurements reused for final matrix; frozen source fingerprints rechecked'},'nativeProductionWorkflows':{'composed':17,'submissions':34,'expected':'V1 schema/assembler fixtures','fullRecordEquality':True},'external':{'workflows':3,'records':7,'reference':'frozen components + formatters + test capture bridge','candidate':'production MeasuringModule','fullFrozenHostReplay':False},'cards':{'sourceCases':len(cards['cases']),'standardCases':sum(r['record']['Class']!='TRP' for r in cards['cases']),'TRPSpecialCardExcluded':3,'evidenceScope':'visible row assembly/order/value objects; not 98 full DOM/card-click sessions'},'interaction':{'states':5,'methods':'real pointer; production search events; temp-source state storage/events','fullEditDeleteToolUX':'manual_pending'},'positions':{'nineDirectionsAndOffsets':45,'svgFamilies':2,'svgOffsetCases':6,'budIndependentZooms':[0,2,3,5,6,8],'maxLayoutErrorCssPx':1,'wholeImagePixelEqualityClaimed':False},'delivery':{'diskZipActualStudioImport':True,'JSONZIPRoundTrip':True,'contractRevision':6,'packageRevision':2},'parameters':{'membersIncludingNestedUnionVariants':len(ledger['parameters']),'counts':ledger['counts'],'perParameterAllValuesEndToEndClaimed':False},'manualAcceptance':{'automaticCDP':'passed','agentVisualReview':'BUD logical3 V1/V3 paired; dense logical5 representative','user':'not_executed','promotionApproved':False},'remoteActions':{'push':False,'PR':False,'mainChanged':False,'RIASync':False},'evidenceDirectory':str(OUT),'evidenceFiles':files,'screenshots':'paired/interaction/workflow/UI PNGs are in evidenceDirectory; not all images are committed'}
(OUT/'acceptance-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
# Retain the actual evidence JSON with the commit, but leave large screenshots
# and logs in the local audit directory. The ZIP contains its config and hashes.
for name in evidence_names:
 if name.endswith('.json'):shutil.copy2(OUT/name,DEST/name)
for name in ['acceptance-summary.json','CairnMap_V32_V1Parity_r2.zip']:shutil.copy2(OUT/name,DEST/name)
original=ROOT.parent/'cairnmap-config-runtime-v32'
def git(*args):return subprocess.check_output(['git','-C',str(original),*args])
status=git('status','--porcelain').decode('utf-8');diff=git('diff','--binary','HEAD')
(DEST/'original-v32-state.json').write_text(json.dumps({'readAt':datetime.now().astimezone().isoformat(),'head':git('rev-parse','HEAD').decode().strip(),'statusEntries':status.splitlines(),'trackedDiffSha256':hashlib.sha256(diff).hexdigest(),'policy':'original dirty worktree preserved; no 12:04 precise snapshot claimed'},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'renderCases':1161,'denseScenarios':6,'composedSubmissions':34,'externalRecords':7,'standardCards':98,'testGroups':21,'archive':str(DEST)},ensure_ascii=False))
