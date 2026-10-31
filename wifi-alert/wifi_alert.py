"""
Iris Wi-Fi alert: broadcasts a flood alert from this laptop to nearby phones
with no app installed, Android or iPhone.

One button, at http://localhost:8091 or on the website's Notifications page:

    Broadcast  names the laptop's Mobile Hotspot after the alert
               ("!FLOOD DRILL INDORE pw 12345678"), so every phone nearby sees
               it in its Wi-Fi list; a phone that joins gets the full alert
               page popping up (portal.py).
    Stop       puts the hotspot back exactly as it was.

    python wifi_alert.py                       # DRILL message for Indore (testing)
    python wifi_alert.py --place gwalior --mode live --api https://ai-manthan.onrender.com

--mode drill (default) sends a clearly marked test message for the place.
--mode live sends the real Red and Orange warnings near it, read from the Iris
backend's public CAP feed; with none, there is nothing to broadcast.

The website's button calls this program on this laptop (the hotspot can only
be switched here). Only the sites in ALLOWED_ORIGINS and --allow-origin may
press it, so no other website you visit can.

Broadcasting renames your hotspot, which disconnects devices already on it.
Ctrl+C also restores the hotspot.
"""

from __future__ import annotations

import argparse
import asyncio
import html
import json
import logging
import math
import threading
import time
import urllib.request
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from xml.etree import ElementTree as ET

import hotspot
import portal

log = logging.getLogger("wifi-alert")

# Sites whose button may start and stop the broadcast. Add more with --allow-origin.
ALLOWED_ORIGINS = {
    "https://ai-manthan-wheat.vercel.app",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
}
LOCATIONS = Path(__file__).resolve().parent.parent / "backend" / "app" / "data" / "locations.json"
CAP = "{urn:oasis:names:tc:emergency:cap:1.2}"
ATOM = "{http://www.w3.org/2005/Atom}"


def load_places() -> dict[str, dict]:
    """The monitored places, from the repo's own list; empty if it is not beside this folder."""
    try:
        return {p["id"]: p for p in json.loads(LOCATIONS.read_text(encoding="utf-8"))["locations"]}
    except (OSError, ValueError, KeyError):
        return {}


def km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p = math.radians
    s = math.sin(p(lat2 - lat1) / 2) ** 2 + math.cos(p(lat1)) * math.cos(p(lat2)) * math.sin(p(lon2 - lon1) / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(s))


def _get(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=60) as r:
        return r.read()


def cap_warnings(api: str, places: dict[str, dict], near: dict | None, radius_km: float) -> list[dict]:
    """Red and Orange warnings from the backend's CAP 1.2 feed, near `near` if given, Red first."""
    feed = ET.fromstring(_get(f"{api}/api/cap/feed.atom"))
    out = []
    for entry in feed.iter(f"{ATOM}entry"):
        link = next((l.get("href") for l in entry.iter(f"{ATOM}link") if (l.get("href") or "").endswith(".xml")), None)
        if not link:
            continue
        alert = ET.fromstring(_get(f"{api}/api/cap/alerts/{link.rsplit('/', 1)[-1]}"))
        infos = {i.findtext(f"{CAP}language"): i for i in alert.iter(f"{CAP}info")}
        en, hi = infos.get("en-IN"), infos.get("hi-IN") or infos.get("en-IN")
        if en is None or "AllClear" in [r.text for r in en.iter(f"{CAP}responseType")]:
            continue
        colour = (en.findtext(f"{CAP}eventCode/{CAP}value") or "").lower()
        if colour not in ("red", "orange"):
            continue
        circle = (en.findtext(f"{CAP}area/{CAP}circle") or "").replace(",", " ").split()
        lat, lon = (float(circle[0]), float(circle[1])) if len(circle) >= 2 else (None, None)
        if near and lat is not None and km(near["lat"], near["lon"], lat, lon) > radius_km:
            continue
        loc_id = next((g.findtext(f"{CAP}value") for g in en.iter(f"{CAP}geocode")), None) or link.rsplit("/", 1)[-1][:-4]
        place = places.get(loc_id, {})
        expires = en.findtext(f"{CAP}expires")
        out.append({
            "id": alert.findtext(f"{CAP}identifier") or loc_id,
            "n": place.get("name") or loc_id.replace("_", " ").title(),
            "t": colour,
            "d": place.get("district") or "",
            "st": place.get("state") or "",
            "h": en.findtext(f"{CAP}headline") or "",
            "hh": hi.findtext(f"{CAP}headline") or "",
            "do": en.findtext(f"{CAP}instruction") or "Follow your district administration.",
            "dh": hi.findtext(f"{CAP}instruction") or "ज़िला प्रशासन के निर्देशों का पालन करें।",
            "exp": int(datetime.fromisoformat(expires).timestamp()) if expires else int(time.time()) + 3 * 3600,
        })
    out.sort(key=lambda w: w["t"] != "red")
    return out


