"""Import the delivered disk ZIP through the actual Studio file input."""
import json
from browser_check import Browser,OUT
b=Browser();b.navigate('?workspace=config-studio')
backup=b.evaluate("Object.fromEntries(['cairnmap-config-studio-saved','cairnmap-config-studio-draft'].map(k=>[k,sessionStorage.getItem(k)]))")
try:
 expected=json.loads((OUT/'CairnMap_V32_V1Parity_r2.config.json').read_text(encoding='utf-8'))
 root=b.call('DOM.getDocument')['root']['nodeId']
 node=b.call('DOM.querySelector',{'nodeId':root,'selector':'main > header input[type=file]'})['nodeId']
 b.call('DOM.setFileInputFiles',{'nodeId':node,'files':[str(OUT/'CairnMap_V32_V1Parity_r2.zip')]})
 b.wait("document.body.innerText.includes('已导入 cairnmap-config-v32-semantic r2。')")
 actual=b.evaluate("JSON.parse(sessionStorage.getItem('cairnmap-config-studio-saved'))")
 assert actual==expected
 assert b.evaluate("document.body.innerText.includes('契约 r6')")
 b.screenshot('delivery-import-studio.png')
 assert not b.errors,b.errors
 (OUT/'delivery-import.json').write_text(json.dumps({'actualFileInput':True,'jsonContentEquality':True,'contractRevision':6,'packageRevision':2,'errors':b.errors},indent=2),encoding='utf-8')
 print('delivered ZIP -> actual Studio file input -> saved package content: OK')
finally:
 b.evaluate('Object.entries('+json.dumps(backup)+').forEach(([k,v])=>v===null?sessionStorage.removeItem(k):sessionStorage.setItem(k,v))')
