# modules/recon/wayback_timeline.py
"""
Wayback Machine Timeline — first seen, last seen, snapshot count per subdomain
"""
import asyncio
import httpx
from typing import Dict, List
from collections import defaultdict

async def get_timeline(domain: str) -> Dict:
    """Get full Wayback timeline for a domain."""
    url = (
        f"http://web.archive.org/cdx/search/cdx"
        f"?url=*.{domain}/*&output=json&fl=original,timestamp&collapse=urlkey&limit=50000"
    )
    timeline = {}
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(url)
            data = resp.json()
            if len(data) < 2:
                return {"domain": domain, "subdomains": {}, "total_snapshots": 0}

            from urllib.parse import urlparse
            subdomain_data: Dict[str, list] = defaultdict(list)

            for row in data[1:]:
                original, timestamp = row[0], row[1]
                try:
                    host = urlparse(original).hostname or ""
                    if host and (host.endswith("." + domain) or host == domain):
                        year = int(timestamp[:4])
                        subdomain_data[host].append(year)
                except Exception:
                    pass

            for sub, years in subdomain_data.items():
                timeline[sub] = {
                    "first_seen": min(years),
                    "last_seen":  max(years),
                    "snapshot_count": len(years),
                    "years_active": sorted(set(years)),
                }

    except Exception as e:
        return {"domain": domain, "subdomains": {}, "error": str(e), "total_snapshots": 0}

    return {
        "domain": domain,
        "subdomains": timeline,
        "total_snapshots": sum(v["snapshot_count"] for v in timeline.values()),
    }

async def get_subdomain_snapshots(subdomain: str, limit: int = 10) -> Dict:
    """Get recent snapshots for a specific subdomain."""
    url = (
        f"http://web.archive.org/cdx/search/cdx"
        f"?url={subdomain}/*&output=json&fl=timestamp,original,statuscode&limit={limit}&output=json"
    )
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(url)
            data = resp.json()
            snapshots = []
            for row in data[1:]:
                ts = row[0]
                formatted = f"{ts[:4]}-{ts[4:6]}-{ts[6:8]} {ts[8:10]}:{ts[10:12]}"
                snapshots.append({
                    "timestamp": formatted,
                    "url":       row[1],
                    "status":    row[2] if len(row) > 2 else "—",
                    "wayback_url": f"https://web.archive.org/web/{ts}/{row[1]}"
                })
        return {"subdomain": subdomain, "snapshots": snapshots}
    except Exception as e:
        return {"subdomain": subdomain, "snapshots": [], "error": str(e)}