"""Minimal Marionette (protocol 3) client — enough to install a temporary add-on,
navigate, run scripts, and take screenshots in a headless Firefox. No deps."""
import json
import socket
import subprocess
import tempfile
import time
import os


class Marionette:
    def __init__(self, host="127.0.0.1", port=2828):
        self.host, self.port = host, port
        self.sock = None
        self.msg_id = 0

    def connect(self, timeout=60):
        deadline = time.time() + timeout
        while True:
            try:
                self.sock = socket.create_connection((self.host, self.port), timeout=30)
                break
            except OSError:
                if time.time() > deadline:
                    raise
                time.sleep(0.5)
        self.sock.settimeout(120)
        hello = self._recv()
        assert hello.get("marionetteProtocol") == 3, hello
        return hello

    def _send(self, obj):
        data = json.dumps(obj).encode("utf-8")
        self.sock.sendall(str(len(data)).encode() + b":" + data)

    def _recv(self):
        buf = b""
        while b":" not in buf:
            chunk = self.sock.recv(1)
            if not chunk:
                raise ConnectionError("socket closed")
            buf += chunk
        length = int(buf.split(b":")[0])
        body = b""
        while len(body) < length:
            chunk = self.sock.recv(length - len(body))
            if not chunk:
                raise ConnectionError("socket closed")
            body += chunk
        return json.loads(body.decode("utf-8"))

    def cmd(self, name, params=None):
        self.msg_id += 1
        self._send([0, self.msg_id, name, params or {}])
        while True:
            msg = self._recv()
            if isinstance(msg, list) and msg[0] == 1 and msg[1] == self.msg_id:
                _, _, err, result = msg
                if err:
                    raise RuntimeError(f"{name}: {err}")
                return result

    def new_session(self):
        return self.cmd("WebDriver:NewSession", {"capabilities": {"alwaysMatch": {"acceptInsecureCerts": True}}})

    def install_addon(self, path, temporary=True):
        return self.cmd("Addon:Install", {"path": path, "temporary": temporary})

    def navigate(self, url):
        return self.cmd("WebDriver:Navigate", {"url": url})

    def execute(self, script, args=None):
        return self.cmd("WebDriver:ExecuteScript", {"script": script, "args": args or []})["value"]

    def screenshot_png(self):
        import base64
        return base64.b64decode(self.cmd("WebDriver:TakeScreenshot", {"full": False})["value"])

    def quit(self):
        try:
            self.cmd("Marionette:Quit", {"flags": ["eForceQuit"]})
        except Exception:
            pass


def launch_firefox(binary="firefox-esr", port=2828, profile_dir=None, extra_prefs=None):
    profile_dir = profile_dir or tempfile.mkdtemp(prefix="gvtest-profile-")
    prefs = {
        "marionette.port": port,
        "browser.shell.checkDefaultBrowser": False,
        "datareporting.policy.dataSubmissionEnabled": False,
        "toolkit.telemetry.reportingpolicy.firstRun": False,
        "browser.startup.homepage_override.mstone": "ignore",
        "browser.startup.page": 0,
        "extensions.autoDisableScopes": 0,
        "xpinstall.signatures.required": False,
        "remote.log.level": "Info",
    }
    prefs.update(extra_prefs or {})
    with open(os.path.join(profile_dir, "user.js"), "w") as f:
        for k, v in prefs.items():
            f.write(f'user_pref({json.dumps(k)}, {json.dumps(v)});\n')
    env = dict(os.environ, MOZ_HEADLESS="1", MOZ_DISABLE_CONTENT_SANDBOX="1")
    proc = subprocess.Popen(
        [binary, "-headless", "-marionette", "-no-remote", "-profile", profile_dir, "about:blank"],
        env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    return proc, profile_dir