class Station:
    def __init__(self, a: argparse.Namespace, loop: asyncio.AbstractEventLoop):
        self.a = a
        self.loop = loop
        self.lock = threading.Lock()
        self.saved: hotspot.Saved | None = None
        self.warnings: list[dict] = []
        self.places = load_places()
        self.place = self.places.get(a.place, {})
        self.place_name = self.place.get("name") or a.place.replace("_", " ").title()
        self.error: str | None = None
        self.busy = False
        self.dns = {"dns": "off"}

    @property
    def broadcasting(self) -> bool:
        return self.saved is not None

    def ssid(self) -> str:
        return portal.ssid(self.warnings, self.place_name, self.a.password)

    def _drill(self) -> list[dict]:
        now = int(time.time())
        name = self.place_name
        return [{
            "id": f"{self.a.place}:drill-{now}", "n": f"{name} (DRILL)", "t": "orange",
            "d": self.place.get("district") or "", "st": self.place.get("state") or "",
            "h": f"DRILL: test of the Iris Wi-Fi flood alert for {name}. This is not a real warning.",
            "hh": f"अभ्यास: {name} के लिए Iris वाई-फ़ाई बाढ़ चेतावनी का परीक्षण। यह असली चेतावनी नहीं है।",
            "do": "DRILL - test message only. No action needed.",
            "dh": "अभ्यास - केवल परीक्षण संदेश। कोई कार्रवाई आवश्यक नहीं।",
            "exp": now + 2 * 3600,
        }]

    def message(self) -> list[dict]:
        if self.a.mode == "drill":
            return self._drill()
        near = self.place if "lat" in self.place else None
        warnings = cap_warnings(self.a.api, self.places, near, self.a.radius)
        if not warnings:
            where = f"within {self.a.radius:g} km of {self.place_name}" if near else "anywhere"
            raise hotspot.HotspotError(f"No Red or Orange warning {where} right now: nothing to broadcast.")
        return warnings

    async def broadcast(self) -> None:
        if self.broadcasting:
            return
        warnings = await asyncio.to_thread(self.message)
        with self.lock:
            self.warnings = warnings
        ssid = self.ssid()
        self.saved = await hotspot.start(ssid, self.a.password)
        log.info("broadcasting: %s", ssid)

    async def stop(self) -> None:
        if self.saved:
            await hotspot.stop(self.saved)
            self.saved = None
            log.info("stopped; hotspot restored")

    def run(self, action: str) -> None:
        """Runs Broadcast or Stop on the main loop, one at a time."""
        if self.busy:
            return
        self.busy, self.error = True, None
        try:
            coro = self.broadcast() if action == "broadcast" else self.stop()
            asyncio.run_coroutine_threadsafe(coro, self.loop).result(timeout=90)
        except Exception as e:
            self.error = str(e)
            log.warning("%s failed: %s", action, e)
        finally:
            self.busy = False

    def state(self) -> dict:
        return {
            "broadcasting": self.broadcasting,
            "ssid": self.ssid() if self.broadcasting else None,
            "place": self.place_name,
            "mode": self.a.mode,
            "popup": self.dns["dns"],
            "error": self.error,
        }


PAGE = """<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Iris Wi-Fi alert</title><style>
body{{margin:0;min-height:100vh;display:grid;place-items:center;font:15px/1.4 system-ui,Segoe UI,sans-serif;color:#14123A;
background:linear-gradient(160deg,#BCDDF1,#A9D0EA,#94C3E3)}}
main{{text-align:center;padding:16px}}
button{{font:700 20px system-ui,Segoe UI,sans-serif;letter-spacing:.04em;color:#fff;border:0;border-radius:999px;
padding:22px 44px;cursor:pointer;background:{colour};box-shadow:0 8px 24px #0b1f3a33}}
button:disabled{{opacity:.6;cursor:wait}}
p{{margin:16px 0 0;color:#33485C;font-size:13px}} .err{{color:#C1121F}}
</style></head><body><main>
<form method="post" action="/{action}" onsubmit="this.b.disabled=true;this.b.textContent='Working…'">
<button name="b" {disabled}>{label}</button></form>
<p>{line}</p>{err}
</main></body></html>"""


