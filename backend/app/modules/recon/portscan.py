# modules/recon/portscan.py
"""
Port Scanner — async TCP connect scanner with:
  - Banner grabbing (raw service banners)
  - Service version fingerprinting from banners
  - SSL/TLS certificate inspection (expiry, issuer, SANs, weak ciphers)
  - HTTP title + redirect chain on web ports
  - NVD CVE lookup per discovered service version
  - Host risk scoring (critical/high/medium/low)
  - UDP port hints for DNS/SNMP
"""
import asyncio
import ssl
import socket
import re
import json
import datetime
from typing import Dict, List, Optional, Tuple
import httpx

# ── Port definitions ──────────────────────────────────────────────────────────

COMMON_PORTS = {
    21: "FTP",          22: "SSH",          23: "Telnet",
    25: "SMTP",         53: "DNS",          69: "TFTP",
    79: "Finger",       80: "HTTP",         110: "POP3",
    111: "RPC",         135: "MSRPC",       139: "NetBIOS",
    143: "IMAP",        389: "LDAP",        443: "HTTPS",
    445: "SMB",         465: "SMTPS",       512: "rExec",
    513: "rLogin",      514: "rSH",         587: "SMTP/TLS",
    636: "LDAPS",       873: "rsync",       993: "IMAPS",
    995: "POP3S",       1080: "SOCKS",      1099: "JavaRMI",
    1433: "MSSQL",      1521: "Oracle",     1723: "PPTP",
    2049: "NFS",        2181: "Zookeeper",  2375: "Docker",
    2376: "Docker TLS", 2379: "etcd",       3000: "Dev Server",
    3128: "Squid",      3306: "MySQL",      3389: "RDP",
    4443: "Alt HTTPS",  4848: "GlassFish",  5000: "Flask/Dev",
    5432: "PostgreSQL", 5601: "Kibana",     5900: "VNC",
    6379: "Redis",      6443: "K8s API",    7000: "Cassandra",
    7001: "WebLogic",   7443: "Alt HTTPS",  8000: "Alt HTTP",
    8009: "AJP",        8080: "Alt HTTP",   8443: "Alt HTTPS",
    8500: "Consul",     8888: "Jupyter",    9000: "SonarQube",
    9090: "Prometheus", 9200: "Elasticsearch", 9300: "Elasticsearch",
    9418: "Git",        10250: "Kubelet",   11211: "Memcached",
    27017: "MongoDB",   27018: "MongoDB",   50070: "Hadoop",
    61616: "ActiveMQ",
}

PORT_RISK = {
    23: "critical", 445: "critical", 135: "critical", 139: "critical",
    1433: "critical", 1521: "critical", 2375: "critical", 3389: "critical",
    6379: "critical", 9200: "critical", 27017: "critical", 11211: "critical",
    2379: "critical", 10250: "critical", 50070: "critical", 61616: "critical",
    4848: "critical", 7001: "critical",
    21: "high", 25: "high", 110: "high", 512: "high", 513: "high",
    514: "high", 873: "high", 1099: "high", 2049: "high", 5900: "high",
    5432: "high", 3306: "high", 9300: "high", 27018: "high",
    8009: "high", 9000: "high", 8500: "high", 2181: "high",
    53: "medium", 79: "medium", 111: "medium", 389: "medium",
    1080: "medium", 1723: "medium", 3000: "medium", 3128: "medium",
    4443: "medium", 5000: "medium", 5601: "medium", 6443: "medium",
    7000: "medium", 8000: "medium", 8080: "medium", 8888: "medium",
    9090: "medium", 9418: "medium",
    22: "low", 80: "low", 143: "low", 443: "low", 465: "low",
    587: "low", 636: "low", 993: "low", 995: "low", 8443: "low",
}

RISK_ORDER = {"critical": 4, "high": 3, "medium": 2, "low": 1}

# ── Banner probes ─────────────────────────────────────────────────────────────
# Some services need a probe to send a banner

