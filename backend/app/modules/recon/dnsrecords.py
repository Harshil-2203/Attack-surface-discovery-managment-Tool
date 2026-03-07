# modules/recon/dnsrecords.py
"""
DNS Records Viewer — fetch A, AAAA, MX, TXT, CNAME, NS, SOA records
Uses dnspython (pure Python, no external service needed).
Falls back to socket for A records if dnspython unavailable.
"""
import asyncio
from typing import Dict, List

async def _resolve(subdomain: str) -> Dict:
    result = {
        "subdomain": subdomain,
        "A": [], "AAAA": [], "CNAME": [], "MX": [],
        "TXT": [], "NS": [], "SOA": [], "error": None
    }
    try:
        import dns.resolver
        import dns.exception

        resolver = dns.resolver.Resolver()
        resolver.timeout  = 5
        resolver.lifetime = 8

        for rtype in ("A", "AAAA", "CNAME", "MX", "TXT", "NS"):
            try:
                ans = resolver.resolve(subdomain, rtype)
                if rtype == "A":
                    result["A"] = [r.address for r in ans]
                elif rtype == "AAAA":
                    result["AAAA"] = [r.address for r in ans]
                elif rtype == "CNAME":
                    result["CNAME"] = [str(r.target) for r in ans]
                elif rtype == "MX":
                    result["MX"] = [{"priority": r.preference, "host": str(r.exchange)} for r in ans]
                elif rtype == "TXT":
                    result["TXT"] = [b"".join(r.strings).decode("utf-8", "ignore") for r in ans]
                elif rtype == "NS":
                    result["NS"] = [str(r.target) for r in ans]
            except (dns.resolver.NoAnswer, dns.resolver.NXDOMAIN):
                pass
            except Exception:
                pass

    except ImportError:
        # Fallback: basic A record via socket
        import socket
        try:
            infos = socket.getaddrinfo(subdomain, None)
            result["A"] = list({i[4][0] for i in infos if i[0].name == "AF_INET"})
            result["AAAA"] = list({i[4][0] for i in infos if i[0].name == "AF_INET6"})
        except Exception as e:
            result["error"] = f"dnspython not installed, socket fallback: {e}"
    except Exception as e:
        result["error"] = str(e)

    return result

async def get_dns_records(subdomain: str) -> Dict:
    return await asyncio.to_thread(_resolve_sync, subdomain)

def _resolve_sync(subdomain: str) -> Dict:
    return asyncio.run(_resolve(subdomain))

async def get_dns_bulk(subdomains: List[str], max_concurrent: int = 20) -> Dict[str, Dict]:
    sem = asyncio.Semaphore(max_concurrent)
    async def _g(s):
        async with sem:
            return await _resolve(s)
    results = await asyncio.gather(*[_g(s) for s in subdomains])
    return {r["subdomain"]: r for r in results}