def control_page(s: Station) -> bytes:
    if s.busy:
        label, action, colour = "Working…", "noop", "#33485C"
    elif s.broadcasting:
        label, action, colour = "■ Stop broadcast", "stop", "#14123A"
    else:
        label, action, colour = "Broadcast alert", "broadcast", "#C1121F"
    if s.broadcasting:
        st = hotspot.status()
        line = f"Live as <b>{html.escape(st['ssid'] or s.ssid())}</b> · {st['clients']} phone(s) joined · pop-up: {html.escape(s.dns['dns'])}"
    else:
        line = f"{'DRILL' if s.a.mode == 'drill' else 'Live warnings'} for {html.escape(s.place_name)} · renames your hotspot while on"
    return PAGE.format(
        colour=colour, action=action, label=label, disabled="disabled" if s.busy else "",
        line=line, err=f'<p class="err">{html.escape(s.error)}</p>' if s.error else "",
    ).encode()


def start_control(s: Station, port: int, allowed: set[str]) -> None:
    own = {f"http://localhost:{port}", f"http://127.0.0.1:{port}"}

    class H(BaseHTTPRequestHandler):
        def _origin_ok(self) -> bool:
            # Browsers send Origin on every cross-site POST and fetch. No Origin
            # means a script on this laptop (curl), which is fine.
            origin = self.headers.get("Origin")
            return origin is None or origin in allowed or origin in own

        def _cors(self):
            origin = self.headers.get("Origin")
            if origin and origin in allowed:
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Vary", "Origin")

        def _json(self, code: int, body: dict):
            data = json.dumps(body).encode()
            self.send_response(code)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_OPTIONS(self):
            # CORS pre-check, including Chrome's check for a public site
            # reaching a program on this laptop (Private Network Access).
            if not self._origin_ok():
                self.send_response(403)
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            self.send_response(204)
            self._cors()
            self.send_header("Access-Control-Allow-Methods", "GET, POST")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Access-Control-Allow-Private-Network", "true")
            self.send_header("Access-Control-Max-Age", "600")
            self.send_header("Content-Length", "0")
            self.end_headers()

        def do_GET(self):
            if self.path.startswith("/api/status"):
                return self._json(200, s.state())
            body = control_page(s)
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_POST(self):
            path = self.path.split("?")[0].strip("/")
            if not self._origin_ok():
                origin = self.headers.get("Origin")
                return self._json(403, {"error": f"{origin} may not start the broadcast. Run wifi_alert.py with --allow-origin {origin}"})
            action = path.removeprefix("api/")
            if action in ("broadcast", "stop"):
                s.run(action)
            if path.startswith("api/"):
                return self._json(200, s.state())
            self.send_response(303)
            self.send_header("Location", "/")
            self.send_header("Content-Length", "0")
            self.end_headers()

        def log_message(self, *a):
            pass

    srv = ThreadingHTTPServer(("127.0.0.1", port), H)  # this laptop only
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    log.info("control: http://localhost:%d (button also works from: %s)", port, ", ".join(sorted(allowed)))


async def main(a: argparse.Namespace) -> None:
    s = Station(a, asyncio.get_running_loop())

    def current():
        with s.lock:
            return list(s.warnings), s.place_name

    if not portal.start_web(current, a.web_port):
        raise SystemExit(f"Port {a.web_port} is in use. Is another alert station running?")
    # The pop-up DNS answers only while the hotspot carries this alert's name.
    portal.start_dns(s.dns, lambda: s.ssid() if s.broadcasting else "")
    start_control(s, a.port, ALLOWED_ORIGINS | set(a.allow_origin))
    try:
        while True:
            await asyncio.sleep(3600)
    finally:
        if s.broadcasting:
            log.info("restoring your hotspot...")
            await s.stop()


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Broadcast a flood alert over Wi-Fi to phones with no app.")
    ap.add_argument("--place", default="indore", help="Location id (default indore)")
    ap.add_argument("--mode", choices=("drill", "live"), default="drill", help="drill: test message (default); live: real warnings")
    ap.add_argument("--radius", type=float, default=150, help="live: warnings within this many km (default 150)")
    ap.add_argument("--api", default="http://localhost:8000", help="Iris backend (default http://localhost:8000)")
    ap.add_argument("--password", default=portal.PASSWORD, help="Hotspot password, shown in the network name (default 12345678)")
    ap.add_argument("--port", type=int, default=8091, help="Control page (default 8091)")
    ap.add_argument("--web-port", type=int, default=80, help="Alert page for phones (default 80)")
    ap.add_argument("--allow-origin", action="append", default=[], help="Another website allowed to press the button, e.g. https://my-iris.vercel.app")
    args = ap.parse_args()
    args.api = args.api.rstrip("/")
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s", datefmt="%H:%M:%S")
    try:
        asyncio.run(main(args))
    except KeyboardInterrupt:
        pass
