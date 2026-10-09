"""Import the delivered disk ZIP through the actual Studio file input."""
import json,os
from browser_check import Browser,OUT
b=Browser();b.navigate('?workspace=config-studio')
backup=b.evaluate("Object.fromEntries(['cairnmap-config-studio-saved','cairnmap-config-studio-draft'].map(k=>[k,sessionStorage.getItem(k)]))")
try:
 basename=os.environ.get('CAIRNMAP_DELIVERY_BASENAME','CairnMap_V32_V1Parity_r2')
 expected=json.loads((OUT/(basename+'.config.json')).read_text(encoding='utf-8'))
 root=b.call('DOM.getDocument')['root']['nodeId']
 node=b.call('DOM.querySelector',{'nodeId':root,'selector':'main > header input[type=file]'})['nodeId']
 b.call('DOM.setFileInputFiles',{'nodeId':node,'files':[str(OUT/(basename+'.zip'))]})
 b.wait("document.body.innerText.includes("+json.dumps('已导入 '+expected['packageId']+' r'+str(expected['revision'])+'。')+")")
 actual=b.evaluate("JSON.parse(sessionStorage.getItem('cairnmap-config-studio-saved'))")
 assert actual==expected
 assert b.evaluate("document.body.innerText.includes("+json.dumps('契约 r'+str(expected['contractRevision']))+")")
 b.screenshot('delivery-import-studio.png')
 assert not b.errors,b.errors
 (OUT/'delivery-import.json').write_text(json.dumps({'actualFileInput':True,'jsonContentEquality':True,'contractRevision':expected['contractRevision'],'packageRevision':expected['revision'],'errors':b.errors},indent=2),encoding='utf-8')
 print('delivered ZIP -> actual Studio file input -> saved package content: OK')
finally:
 b.evaluate('Object.entries('+json.dumps(backup)+').forEach(([k,v])=>v===null?sessionStorage.removeItem(k):sessionStorage.setItem(k,v))')
