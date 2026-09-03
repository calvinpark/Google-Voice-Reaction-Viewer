"""Headless Firefox integration test.

Builds two temporary add-ons from the working tree:
  1. the real extension (manifest as shipped) — installed to prove the manifest loads;
  2. a test copy whose content script also matches http://127.0.0.1/* — exercised
     against test/fixtures/thread.html, a synthetic thread with the live DOM structure.
Requires firefox-esr (or set FIREFOX_BIN). Run:  python3 test/firefox_test.py
"""
import http.server
import json
import os
import shutil
import socketserver
import subprocess
import sys
import tempfile
import threading
import time
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from marionette_min import Marionette, launch_firefox  # noqa: E402

PORT = 80  # Firefox match patterns ignore ports (bug 1362809), so serve on 80 (needs root) and match http://127.0.0.1/*
FIREFOX = os.environ.get("FIREFOX_BIN", "firefox-esr")


def build_xpi(dest, manifest_mutator=None):
    with open(os.path.join(ROOT, "manifest.json"), encoding="utf-8") as f:
        manifest = json.load(f)
    if manifest_mutator:
        manifest_mutator(manifest)
    with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
        for name in ("content.js", "styles.css"):
            z.write(os.path.join(ROOT, name), name)
        for icon in ("icon-48.png", "icon-96.png", "icon-128.png"):
            p = os.path.join(ROOT, "icons", icon)
            if os.path.exists(p):
                z.write(p, "icons/" + icon)
    return dest


def test_manifest(m):
    m["name"] += " (test build)"
    m["browser_specific_settings"]["gecko"]["id"] = "{90091e07-01ce-012e-ac71-017071e77e13}"
    m["content_scripts"][0]["matches"].append("http://127.0.0.1/*")


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def serve(directory):
    handler = lambda *a, **k: Quiet(*a, directory=directory, **k)  # noqa: E731
    srv = socketserver.TCPServer(("127.0.0.1", PORT), handler)
    srv.allow_reuse_address = True
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    return srv


STATE_SCRIPT = r"""
const rows = [...document.querySelectorAll('gv-thread-details gv-message-list ul.list > li')];
return rows.map((li, i) => {
  const row = li.querySelector('div.message-row');
  return {
    i,
    text: (li.querySelector('gv-annotation.content').textContent || '').trim().slice(0, 40),
    role: li.getAttribute('data-gv-tapback-role'),
    state: li.getAttribute('data-gv-tapback-state'),
    dimmed: row.hasAttribute('data-gv-tapback-dimmed'),
    linked: row.hasAttribute('data-gv-tapback-linked'),
    badges: [...li.querySelectorAll('.gv-tapback-badge')].map(b => b.textContent),
    opacity: getComputedStyle(row).opacity,
    cursor: getComputedStyle(row).cursor,
  };
});
"""

APPEND_ROW_SCRIPT = r"""
const ul = document.querySelector('gv-thread-details gv-message-list ul.list');
const tmpl = ul.children[0].cloneNode(true);
for (const el of [tmpl, ...tmpl.querySelectorAll('*')]) for (const a of [...el.attributes]) if (a.name.startsWith('data-gv-tapback')) el.removeAttribute(a.name);
tmpl.querySelectorAll('[data-gv-tapback-ext]').forEach(n => n.remove());
tmpl.querySelector('gv-annotation.content').textContent = 'Emphasized “See you there”';
tmpl.querySelector('.cdk-visually-hidden').textContent = 'Message from Alex Example, Emphasized “See you there”, Saturday, August 22 2026, 10:05 AM.';
ul.appendChild(tmpl);
return ul.children.length;
"""


def expect(cond, msg):
    print(("PASS " if cond else "FAIL ") + msg)
    return cond


def main():
    subprocess.check_call([sys.executable, os.path.join(HERE, "make_fixture.py")])
    tmp = tempfile.mkdtemp(prefix="gv-ext-test-")
    real_xpi = build_xpi(os.path.join(tmp, "real.xpi"))
    test_xpi = build_xpi(os.path.join(tmp, "test.xpi"), test_manifest)
    srv = serve(os.path.join(HERE, "fixtures"))
    proc, profile = launch_firefox(FIREFOX)
    ok = True
    try:
        m = Marionette()
        hello = m.connect()
        m.new_session()
        version = m.execute("return navigator.userAgent")
        print("firefox:", version)
        real_id = m.install_addon(real_xpi, temporary=True).get("value")
        ok &= expect(real_id == "{90091e07-01ce-012e-ac71-017071e77e12}", f"real manifest installs as temporary add-on (id={real_id})")
        test_id = m.install_addon(test_xpi, temporary=True).get("value")
        ok &= expect(test_id == "{90091e07-01ce-012e-ac71-017071e77e13}", f"test build installs (id={test_id})")

        m.navigate(f"http://127.0.0.1:{PORT}/thread.html" if PORT != 80 else "http://127.0.0.1/thread.html")
        time.sleep(1.5)
        st = m.execute(STATE_SCRIPT)
        by = {r["i"]: r for r in st}
        ok &= expect(by[2]["state"] == "matched" and by[2]["dimmed"] and by[2]["linked"], "row 2 Loved (image emoji in quote): matched, dimmed, linked (state=%s)" % by[2]["state"])
        ok &= expect(by[1]["badges"] == [], f"row 1 heart removed by row 6 -> no badge (badges={by[1]['badges']})")
        ok &= expect(by[3]["badges"] == ["😂"], f"row 3 gets 😂 from image-emoji Reacted row (badges={by[3]['badges']})")
        ok &= expect(by[4]["state"] == "matched" and by[4]["dimmed"] and by[4]["linked"], "row 4 Reacted: matched, dimmed, linked")
        ok &= expect(by[6]["state"] == "removed" and by[6]["linked"], "row 6 removal: state removed, linked")
        ok &= expect(by[7]["state"] == "attachment" and by[7]["dimmed"] and not by[7]["linked"], "row 7 attachment: dimmed, not linked")
        ok &= expect(by[8]["state"] == "unmatched" and by[8]["dimmed"] and not by[8]["linked"], "row 8 unmatched: dimmed, not linked")
        ok &= expect(float(by[4]["opacity"]) < 0.6, f"dimmed row opacity from styles.css ({by[4]['opacity']})")
        ok &= expect(by[4]["cursor"] == "pointer", f"linked row cursor pointer ({by[4]['cursor']})")
        ok &= expect(by[0]["role"] is None and by[0]["badges"] == [], "ordinary row untouched")

        n = m.execute(APPEND_ROW_SCRIPT)
        time.sleep(0.8)
        st2 = m.execute(STATE_SCRIPT)
        by2 = {r["i"]: r for r in st2}
        ok &= expect(by2[5]["badges"] == ["‼️"], f"observer: appended Emphasized row badges row 5 (badges={by2[5]['badges']}, rows={n})")
        ok &= expect(by2[n - 1]["state"] == "matched", "appended row marked matched")

        png = m.screenshot_png()
        out = os.path.join(HERE, "fixtures", "firefox-screenshot.png")
        with open(out, "wb") as f:
            f.write(png)
        print("screenshot:", out, len(png), "bytes")
    finally:
        try:
            m.quit()
        except Exception:
            pass
        time.sleep(0.5)
        if proc.poll() is None:
            proc.kill()
        srv.shutdown()
        shutil.rmtree(profile, ignore_errors=True)
        shutil.rmtree(tmp, ignore_errors=True)
    print("RESULT:", "ALL PASS" if ok else "FAILURES")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