BANNER_PROBES = {
    21:  b"",           # FTP sends banner immediately
    22:  b"",           # SSH sends banner immediately
    25:  b"",           # SMTP sends banner immediately
    80:  b"HEAD / HTTP/1.0\r\n\r\n",
    110: b"",
    143: b"",
    443: None,          # TLS — handled separately
    3306: b"",          # MySQL sends greeting
    5432: b"",          # PostgreSQL sends error on bad startup
    6379: b"INFO\r\n",  # Redis
    9200: b"GET / HTTP/1.0\r\n\r\n",  # Elasticsearch
    27017: b"\x3a\x00\x00\x00\x10\x00\x00\x00\x00\x00\x00\x00\xd4\x07\x00\x00\x00\x00\x00\x00admin.$cmd\x00\x00\x00\x00\x00\xff\xff\xff\xff\x13\x00\x00\x00\x10isMaster\x00\x01\x00\x00\x00\x00",
}

# ── Version fingerprinting from banners ───────────────────────────────────────

BANNER_FINGERPRINTS = [
    # (regex, software_name, version_group)
    (r"SSH-[\d.]+-OpenSSH[_\s]+([\d.]+p?\d*)", "OpenSSH", 1),
    (r"SSH-[\d.]+-OpenSSH[_\s]+([\d.]+)", "OpenSSH", 1),
    (r"SSH-[\d.]+-dropbear[_\s]+([\d.]+)", "Dropbear SSH", 1),
    (r"OpenSSH[_\s]+([\d.]+)", "OpenSSH", 1),
    (r"Apache(?:/| )([\d.]+)", "Apache HTTPD", 1),
    (r"nginx/([\d.]+)", "Nginx", 1),
    (r"Microsoft-IIS/([\d.]+)", "IIS", 1),
    (r"lighttpd/([\d.]+)", "Lighttpd", 1),
    (r"LiteSpeed(?:SAPI)?/([\d.]+)", "LiteSpeed", 1),
    (r"PHP/([\d.]+)", "PHP", 1),
    (r"MySQL.*?([\d]+\.[\d]+\.[\d]+)", "MySQL", 1),
    (r"PostgreSQL ([\d]+\.[\d]+)", "PostgreSQL", 1),
    (r"Redis (server|mode|version)[^\d]*([\d]+\.[\d]+\.[\d]+)", "Redis", 2),
    (r"\+redis_version:([\d.]+)", "Redis", 1),
    (r"mongod.*?version[:\s]+([\d.]+)", "MongoDB", 1),
    (r"Elasticsearch.*?version.*?number.*?[\"']([\d.]+)", "Elasticsearch", 1),
    (r"SMTP.*?Postfix ([\d.]+)", "Postfix", 1),
    (r"220.*?Exim ([\d.]+)", "Exim", 1),
    (r"220.*?sendmail ([\d.]+)", "Sendmail", 1),
    (r"ProFTPD ([\d.]+)", "ProFTPD", 1),
    (r"vsftpd ([\d.]+)", "vsftpd", 1),
    (r"FileZilla Server ([\d.]+)", "FileZilla FTP", 1),
    (r"OpenSSL/([\d.]+[a-z]?)", "OpenSSL", 1),
    (r"Dovecot.*?ready", "Dovecot", None),
    (r"Microsoft Exchange", "Exchange", None),
    (r"Memcached ([\d.]+)", "Memcached", 1),
    (r"ActiveMQ/([\d.]+)", "ActiveMQ", 1),
    (r"Jetty/([\d.]+)", "Jetty", 1),
    (r"Tomcat/([\d.]+)", "Tomcat", 1),
    (r"GlassFish ([\d.]+)", "GlassFish", 1),
    (r"WebLogic.*?([\d]+\.[\d]+\.[\d]+)", "WebLogic", 1),
    (r"Consul.*?([\d]+\.[\d]+\.[\d]+)", "Consul", 1),
    (r'"number"\s*:\s*"([\d.]+)".*?elasticsearch', "Elasticsearch", 1),
    (r"VNC Protocol ([\d.]+)", "VNC", 1),
    (r"RFB ([\d]+\.[\d]+)", "VNC/RFB", 1),
]

