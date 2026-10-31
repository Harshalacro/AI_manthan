"""
Switches this laptop's Windows Mobile Hotspot to the alert and back.

start() saves the current hotspot name, password and on/off state, then names
the hotspot after the alert and turns it on. stop() puts back exactly what was
there before. Renaming restarts the hotspot, which disconnects any device on it.

Windows needs a network connection to share (Wi-Fi or Ethernet). It does not
have to reach the internet.
"""

from __future__ import annotations

from dataclasses import dataclass

from winrt.windows.networking.connectivity import NetworkInformation
from winrt.windows.networking.networkoperators import (
    NetworkOperatorTetheringAccessPointConfiguration,
    NetworkOperatorTetheringManager,
    TetheringCapability,
    TetheringOperationalState,
)


class HotspotError(Exception):
    pass


@dataclass
class Saved:
    ssid: str
    passphrase: str
    was_on: bool


def manager() -> NetworkOperatorTetheringManager:
    profile = NetworkInformation.get_internet_connection_profile()
    if profile is None:
        profiles = [p for p in NetworkInformation.get_connection_profiles() if p.get_network_connectivity_level() > 0]
        profile = profiles[0] if profiles else None
    if profile is None:
        raise HotspotError("No network connection to share. Connect Wi-Fi or Ethernet (internet not required).")
    cap = NetworkOperatorTetheringManager.get_tethering_capability_from_connection_profile(profile)
    if cap != TetheringCapability.ENABLED:
        raise HotspotError(f"Mobile Hotspot is not available on '{profile.profile_name}' (capability {cap}).")
    return NetworkOperatorTetheringManager.create_from_connection_profile(profile)


def status() -> dict:
    """Current hotspot name, whether it is on, and how many devices are on it. Reads only."""
    try:
        m = manager()
        on = m.tethering_operational_state == TetheringOperationalState.ON
        return {"ssid": m.get_current_access_point_configuration().ssid, "on": on, "clients": m.client_count if on else 0}
    except Exception as e:
        return {"ssid": None, "on": False, "clients": 0, "error": str(e)}


async def _configure(m: NetworkOperatorTetheringManager, ssid: str, passphrase: str, turn_on: bool) -> None:
    cfg = NetworkOperatorTetheringAccessPointConfiguration()
    cfg.ssid = ssid
    cfg.passphrase = passphrase
    if m.tethering_operational_state == TetheringOperationalState.ON:
        await m.stop_tethering_async()
    await m.configure_access_point_async(cfg)
    if turn_on:
        res = await m.start_tethering_async()
        if res.status != 0:
            raise HotspotError(
                f"Windows could not start the hotspot (status {res.status}). {res.additional_error_message or ''}".strip()
                + " Check that Wi-Fi is on and Settings > Network > Mobile hotspot works by hand."
            )


async def start(ssid: str, passphrase: str) -> Saved:
    """Names the hotspot `ssid` and turns it on. Returns what to restore later."""
    if len(ssid.encode()) > 32:
        raise HotspotError("The network name must be at most 32 bytes.")
    if not 8 <= len(passphrase) <= 63:
        raise HotspotError("The password must be 8-63 characters.")
    m = manager()
    old = m.get_current_access_point_configuration()
    saved = Saved(old.ssid, old.passphrase, m.tethering_operational_state == TetheringOperationalState.ON)
    try:
        await _configure(m, ssid, passphrase, turn_on=True)
    except Exception:
        await stop(saved)  # never leave the hotspot half-changed
        raise
    return saved


async def stop(saved: Saved) -> None:
    """Puts back the name, password and on/off state from before start()."""
    await _configure(manager(), saved.ssid, saved.passphrase, turn_on=saved.was_on)
