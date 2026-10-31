"""
What phones see: the alert's network name, the alert page, and the DNS that
makes the page pop up when a phone joins.

1. The network name is the alert, e.g. "!FLOOD DRILL INDORE pw 12345678". It
   shows in the Wi-Fi list of every phone nearby, Android or iPhone, with
   nothing installed.
2. Joining it opens the full alert. Every web request on the hotspot gets the
   alert page, and while the hotspot carries the alert name a small DNS server
   answers every name with this laptop's address. So the phone's own "Sign in
   to network" check lands on the page and pops it up, as café Wi-Fi does. No
   internet needed.

Windows' Mobile Hotspot always uses WPA2, so the password goes in the network
name. The hotspot's own address on Windows is 192.168.137.1.
"""

from __future__ import annotations

import html
import logging
import socket
import struct
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Callable

log = logging.getLogger("wifi-alert")

HOTSPOT_IP = "192.168.137.1"
PASSWORD = "12345678"
SSID_MAX = 32  # bytes

LEVEL = {"red": ("RED", "#C1121F", "अति उच्च बाढ़ जोखिम"), "orange": ("ORANGE", "#E4701E", "उच्च बाढ़ जोखिम")}


def is_drill(w: dict) -> bool:
    return "drill" in w["id"]


def ssid(warnings: list[dict], place: str, password: str = PASSWORD) -> str:
    """
    A network name that is itself the alert, at most 32 bytes:
    "!RED FLOOD BILASPUR pw 12345678". It names the worst warning, else says
    there is none.
    """
    if warnings:
        w = warnings[0]
        name = w["n"].replace(" (DRILL)", "").upper()
        head = f"!FLOOD DRILL {name}" if is_drill(w) else f"!{w['t'].upper()} FLOOD {name}"
    else:
        head = f"IRIS NO ALERT {place.upper()}"
    # Tighten the password part before cutting the place name.
    for tail in (f" pw {password}", f" pw{password}"):
        if len((head + tail).encode()) <= SSID_MAX:
            return head + tail
    room = SSID_MAX - len(tail.encode())
    while len(head.encode()) > room:
        head = head[:-1]
    return head.rstrip() + tail


PAGE = """<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Iris flood alert</title>
<style>
body{{margin:0;font:16px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#14123A;
background:linear-gradient(160deg,#BCDDF1,#A9D0EA,#94C3E3);min-height:100vh}}
main{{max-width:560px;margin:0 auto;padding:18px 16px 40px}}
.brand{{font-weight:800;letter-spacing:.12em;font-size:13px;color:#33485C}}
.drill{{background:#14123A;color:#fff;border-radius:12px;padding:10px 14px;font-weight:700;margin:12px 0}}
.card{{background:#fff;border-radius:20px;padding:18px;margin-top:14px;box-shadow:0 4px 18px #0b1f3a1a}}
.lvl{{display:inline-block;color:#fff;font-weight:800;border-radius:999px;padding:4px 12px;font-size:13px;letter-spacing:.06em}}
h1{{font-size:26px;line-height:1.15;margin:10px 0 4px}}
.where{{color:#55607a;font-size:14px}}
.do{{font-size:18px;font-weight:700;margin:14px 0 4px}}
.hi{{color:#33315C}}
.none{{font-size:18px}}
.sos a{{display:block;background:#fff;border-radius:14px;padding:12px 14px;margin-top:8px;color:#14123A;text-decoration:none;font-weight:700}}
small{{color:#55607a}}
</style></head><body><main>
<div class="brand">IRIS · FLOOD ALERT · बाढ़ चेतावनी</div>
{body}
<div class="sos"><div class="card" style="padding:12px 14px 14px"><b>Emergency · आपातकाल</b>
<a href="tel:112">📞 112 · National emergency</a><a href="tel:1078">📞 1078 · NDMA disaster helpline</a>
<a href="tel:1070">📞 1070 · State emergency centre</a><a href="tel:1077">📞 1077 · District emergency centre</a></div></div>
<p><small>Sent by an Iris Wi-Fi alert point near {near}, without internet. Iris is a research prototype, not an official
Government of India service: follow IMD, CWC and your district administration.</small></p>
</main></body></html>"""


def alert_page(warnings: list[dict], near: str) -> bytes:
    if not warnings:
        body = f'<div class="card none">No Red or Orange flood warning near {html.escape(near)} right now.<br><span class="hi">अभी {html.escape(near)} के पास कोई लाल या नारंगी बाढ़ चेतावनी नहीं है।</span></div>'
    else:
        cards = []
        if any(is_drill(w) for w in warnings):
            cards.append('<div class="drill">DRILL · TEST MESSAGE. This is not a real warning.<br>अभ्यास · परीक्षण संदेश। यह असली चेतावनी नहीं है।</div>')
        for w in warnings:
            label, colour, hi = LEVEL[w["t"]]
            where = ", ".join(x for x in (w.get("d"), w.get("st")) if x)
            cards.append(
                f'<div class="card"><span class="lvl" style="background:{colour}">{label} · {hi}</span>'
                f'<h1>{html.escape(w["n"])}</h1><div class="where">{html.escape(where)}</div>'
                f'<p>{html.escape(w["h"])}<br><span class="hi">{html.escape(w["hh"])}</span></p>'
                f'<div class="do">{html.escape(w["do"])}</div><div class="hi">{html.escape(w["dh"])}</div>'
                f'<p><small>Valid until {time.strftime("%d %b %H:%M", time.localtime(w["exp"]))}</small></p></div>'
            )
        body = "".join(cards)
    return PAGE.format(body=body, near=html.escape(near)).encode()