def _fingerprint_banner(banner: str) -> Tuple[Optional[str], Optional[str]]:
    """Returns (software_name, version) from a service banner."""
    for pattern, name, ver_group in BANNER_FINGERPRINTS:
        m = re.search(pattern, banner, re.IGNORECASE)
        if m:
            version = None
            if ver_group and m.lastindex and ver_group <= m.lastindex:
                version = m.group(ver_group)
            return name, version
    return None, None

# ── Banner grabbing ───────────────────────────────────────────────────────────

async def _grab_banner(host: str, port: int, timeout: float = 3.0) -> Optional[str]:
    """Grab raw service banner from an open port."""
    try:
        probe = BANNER_PROBES.get(port, b"")
        if probe is None:
            return None  # TLS — handled elsewhere

        reader, writer = await asyncio.wait_for(
            asyncio.open_connection(host, port), timeout=timeout
        )

        if probe:
            writer.write(probe)
            await writer.drain()

        try:
            data = await asyncio.wait_for(reader.read(2048), timeout=timeout)
            banner = data.decode("utf-8", errors="ignore").strip()
        except asyncio.TimeoutError:
            banner = ""
        finally:
            writer.close()
            try:
                await asyncio.wait_for(writer.wait_closed(), timeout=1.0)
            except Exception:
                pass

        return banner[:1000] if banner else None
    except Exception:
        return None

# ── SSL/TLS certificate inspection ───────────────────────────────────────────

def _inspect_ssl(host: str, port: int, timeout: float = 5.0) -> Optional[dict]:
    """Synchronous SSL cert inspection — called via executor."""
    try:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE

        with socket.create_connection((host, port), timeout=timeout) as sock:
            with ctx.wrap_socket(sock, server_hostname=host) as ssock:
                cert = ssock.getpeercert()
                cipher = ssock.cipher()
                version = ssock.version()

                # Parse dates
                not_before = cert.get("notBefore", "")
                not_after  = cert.get("notAfter", "")

                expiry_days = None
                expired = False
                try:
                    exp = datetime.datetime.strptime(not_after, "%b %d %H:%M:%S %Y %Z")
                    now = datetime.datetime.utcnow()
                    expiry_days = (exp - now).days
                    expired = expiry_days < 0
                except Exception:
                    pass

                # Subject / Issuer
                subject = dict(x[0] for x in cert.get("subject", []))
                issuer  = dict(x[0] for x in cert.get("issuer", []))

                # SANs
                sans = []
                for t, v in cert.get("subjectAltName", []):
                    if t == "DNS":
                        sans.append(v)

                # Weak cipher / protocol detection
                weak = []
                if version in ("SSLv2", "SSLv3", "TLSv1", "TLSv1.1"):
                    weak.append(f"Outdated protocol: {version}")
                cipher_name = cipher[0] if cipher else ""
                if any(w in cipher_name.upper() for w in ["RC4", "DES", "3DES", "EXPORT", "NULL", "ADH", "MD5"]):
                    weak.append(f"Weak cipher: {cipher_name}")

                return {
                    "valid":         not expired,
                    "expired":       expired,
                    "expiry_days":   expiry_days,
                    "not_before":    not_before,
                    "not_after":     not_after,
                    "subject_cn":    subject.get("commonName", ""),
                    "issuer_cn":     issuer.get("commonName", ""),
                    "issuer_org":    issuer.get("organizationName", ""),
                    "sans":          sans[:10],
                    "tls_version":   version,
                    "cipher":        cipher_name,
                    "warnings":      weak,
                    "self_signed":   subject == issuer,
                }
    except Exception as e:
        return {"error": str(e)}

# ── HTTP title + redirect chain ───────────────────────────────────────────────

