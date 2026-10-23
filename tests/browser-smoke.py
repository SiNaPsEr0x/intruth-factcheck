"""Optional Chromium UI smoke test (Chrome extension APIs and bridge simulated). Requires Python Playwright and Chromium.
No model requests or audio capture are made; the bridge is simulated.
"""
import json
import os
import shutil
import tempfile
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]

class Bridge(SimpleHTTPRequestHandler):
    ready = True
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)
    def do_GET(self):
        if self.path != "/health":
            return super().do_GET()
        data = json.dumps({"ok": True, "service": "intruth-codex", "protocol": 2,
                           "model": "gpt-6-luna", "ready": Bridge.ready}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", self.headers.get("Origin", "*"))
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.end_headers()
        self.wfile.write(data)
    def log_message(self, *_args):
        pass

server = ThreadingHTTPServer(("127.0.0.1", 8787), Bridge)
threading.Thread(target=server.serve_forever, daemon=True).start()
try:
    with tempfile.TemporaryDirectory(prefix="intruth-chrome-") as profile, sync_playwright() as playwright:
        context = playwright.chromium.launch_persistent_context(
            profile, executable_path=os.environ.get("CHROMIUM_BIN") or shutil.which("chromium"), headless=True,
            args=["--no-sandbox"], accept_downloads=True,
        )
        context.add_init_script("""
          const saved = {};
          const listeners = [];
          globalThis.__dispatchInTruth = message => listeners.forEach(listener => listener(message));
          globalThis.chrome = {
            storage: {local: {
              get(keys, callback) {const result={...saved}; if(callback) callback(result); return Promise.resolve(result);},
              set(values, callback) {Object.assign(saved,values); if(callback) callback(); return Promise.resolve();},
              remove(keys) {for(const key of keys) delete saved[key]; return Promise.resolve();}
            }},
            runtime: {
              onMessage: {addListener(listener) {listeners.push(listener);}},
              sendMessage(message, callback) {const result=message.type==='GET_STATUS'?{isCapturing:false}:{ok:true}; if(callback) callback(result); return Promise.resolve(result);}
            }
          };
        """)
        errors = []
        context.on("page", lambda page: page.on("pageerror", lambda error: errors.append(str(error))))
        popup = context.new_page()
        popup.goto("http://127.0.0.1:8787/realtime-factcheck/src/popup/popup.html")
        popup.wait_for_function("!document.querySelector('#toggleBtn').disabled")
        assert popup.locator("#modelSelect").input_value() == "gpt-6-luna"
        assert popup.locator('input[type="password"]').count() == 0
        Bridge.ready = False
        popup.evaluate("refreshBridgeWarning()")
        assert popup.locator("#toggleBtn").is_disabled()
        Bridge.ready = True
        popup.evaluate("refreshBridgeWarning()")
        assert popup.locator("#toggleBtn").is_enabled()
        context.route("https://www.youtube.com/**", lambda route: route.fulfill(
            status=200, content_type="text/html", body='<html><head><title>Alpha vs Beta</title></head><body><video></video></body></html>'))
        video = context.new_page()
        video.goto("https://www.youtube.com/watch?v=intruth-test")
        video.add_style_tag(path=str(ROOT / "realtime-factcheck/src/content/overlay.css"))
        for script in ["shared/protocol.js", "content/lexical-features.js", "content/session-export.js", "content/overlay.js"]:
            video.add_script_tag(path=str(ROOT / "realtime-factcheck/src" / script))
        def send(message):
            video.evaluate("message => globalThis.__dispatchInTruth(message)", message)
        send({"type":"START_FACTCHECK"})
        video.locator("#rtfc-panel").wait_for()
        common = {"confidence":"HIGH","explanation":"Preliminary <script>alert(1)</script>",
                  "sources":[],"speaker":"Alpha","speaker_confidence":"MEDIUM",
                  "speaker_confidence_explanation":"Direct assertion.","model":"gpt-6-luna"}
        send({"type":"NEW_VERDICT","results":[dict(common,claim="Claim A",verdict="TRUE",pending=True),
                                                  dict(common,claim="Claim B",verdict="FALSE",pending=True)]})
        send({"type":"UPDATE_VERDICTS","results":[dict(common,claim="Claim B revised",_fastClaim="Claim B",verdict="TRUE",pending=False,
                                                        sources=["https://example.org/source"])]})
        assert video.locator(".rtfc-verdict--pending").count() == 1
        assert video.locator(".rtfc-verdict").count() == 2
        assert video.locator("#rtfc-panel script").count() == 0
        send({"type":"UPDATE_VERDICTS","results":[dict(common,claim="Claim A",_fastClaim="Claim A",verdict="UNVERIFIABLE",pending=False,verificationFailed=True)]})
        assert video.locator(".rtfc-verdict--pending").count() == 0
        with video.expect_download() as download:
            video.locator("#rtfc-export").click()
        report = Path(profile) / "report.html"
        download.value.save_as(report)
        text = report.read_text()
        assert "gpt-6-luna" in text and "https://example.org/source" in text
        assert "<script>" not in text
        send({"type":"STOP_FACTCHECK"})
        assert video.locator("#rtfc-panel").count() == 0
        assert not errors, errors
        context.close()
        print("Chromium UI smoke OK (mock extension APIs/bridge): popup readiness, Luna default, overlay, independent updates, HTML escaping and report export.")
finally:
    server.shutdown()
    server.server_close()
