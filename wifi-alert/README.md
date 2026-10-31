# Iris Wi-Fi alert

Broadcasts a flood alert from this Windows laptop to nearby phones that have
**no app installed**, Android or iPhone.

- **Everyone nearby sees the alert's network name** in their Wi-Fi list, e.g.
  `!FLOOD DRILL INDORE pw 12345678`.
- **Anyone who joins gets the full alert popping up** (the phone's "Sign in to
  network" page): level, place, what to do in English and Hindi, and
  tap-to-call emergency numbers. No internet is needed.

## Run

```powershell
cd wifi-alert
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python wifi_alert.py
```

Then press **Broadcast alert**, either on http://localhost:8091 or on the
website's **Notifications** page (the Wi-Fi alert broadcast card). Press **Stop
broadcast**, or Ctrl+C, to put your hotspot back exactly as it was.

The website's button talks to this program on the same laptop, because only
that laptop can switch its hotspot. The page sends nothing to it until the
button is pressed. Chrome may ask once to let the site reach devices on your
local network: allow it.

### Start it automatically at login

So the website's button always works, without starting anything by hand:

```powershell
powershell -ExecutionPolicy Bypass -File install-startup.ps1
```

This adds a shortcut to your Windows Startup folder (your account only) and
starts it now. It runs hidden, with no window: it only waits at
http://localhost:8091 and touches the hotspot when Broadcast is pressed. It
logs to `wifi_alert.log` in this folder. `start-hidden.vbs` is what the
shortcut runs; double-click it to start it by hand. Undo with
`uninstall-startup.ps1`.

If you sign out while broadcasting, Windows ends it before it can restore the
hotspot name: press Stop first.

| Option | Default | Meaning |
|---|---|---|
| `--place` | `indore` | Location id |
| `--mode` | `drill` | `drill`: a test message, clearly marked. `live`: the real Red and Orange warnings near the place, from the backend's public CAP feed (`/api/cap/feed.atom`) |
| `--radius` | `150` | `live`: warnings within this many km |
| `--api` | `http://localhost:8000` | Iris backend, e.g. `https://ai-manthan.onrender.com` |
| `--password` | `12345678` | Hotspot password, shown in the network name |
| `--allow-origin` | | Another website allowed to press the button, e.g. `https://my-iris.vercel.app`. Allowed already: `https://ai-manthan-wheat.vercel.app` and the local dev site |

## How it works

| File | Does |
|---|---|
| `wifi_alert.py` | Broadcast / Stop, the button page at :8091, and `POST /api/broadcast`, `/api/stop`, `GET /api/status` for the website |
| `hotspot.py` | Renames and starts the Windows Mobile Hotspot; restores it |
| `start-hidden.vbs`, `install-startup.ps1`, `uninstall-startup.ps1` | Run it hidden at every login, or stop doing so |
| `portal.py` | The alert network name, the phone alert page (port 80), and the pop-up DNS |

When a phone joins, it checks for internet. The pop-up DNS answers every name
with this laptop's address (`192.168.137.1`), so that check lands on the alert
page and the phone shows it. The DNS runs only while the hotspot carries the
alert name, so your normal hotspot keeps normal internet.

Only the listed websites can press the button: the program checks each
request's origin, so another site you visit cannot start or stop the
broadcast. Place names come from `../backend/app/data/locations.json`.

## Limits

- Phones must join to see the full alert; the network name alone reaches everyone nearby.
- Windows' hotspot always needs a password, so it is in the network name.
- Broadcasting renames your hotspot, which disconnects devices already on it.
- Range: about 30–50 m.
- Wi-Fi names are capped at 32 bytes, so very long place names are shortened in the name (the page shows them in full).