async def _http_probe(host: str, port: int, tls: bool = False, timeout: float = 5.0) -> dict:
    """Fetch HTTP title, server header, and redirect chain."""
    scheme = "https" if tls else "http"
    url = f"{scheme}://{host}:{port}/" if port not in (80, 443) else f"{scheme}://{host}/"
    try:
        async with httpx.AsyncClient(
            follow_redirects=True, timeout=timeout, verify=False,
            limits=httpx.Limits(max_connections=5)
        ) as client:
            resp = await client.get(url)
            title_m = re.search(r"<title[^>]*>([^<]{1,200})</title>", resp.text, re.I)
            title = title_m.group(1).strip() if title_m else ""
            redirects = [str(r.url) for r in resp.history]
            return {
                "status":    resp.status_code,
                "title":     title,
                "server":    resp.headers.get("server", ""),
                "powered_by": resp.headers.get("x-powered-by", ""),
                "redirects": redirects,
                "final_url": str(resp.url),
            }
    except Exception as e:
        return {"error": str(e)[:100]}

# ── NVD CVE lookup ────────────────────────────────────────────────────────────

async def _nvd_cve_lookup(software: str, version: Optional[str]) -> list:
    """Query NIST NVD for CVEs matching software + version."""
    try:
        query = software
        if version:
            parts = version.split(".")
            query = f"{software} {'.'.join(parts[:2])}"

        async with httpx.AsyncClient(timeout=8, verify=False) as client:
            resp = await client.get(
                "https://services.nvd.nist.gov/rest/json/cves/2.0",
                params={"keywordSearch": query, "resultsPerPage": 5},
                headers={"User-Agent": "ASDMT-PortScanner/1.0"},
            )
        if resp.status_code != 200:
            return []

        cves = []
        for item in resp.json().get("vulnerabilities", [])[:5]:
            cve = item.get("cve", {})
            cve_id = cve.get("id", "")
            desc = next((d["value"] for d in cve.get("descriptions", []) if d.get("lang") == "en"), "")
            metrics = cve.get("metrics", {})
            score, severity = "", ""
            for key in ("cvssMetricV31", "cvssMetricV30", "cvssMetricV2"):
                if metrics.get(key):
                    m = metrics[key][0].get("cvssData", {})
                    score    = str(m.get("baseScore", ""))
                    severity = m.get("baseSeverity", "")
                    break
            cves.append({
                "cve_id":    cve_id,
                "desc":      desc[:200],
                "score":     score,
                "severity":  severity,
                "url":       f"https://nvd.nist.gov/vuln/detail/{cve_id}",
                "published": cve.get("published", "")[:10],
            })
        return cves
    except Exception:
        return []

# ── Host risk scoring ─────────────────────────────────────────────────────────

def _score_host(open_ports: list) -> dict:
    """Compute overall risk score for a host based on open ports."""
    if not open_ports:
        return {"level": "none", "score": 0, "reasons": []}

    reasons = []
    score = 0
    for p in open_ports:
        port = p["port"]
        risk = PORT_RISK.get(port, "low")
        w = RISK_ORDER.get(risk, 1)
        score += w

        # Specific high-value findings
        if port == 23:
            reasons.append("Telnet open — plaintext remote access")
        elif port == 2375:
            reasons.append("Docker API open — unauthenticated container control")
        elif port == 6379:
            reasons.append("Redis open — likely unauthenticated")
        elif port == 9200:
            reasons.append("Elasticsearch open — potential data exposure")
        elif port == 27017:
            reasons.append("MongoDB open — potential unauthenticated access")
        elif port == 3389:
            reasons.append("RDP open — brute-force / BlueKeep risk")
        elif port == 445:
            reasons.append("SMB open — EternalBlue / ransomware risk")
        elif port == 11211:
            reasons.append("Memcached open — DDoS amplification risk")
        elif port == 10250:
            reasons.append("Kubelet API open — Kubernetes node control")
        elif port == 2379:
            reasons.append("etcd open — Kubernetes secrets exposure")

    max_risk = max((PORT_RISK.get(p["port"], "low") for p in open_ports), key=lambda r: RISK_ORDER.get(r, 1))
    return {"level": max_risk, "score": score, "reasons": reasons[:5]}

# ── Core scanner ─────────────────────────────────────────────────────────────

async def _scan_port(host: str, port: int, timeout: float = 1.5) -> bool:
    try:
        _, writer = await asyncio.wait_for(
            asyncio.open_connection(host, port), timeout=timeout
        )
        writer.close()
        try:
            await asyncio.wait_for(writer.wait_closed(), timeout=0.5)
        except Exception:
            pass
        return True
    except Exception:
        return False

