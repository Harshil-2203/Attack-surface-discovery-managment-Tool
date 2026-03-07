# modules/recon/whois_lookup.py
"""
WHOIS Lookup — registrar, owner, creation/expiry, nameservers
Uses python-whois (pip install python-whois).
"""
import asyncio
from typing import Dict
from datetime import datetime

def _fmt_date(d) -> str:
    if d is None: return "—"
    if isinstance(d, list): d = d[0]
    if isinstance(d, datetime): return d.strftime("%Y-%m-%d")
    return str(d)[:10]

def _whois_sync(domain: str) -> Dict:
    try:
        import whois as pywhois
        w = pywhois.whois(domain)
        return {
            "domain":      domain,
            "registrar":   w.registrar or "—",
            "created":     _fmt_date(w.creation_date),
            "expires":     _fmt_date(w.expiration_date),
            "updated":     _fmt_date(w.updated_date),
            "status":      (w.status if isinstance(w.status, list) else [w.status]) if w.status else [],
            "nameservers": [n.lower() for n in (w.name_servers or [])] if w.name_servers else [],
            "emails":      (w.emails if isinstance(w.emails, list) else [w.emails]) if w.emails else [],
            "org":         w.org or w.name or "—",
            "country":     w.country or "—",
            "raw":         str(w.text)[:2000] if hasattr(w, "text") else "",
            "error":       None,
        }
    except ImportError:
        return {"domain": domain, "error": "python-whois not installed. Run: pip install python-whois"}
    except Exception as e:
        return {"domain": domain, "error": str(e)}

async def whois_lookup(domain: str) -> Dict:
    """Get WHOIS data for a domain (runs sync lib in thread pool)."""
    return await asyncio.to_thread(_whois_sync, domain)