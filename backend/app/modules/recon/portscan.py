# modules/recon/portscan.py
"""
Port Scanner — async TCP connect scanner
Scans common ports on live subdomains.
"""
import asyncio
from typing import Dict, List

COMMON_PORTS = {
    21: "FTP", 22: "SSH", 23: "Telnet", 25: "SMTP", 53: "DNS",
    80: "HTTP", 110: "POP3", 143: "IMAP", 443: "HTTPS", 445: "SMB",
    587: "SMTP/TLS", 993: "IMAPS", 995: "POP3S", 1433: "MSSQL",
    1521: "Oracle", 2375: "Docker", 2376: "Docker TLS", 3000: "Dev Server",
    3306: "MySQL", 3389: "RDP", 4443: "Alt HTTPS", 5000: "Flask/Dev",
    5432: "PostgreSQL", 5900: "VNC", 6379: "Redis", 7000: "Cassandra",
    8000: "Alt HTTP", 8080: "Alt HTTP", 8443: "Alt HTTPS", 8888: "Jupyter",
    9200: "Elasticsearch", 9300: "Elasticsearch", 27017: "MongoDB",
}

async def _scan_port(host: str, port: int, timeout: float = 1.5) -> bool:
    try:
        _, writer = await asyncio.wait_for(
            asyncio.open_connection(host, port), timeout=timeout
        )
        writer.close()
        try: await writer.wait_closed()
        except Exception: pass
        return True
    except Exception:
        return False

async def scan_host(subdomain: str, ports: List[int] = None, timeout: float = 1.5) -> Dict:
    if ports is None:
        ports = list(COMMON_PORTS.keys())

    open_ports = []
    sem = asyncio.Semaphore(50)

    async def _check(port):
        async with sem:
            if await _scan_port(subdomain, port, timeout):
                open_ports.append({
                    "port":    port,
                    "service": COMMON_PORTS.get(port, "unknown"),
                    "state":   "open",
                })

    await asyncio.gather(*[_check(p) for p in ports])
    open_ports.sort(key=lambda x: x["port"])
    return {"subdomain": subdomain, "open_ports": open_ports, "total": len(open_ports)}

async def scan_bulk(subdomains: List[str], ports: List[int] = None, max_hosts: int = 10) -> Dict[str, Dict]:
    """Scan multiple hosts concurrently (capped to avoid overload)."""
    sem = asyncio.Semaphore(max_hosts)
    async def _guarded(sub):
        async with sem:
            return await scan_host(sub, ports)

    results_list = await asyncio.gather(*[_guarded(s) for s in subdomains])
    return {r["subdomain"]: r for r in results_list}