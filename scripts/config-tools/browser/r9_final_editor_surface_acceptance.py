"""Real DOM checks for visible editors and a single settings owner."""
import json
from pathlib import Path
from browser_check import Browser, OUT

b = Browser()
backup = b.evaluate("Object.fromEntries(['cairnmap-config-studio-saved','cairnmap-config-studio-draft'].map(k=>[k,sessionStorage.getItem(k)]))")
checks = []
try:
    b.evaluate("(async()=>{const m=await import('/src/configStudio/renderRuleTemplates.ts');const c=m.createEditableConfigPackageFromCurrentProject();for(const k of ['cairnmap-config-studio-saved','cairnmap-config-studio-draft'])sessionStorage.setItem(k,JSON.stringify(c));})()")
    b.navigate('?workspace=config-studio&configMode=v3&tab=workflows')
    b.wait("!!document.querySelector('section[aria-label=\"工作流编辑区域\"] select')")
    b.evaluate("(()=>{const e=document.querySelector('section[aria-label=\"工作流编辑区域\"] select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,'v3-tpp_teleport');e.dispatchEvent(new Event('change',{bubbles:true}));})()")
    b.click('读取')
    b.wait("!!document.querySelector('input[aria-label=\"绘制输入槽位\"]')")
    for width in [1440, 390]:
        b.call('Emulation.setDeviceMetricsOverride', {'width': width, 'height': 1000, 'deviceScaleFactor': 1, 'mobile': width == 390})
        result = b.evaluate("""(()=>{const q=['input[aria-label="绘制输入槽位"]','input[aria-label="输出绘制标题"]','input[aria-label="额外绘制标题"]'];return q.map(s=>{const e=document.querySelector(s),c=getComputedStyle(e);return {selector:s,border:parseFloat(c.borderTopWidth),style:c.borderTopStyle,height:e.getBoundingClientRect().height,background:c.backgroundColor}})})()""")
        assert all(x['border'] >= 1 and x['style'] == 'solid' and x['height'] >= 30 for x in result), result
        checks.append({'width': width, 'visibleFields': result})
    owners = b.evaluate("[...document.querySelectorAll('article')].filter(e=>e.querySelector('textarea[placeholder=\"控件标题\"]')?.closest('article')===e).map(e=>[...e.querySelectorAll('label')].filter(l=>l.textContent.startsWith('保存值处理')).length)")
    assert max(owners) <= 1, owners
    b.screenshot('r9-editor-visible-inputs.png')
    assert not b.errors, b.errors
    (OUT / 'r9-final-editor-surface-acceptance.json').write_text(json.dumps({'checks': checks, 'normalizationOwners': owners, 'runtimeErrors': b.errors}, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'checks': len(checks), 'normalizationOwners': owners, 'runtimeErrors': b.errors}, ensure_ascii=False))
finally:
    b.evaluate('Object.entries('+json.dumps(backup)+').forEach(([k,v])=>v===null?sessionStorage.removeItem(k):sessionStorage.setItem(k,v))')
