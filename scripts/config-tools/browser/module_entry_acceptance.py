"""Real App -> ConfigLab cold module activation, in the isolated CDP browser."""
import json
import os
import time
from pathlib import Path
from browser_check import Browser

OUT = Path(os.environ.get('CAIRNMAP_ACCEPTANCE_OUT', str(Path(__file__).parent / 'artifacts')))
OUT.mkdir(parents=True, exist_ok=True)
b = Browser()
checks = []
# Vite may serve a timestamped import after HMR; use App's actual module URL.
store = "(await import((await (await fetch('/src/App.tsx')).text()).match(/from\\s+[\"']([^\"']*featureModuleStore[^\"']*)/)[1])).useFeatureModuleStore"

def state(expression):
    return b.evaluate('(async()=>{const s=' + store + '.getState();return ' + expression + ';})()')

def load(mode, narrow=False, cold=True):
    b.call('Emulation.setDeviceMetricsOverride', {'width': 390 if narrow else 1440, 'height': 844 if narrow else 1000, 'deviceScaleFactor': 1, 'mobile': narrow})
    if cold:
        b.evaluate("localStorage.removeItem('ria_feature_modules_v1');true")
    b.call('Page.navigate', {'url': 'http://127.0.0.1:5188/?workspace=config-lab&configMode=' + mode})
    b.wait("!!document.querySelector('.leaflet-container')", 40)
    b.wait("(async()=>{const m=" + store + ".getState();return m.hydrated;})()", 20)
    time.sleep(.4)

def open_tool(tool):
    visible = b.evaluate("[...document.querySelectorAll('button')].some(e=>e.textContent.trim()===" + json.dumps(tool) + "&&e.getBoundingClientRect().height)")
    if not visible:
        b.evaluate("document.querySelector('button[title=\"模式工具\"]').click();true")
        b.wait("[...document.querySelectorAll('button')].some(e=>e.textContent.trim()===" + json.dumps(tool) + "&&e.getBoundingClientRect().height)")
    b.evaluate("(()=>{const e=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===" + json.dumps(tool) + "&&e.getBoundingClientRect().height);e.click();return true;})()")

for mode, narrow, tool in [('v3', False, '测绘'), ('v3', True, '测量工具'), ('v3', True, '测绘'), ('v1', False, '测量工具')]:
    print(json.dumps({'checking': mode, 'narrow': narrow, 'tool': tool}, ensure_ascii=False), flush=True)
    load(mode, narrow)
    assert state('s.modules.measuring.enabledByUser') is False
    open_tool(tool)
    b.wait("!!document.querySelector('[role=dialog][aria-labelledby=feature-module-dialog-title]')")
    assert b.evaluate("document.querySelectorAll('#feature-module-dialog-title').length") == 1
    rect = b.evaluate("(()=>{const r=document.querySelector('[role=dialog]').getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,w:innerWidth,h:innerHeight};})()")
    assert rect['x'] >= 0 and rect['y'] >= 0 and rect['right'] <= rect['w'] and rect['bottom'] <= rect['h'], rect
    b.click('取消')
    b.wait("!document.querySelector('[role=dialog][aria-labelledby=feature-module-dialog-title]')")
    assert state('s.modules.measuring.enabledByUser') is False
    open_tool(tool)
    b.click('下载并启用')
    b.wait("(async()=>{const s=" + store + ".getState();return s.modules.measuring.status==='loaded'&&!s.dialog.isOpen;})()", 60)
    b.wait("[...document.querySelectorAll('button')].some(e=>e.textContent.trim()==='开始测绘(完整)'&&e.getBoundingClientRect().height)" if tool == '测绘' else "[...document.querySelectorAll('h3')].some(e=>e.textContent.trim()==='测量工具'&&e.getBoundingClientRect().height)")
    b.evaluate("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))")
    checks.append({'mode': mode, 'narrow': narrow, 'tool': tool, 'coldDialogSingle': True, 'cancelKeepsDisabled': True, 'activationLoaded': True, 'dialogBounds': rect})
    b.screenshot('module-entry-' + mode + ('-narrow' if narrow else '-desktop') + ('-measuring' if tool == '测绘' else '-measurement') + '.png')
load('v3', cold=False)
assert state('s.modules.measuring.enabledByUser') is True
b.click('测绘')
b.wait("(async()=>{return " + store + ".getState().modules.measuring.status==='loaded';})()", 60)
assert not state('s.dialog.isOpen')
checks.append({'mode': 'v3', 'warmActivationWithoutDialog': True})
b.evaluate("(()=>{const s=JSON.parse(localStorage.getItem('ria_feature_modules_v1'));s.appVersion='acceptance-old-version';s.modules.measuring.lastLoadedVersion='acceptance-old-version';localStorage.setItem('ria_feature_modules_v1',JSON.stringify(s));return true;})()")
load('v3',cold=False)
assert state('s.modules.measuring.enabledByUser') is True
assert state('s.modules.measuring.lastLoadedVersion') is None
open_tool('测绘')
b.wait("(async()=>{const s="+store+".getState();return s.modules.measuring.status==='loaded'&&s.modules.measuring.lastLoadedVersion===s.appVersion;})()",40)
assert not state('s.dialog.isOpen')
checks.append({'mode':'v3','versionMismatchInvalidatesLoadedMarker':True,'userActivationRetained':True,'reloadUsesCurrentVersion':True})
result = {'checks': checks, 'runtimeErrors': b.errors}
(OUT / 'module-entry-result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
assert not b.errors, b.errors
print(json.dumps(result, ensure_ascii=False))