# Phones' "is there internet?" checks. Answering them with anything but the
# expected reply makes the phone show its sign-in page: ours.
PROBES = ("/generate_204", "/gen_204", "/hotspot-detect.html", "/library/test/success.html", "/connecttest.txt", "/ncsi.txt", "/success.txt", "/canonical.html")


def start_web(get: Callable[[], tuple[list[dict], str]], port: int) -> bool:
    """The alert page on every interface, for any path and any host name."""

    class H(BaseHTTPRequestHandler):
        def do_GET(self, head: bool = False):
            path = self.path.split("?")[0]
            host = (self.headers.get("Host") or "").split(":")[0]
            if path in PROBES or (host and host not in (HOTSPOT_IP, "localhost", "127.0.0.1")):
                # Send the phone to the page under the hotspot's own address.
                self.send_response(302)
                self.send_header("Location", f"http://{HOTSPOT_IP}/" if host != "localhost" else "/")
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            warnings, near = get()
            body = alert_page(warnings, near)
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            if not head:
                self.wfile.write(body)

        def do_HEAD(self):
            self.do_GET(head=True)

        # Some phones POST to the sign-in page; show them the same alert.
        do_POST = do_GET

        def log_message(self, *a):
            pass

    class Server(ThreadingHTTPServer):
        daemon_threads = True

        def handle_error(self, request, client_address):
            # A phone closing the page mid-load is normal, not an error.
            log.debug("alert page: connection from %s dropped", client_address)

    try:
        srv = Server(("0.0.0.0", port), H)
    except OSError as e:
        log.warning("alert page: could not open port %d (%s)", port, e)
        return False
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    log.info("alert page for phones without the app: port %d (http://%s/ on the hotspot)", port, HOTSPOT_IP)
    return True


def _answer(query: bytes, ip: str) -> bytes | None:
    """A DNS reply giving `ip` for an A question; None if it is not a plain query."""
    if len(query) < 12:
        return None
    tid, flags, qd = struct.unpack(">HHH", query[:6])
    if flags & 0x8000 or qd != 1:
        return None
    i = 12
    while i < len(query) and query[i]:
        i += query[i] + 1
    if i + 5 > len(query):
        return None
    qtype = struct.unpack(">H", query[i + 1 : i + 3])[0]
    question = query[12 : i + 5]
    header = struct.pack(">HHHHHH", tid, 0x8180, 1, 1 if qtype == 1 else 0, 0, 0)
    if qtype != 1:  # AAAA and others: no answer, so phones fall back to IPv4
        return header + question
    return header + question + b"\xc0\x0c" + struct.pack(">HHIH", 1, 1, 30, 4) + socket.inet_aton(ip)


def dns_reply(query: bytes, ip: str = HOTSPOT_IP) -> bytes | None:
    try:
        return _answer(query, ip)
    except (struct.error, IndexError):
        return None


def hotspot_name() -> str | None:
    """The Mobile Hotspot's current network name if it is on, else None. Reads only."""
    try:
        from winrt.windows.networking.connectivity import NetworkInformation
        from winrt.windows.networking.networkoperators import NetworkOperatorTetheringManager, TetheringOperationalState

        profile = NetworkInformation.get_internet_connection_profile()
        if profile is None:
            return None
        m = NetworkOperatorTetheringManager.create_from_connection_profile(profile)
        if m.tethering_operational_state != TetheringOperationalState.ON:
            return None
        return m.get_current_access_point_configuration().ssid
    except Exception:
        return None


def start_dns(state: dict, wanted_name: Callable[[], str]) -> None:
    """
    Answers every DNS name with the hotspot address, on the hotspot address
    only, and only while the hotspot is on AND named as the alert. A hotspot
    you use for your own devices keeps its normal internet. Checks every 2 s,
    so it is up before a phone's first "is there internet?" check. state["dns"]
    says how it stands.
    """

    def ours() -> bool:
        return hotspot_name() == wanted_name()

    def run():
        while True:
            try:
                serve_once()
            except Exception as e:  # never let the thread die: log, wait, retry
                log.warning("captive DNS: %s; retrying", e)
                state["dns"] = "restarting"
                time.sleep(2)

    def serve_once():
        state["dns"] = "waiting for the alert hotspot"
        while True:
            if not ours():
                state["dns"] = "waiting for the alert hotspot"
                time.sleep(2)
                continue
            try:
                s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
                s.bind((HOTSPOT_IP, 53))
            except OSError as e:
                # 10049: no such address yet (hotspot off). 10048: port taken (Windows' own DNS proxy).
                state["dns"] = "port 53 in use: phones may need to open the page themselves" if getattr(e, "winerror", 0) == 10048 else "waiting for the alert hotspot"
                time.sleep(2)
                continue
            state["dns"] = "answering: the alert page opens by itself"
            log.info("captive DNS on %s:53", HOTSPOT_IP)
            s.settimeout(2)
            while True:
                try:
                    q, addr = s.recvfrom(512)
                except socket.timeout:
                    if ours():
                        continue
                    break  # hotspot renamed or off
                except ConnectionResetError:
                    # Windows reports an earlier reply that bounced as an error on
                    # the next read; the socket is fine.
                    continue
                except OSError:
                    break  # hotspot went down
                r = dns_reply(q)
                if r:
                    try:
                        s.sendto(r, addr)
                    except ConnectionResetError:
                        pass
                    except OSError:
                        break
            s.close()
            log.info("captive DNS off")
            state["dns"] = "waiting for the alert hotspot"

    threading.Thread(target=run, daemon=True).start()
