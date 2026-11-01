"""
Where this laptop is, so a broadcast carries the warnings for the area it is
in. Uses Windows location (Wi-Fi based, no GPS needed). It needs Location on
in Windows Settings -> Privacy & security -> Location, with "Let desktop apps
access your location" on.
"""

from __future__ import annotations

import asyncio
import logging
import math

log = logging.getLogger("wifi-alert")


def km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p = math.radians
    s = math.sin(p(lat2 - lat1) / 2) ** 2 + math.cos(p(lat1)) * math.cos(p(lat2)) * math.sin(p(lon2 - lon1) / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(s))


async def locate(timeout: float = 20) -> dict | None:
    """{"lat", "lon", "accuracy_m"} from Windows location, or None if it is off or unavailable."""
    try:
        from winrt.windows.devices.geolocation import GeolocationAccessStatus, Geolocator
    except ImportError:
        log.warning("location: winrt-Windows.Devices.Geolocation is not installed (pip install -r requirements.txt)")
        return None
    try:
        if await Geolocator.request_access_async() != GeolocationAccessStatus.ALLOWED:
            log.warning("location: Windows denied access (Settings -> Privacy & security -> Location)")
            return None
        pos = await asyncio.wait_for(Geolocator().get_geoposition_async(), timeout)
    except Exception as e:  # off, timed out, no Wi-Fi to locate from
        log.warning("location: unavailable (%s)", e)
        return None
    c = pos.coordinate
    return {"lat": c.point.position.latitude, "lon": c.point.position.longitude, "accuracy_m": c.accuracy}


def nearest(places: dict[str, dict], lat: float, lon: float) -> tuple[dict | None, float]:
    """The monitored place closest to (lat, lon), and its distance in km."""
    best, best_km = None, math.inf
    for p in places.values():
        if "lat" in p and "lon" in p:
            d = km(lat, lon, p["lat"], p["lon"])
            if d < best_km:
                best, best_km = p, d
    return best, best_km
