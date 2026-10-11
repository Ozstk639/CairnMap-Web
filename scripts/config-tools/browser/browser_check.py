"""CDP acceptance in an isolated headless Edge profile, using the local app."""
import base64
import os
import sys
import json
from pathlib import Path
import time
import urllib.request
import websocket

sys.stdout.reconfigure(encoding='utf-8')
OUT = Path(os.environ.get('CAIRNMAP_ACCEPTANCE_OUT', str(Path(__file__).parent / 'artifacts')))
OUT.mkdir(parents=True, exist_ok=True)

class Browser:
    def __init__(self):
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        port = os.environ.get('CAIRNMAP_CDP_PORT', '9238')
        pages = json.loads(opener.open('http://127.0.0.1:'+port+'/json').read())
        page = next(item for item in pages if item['type'] == 'page' and (item['url'] == 'about:blank' or item['url'].startswith(('http://127.0.0.1:5188', 'http://127.0.0.1:5189', 'http://127.0.0.1:5208', 'http://127.0.0.1:5209'))))
        self.ws = websocket.create_connection(page['webSocketDebuggerUrl'], origin='http://127.0.0.1:'+port, timeout=30)
        self.seq = 0
        self.errors = []
        self.call('Page.enable')
        self.call('Runtime.enable')
        self.call('Emulation.setTouchEmulationEnabled', {'enabled': False})
        self.call('Emulation.setDeviceMetricsOverride', {'width': 1440, 'height': 1000, 'deviceScaleFactor': 1, 'mobile': False})
    def call(self, method, params=None):
        self.seq += 1
        ident = self.seq
        self.ws.send(json.dumps({'id': ident, 'method': method, 'params': params or {}}))
        while True:
            result = json.loads(self.ws.recv())
            if result.get('method') == 'Runtime.exceptionThrown': self.errors.append(result['params'])
            if result.get('id') != ident: continue
            if 'error' in result: raise RuntimeError(result['error'])
            return result.get('result', {})
    def evaluate(self, source):
        result = self.call('Runtime.evaluate', {'expression': source, 'returnByValue': True, 'awaitPromise': True})
        if 'exceptionDetails' in result: raise RuntimeError(result['exceptionDetails'])
        return result.get('result', {}).get('value')
    def wait(self, predicate, seconds=20):
        deadline = time.time() + seconds
        while time.time() < deadline:
            try:
                if self.evaluate(predicate): return
            except RuntimeError as error:
                # A real navigation can destroy the old execution context while
                # polling. Retry only this CDP transport condition, never JS errors.
                if not any(message in str(error) for message in ['Inspected target navigated or closed', 'Execution context was destroyed', 'Cannot find context']): raise
            time.sleep(.15)
        raise RuntimeError('Browser predicate timed out: ' + predicate)
    def navigate(self, query):
        self.call('Page.navigate', {'url': 'http://127.0.0.1:5188/' + query})
        self.wait("document.querySelector('nav[aria-label=\"设计工作区\"]') !== null")
        self.evaluate('window.confirm = () => true')
    def click(self, label):
        rect = self.evaluate("(() => { const el = [...document.querySelectorAll('button,summary')].find(el => (el.dataset.moduleTitle === " + json.dumps(label) + " || el.textContent.trim() === " + json.dumps(label) + " || el.getAttribute('aria-label') === " + json.dumps(label) + " || el.getAttribute('title') === " + json.dumps(label) + ") && el.getBoundingClientRect().height); if(!el) throw Error('Element missing'); el.scrollIntoView({block:'center'}); const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}; })()")
        self.call('Input.dispatchMouseEvent', {'type': 'mousePressed', 'button': 'left', 'clickCount': 1, **rect})
        self.call('Input.dispatchMouseEvent', {'type': 'mouseReleased', 'button': 'left', 'clickCount': 1, **rect})
        time.sleep(.2)
    def screenshot(self, name):
        data = self.call('Page.captureScreenshot', {'format': 'png', 'captureBeyondViewport': False})['data']
        (OUT / name).write_bytes(base64.b64decode(data))

def studio_acceptance():
    browser = Browser()
    checks = []
    browser.navigate('?workspace=config-studio')
    assert browser.evaluate("document.querySelectorAll('[role=tab]').length") == 2
    browser.click('读取/新建')
    browser.click('工作流设计')
    assert browser.evaluate("document.querySelector('[role=tab][aria-selected=true]').textContent") == '要素设计'
    checks.append('feature draft blocks tab switch')
    browser.click('放弃草稿')
    browser.click('工作流设计')
    browser.evaluate("(() => {const s=document.querySelector('section[aria-label=\"工作流编辑区域\"] select');s.value=[...s.options].find(o=>o.textContent.toUpperCase().includes('ROD')).value;s.dispatchEvent(new Event('change',{bubbles:true}));})()")
    browser.click('读取')
    browser.wait("document.querySelector('input[aria-label=\"组装目标 1\"]')!==null")
    browser.click('要素设计')
    assert browser.evaluate("document.querySelector('[role=tab][aria-selected=true]').textContent") == '工作流设计'
    checks.append('workflow draft blocks tab switch')
    metrics = browser.evaluate("(() => {const s=document.querySelector('section[aria-label=\"工作流编辑区域\"]');s.scrollTop=0;const r=s.getBoundingClientRect();return {height:s.clientHeight,content:s.scrollHeight,x:r.x+20,y:r.y+200};})()")
    assert metrics['content'] > metrics['height']
    browser.call('Input.dispatchMouseEvent', {'type': 'mouseWheel', 'x': metrics['x'], 'y': metrics['y'], 'deltaX': 0, 'deltaY': 650})
    browser.wait("document.querySelector('section[aria-label=\"工作流编辑区域\"]').scrollTop>0")
    checks.append('workflow wheel scrolls a bounded container')
    browser.screenshot('workflow-assignments.png')
    browser.click('保存')
    browser.wait("document.querySelector('input[aria-label=\"组装目标 1\"]')===null")
    browser.click('要素设计')
    assert browser.evaluate("document.querySelector('[role=tab][aria-selected=true]').textContent") == '要素设计'
    checks.append('save writes package and ends workflow draft')
    browser.navigate('?workspace=config-workflow')
    assert browser.evaluate("new URL(location.href).searchParams.get('workspace')") == 'config-studio'
    assert browser.evaluate("document.querySelector('[role=tab][aria-selected=true]').textContent") == '工作流设计'
    checks.append('compatibility URL enters shared Studio workflow tab')
    browser.screenshot('studio-workflow-tab.png')
    assert not browser.errors, browser.errors
    result = {'checks': checks, 'runtime_errors': browser.errors}
    (OUT / 'studio-browser-result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False))

if __name__ == '__main__': studio_acceptance()
