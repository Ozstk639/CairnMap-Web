"""Fail closed if any required final-package evidence is missing or failed."""
import json,hashlib,subprocess
from pathlib import Path
from browser_check import OUT
ROOT=Path(__file__).resolve().parents[3]
def read(name):return json.loads((OUT/name).read_text(encoding='utf-8'))
def semantic_sha(name):return hashlib.sha256(json.dumps(read(name),ensure_ascii=False,sort_keys=True,separators=(',',':')).encode('utf-8')).hexdigest()
required=['r9-final-app-mount-result.json','r9-final-bud-parity-browser.json','r9-final-default-acceptance.json','r9-final-editor-surface-acceptance.json','r9-final-independent-dense.json','r9-final-independent-matrix.json','r9-final-independent-hierarchy.json','r9-final-interaction-browser-result.json','r9-final-interaction-states.json','r9-final-label-positions.json','r9-final-multipart-edit-acceptance.json','r9-final-native-workflow-matrix.json','r9-final-prefill-acceptance.json','r9-final-r8-navigation-acceptance.json','r9-final-r8-workflow-acceptance.json','r9-final-rail-edit-acceptance.json','r9-final-svg-offsets.json','r9-final-trp-edit-acceptance.json','r9-final-workflow-edit-acceptance.json','r9-final-external-lifecycle.json','r9-final-studio-acceptance.json','r9-final-zip-import-acceptance.json','r9-final-module-entry-result.json','r9-final-production-performance.json','r9-final-runtime-data-result.json','r9-category-creation-acceptance.json','r9-category-tree-acceptance.json','r9-render-acceptance.json']
for name in required:
 value=read(name);assert not value.get('runtimeErrors',value.get('errors',[])),name
for name,count in [('r9-final-independent-matrix.json',909),('r9-final-independent-hierarchy.json',252)]:
 value=read(name);assert value['cases']==count and value['failed']==0,name
assert len(read('r9-final-label-positions.json')['cases'])==90
assert len(read('r9-final-native-workflow-matrix.json')['cases'])==34
external=read('r9-final-external-lifecycle.json');assert len(external['results'])==3 and sum(len(r['v3']) for r in external['results'])==7
assert all(r['v1']==r['v3'] for r in external['results'])
assert len(read('r9-final-rail-edit-acceptance.json')['updatedRecords'])==7
assert len(read('r9-final-trp-edit-acceptance.json')['records'])==3
assert not any(r['issues'] for r in read('r9-final-independent-dense.json')['results'])
performance=read('r9-final-production-performance.json');assert performance['scriptRatio']<=2 and performance['rows'][1]['cardP95Ms']<=100
assert len(read('r9-final-default-acceptance.json')['checks'])==9
assert read('r9-final-zip-import-acceptance.json')['snapshot']['hash']==read('r9-final-zip-import-acceptance.json')['snapshot']['expected']
delivery=read('r9-r5-delivery-manifest.json')
for name,hashKey in [('CairnMap_V32_CategoryManagement_Editing_r5.config.json','jsonSha256'),('CairnMap_V32_CategoryManagement_Editing_r5.zip','zipSha256')]:assert hashlib.sha256((OUT/name).read_bytes()).hexdigest()==delivery[hashKey]
package=json.loads((ROOT/'package.json').read_text(encoding='utf-8'));commands=package['scripts']['verify:config-v32'].split(' && ');assert len(commands)==38
verify=(OUT/'theme-10-verify.log').read_text(encoding='utf-8-sig');assert all('> cairnmap-web@0.1.0 '+c.removeprefix('npm run ') in verify for c in commands)
build=(OUT/'theme-10-build.log').read_text(encoding='utf-8-sig');assert 'built in' in build and 'error TS' not in build
head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
summary={'schemaVersion':'cairnmap.r9-final-acceptance.v1','candidateSourceHead':head,'branch':'codex/cm-config-runtime-v32-migration-20261007','status':'implementation_and_agent_browser_acceptance_passed_user_confirmation_pending','contractRevision':9,'revision':5,'nodes':95,'workflows':28,'captureChoices':20,'editingRoutes':24,'testGroups':38,'build':'passed_existing_chunk_size_warning','renderCases':1161,'mainPreviewPositions':90,'nativeCreationRecords':34,'externalCaptureRecords':7,'railEditRecords':7,'trpEditRecords':3,'trpTypeBoundary':delivery['numericNormalization'],'productionPerformance':{'records':463,'V3V1ScriptRatio':performance['scriptRatio'],'V3CardP95Ms':performance['rows'][1]['cardP95Ms'],'scope':'matched production builds; five six-zoom batches per mode; 30 repeated real pointer opens of the same first visible record per mode'},'expandedData':read('r9-final-runtime-data-result.json')['expanded'],'sourceBlueprintSha256':'2deaaf87c50944fa1ade3378e6e0c44868193e05b6490d25e976c67352ffc263','historicalBlueprintSha256':'f23bab765039e6438e2f342423b7d23389ccc7843486eb1f3ed4822e7ce445ff','jsonSha256':delivery['jsonSha256'],'zipSha256':delivery['zipSha256'],'push':False,'PR':False,'mainUpdated':False,'RIASync':False,'wholeMapPixelEqualityClaimed':False,'requiredEvidence':[{'name':n,'semanticSha256':semantic_sha(n)} for n in required]}
(OUT/'r9-final-acceptance-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
print(f'Final acceptance: {len(required)} evidence files, 38 verification groups/build, 1161 displays, 90 positions, 34+7 capture records, seven rail and three TRP edit records passed.')