async def scan_host(
    subdomain: str,
    ports: List[int] = None,
    timeout: float = 1.5,
    grab_banners: bool = True,
    check_ssl: bool = True,
    http_probe: bool = True,
    lookup_cves: bool = True,
) -> Dict:
    if ports is None:
        ports = list(COMMON_PORTS.keys())

    # Phase 1: TCP connect scan
    open_port_nums = []
    sem = asyncio.Semaphore(60)

    async def _check(port):
        async with sem:
            if await _scan_port(subdomain, port, timeout):
                open_port_nums.append(port)

    await asyncio.gather(*[_check(p) for p in ports])
    open_port_nums.sort()

    if not open_port_nums:
        return {
            "subdomain":  subdomain,
            "open_ports": [],
            "total":      0,
            "risk":       {"level": "none", "score": 0, "reasons": []},
        }

    # Phase 2: Banner grab + SSL + HTTP probe per open port
    loop = asyncio.get_event_loop()
    open_ports = []

    ssl_ports  = {443, 8443, 4443, 7443, 636, 993, 995, 465}
    http_ports = {80, 8080, 8000, 443, 8443, 4443, 7443, 3000, 5000, 8888, 9200, 5601, 9090}

    async def _enrich(port):
        entry = {
            "port":    port,
            "service": COMMON_PORTS.get(port, "unknown"),
            "risk":    PORT_RISK.get(port, "low"),
            "state":   "open",
            "banner":  None,
            "software": None,
            "version": None,
            "ssl":     None,
            "http":    None,
            "cves":    [],
        }

        # Banner grabbing
        if grab_banners and port not in ssl_ports:
            banner = await _grab_banner(subdomain, port, timeout=3.0)
            if banner:
                entry["banner"] = banner[:500]
                sw, ver = _fingerprint_banner(banner)
                entry["software"] = sw
                entry["version"]  = ver

        # SSL inspection
        if check_ssl and port in ssl_ports:
            ssl_info = await loop.run_in_executor(
                None, lambda: _inspect_ssl(subdomain, port, timeout=5.0)
            )
            entry["ssl"] = ssl_info
            # Try banner on TLS port via HTTP probe
            if ssl_info and not ssl_info.get("error"):
                entry["service"] = COMMON_PORTS.get(port, "HTTPS")

        # HTTP probing
        if http_probe and port in http_ports:
            is_tls = port in ssl_ports
            http_info = await _http_probe(subdomain, port, tls=is_tls, timeout=5.0)
            entry["http"] = http_info
            # Extract server software from HTTP if banner didn't get it
            if not entry["software"] and http_info.get("server"):
                sw, ver = _fingerprint_banner(http_info["server"])
                entry["software"] = sw
                entry["version"]  = ver

        # CVE lookup if we identified software
        if lookup_cves and entry["software"]:
            entry["cves"] = await _nvd_cve_lookup(entry["software"], entry["version"])

        return entry

    enriched = await asyncio.gather(*[_enrich(p) for p in open_port_nums])
    open_ports = list(enriched)

    risk = _score_host(open_ports)

    return {
        "subdomain":  subdomain,
        "open_ports": open_ports,
        "total":      len(open_ports),
        "risk":       risk,
    }


async def scan_bulk(
    subdomains: List[str],
    ports: List[int] = None,
    max_hosts: int = 8,
    grab_banners: bool = True,
    check_ssl: bool = True,
    http_probe: bool = True,
    lookup_cves: bool = True,
) -> Dict[str, Dict]:
    sem = asyncio.Semaphore(max_hosts)

    async def _guarded(sub):
        async with sem:
            return await scan_host(
                sub, ports,
                grab_banners=grab_banners,
                check_ssl=check_ssl,
                http_probe=http_probe,
                lookup_cves=lookup_cves,
            )

    results_list = await asyncio.gather(*[_guarded(s) for s in subdomains])
    return {r["subdomain"]: r for r in results_list}