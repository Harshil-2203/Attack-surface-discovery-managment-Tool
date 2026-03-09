# modules/recon/dnsrecords.py
"""
DNS Records — deep recon module:
  - A, AAAA, CNAME, MX, TXT, NS, SOA, CAA, SRV, TLSA, NAPTR records
  - SPF / DMARC / DKIM analysis with misconfiguration detection
  - Zone transfer attempt (AXFR)
  - Subdomain takeover detection (CNAME to dead services)
  - PTR reverse DNS lookup
  - Cloud / CDN provider fingerprinting from IPs and CNAMEs
  - Split-horizon detection via DNS-over-HTTPS comparison
  - Dangling CNAME detection
  - ASN / GeoIP lookup for discovered IPs
  - DNS propagation check across multiple resolvers
  - DNSSEC validation status
"""
import asyncio
import re
import socket
from typing import Dict, List, Optional
import httpx

# ── Cloud / CDN provider fingerprinting ──────────────────────────────────────

CNAME_PROVIDERS = [
    (r"\.s3\.amazonaws\.com$",              "AWS S3",                True),
    (r"\.s3-website",                        "AWS S3 Website",        True),
    (r"\.elasticbeanstalk\.com$",            "AWS Elastic Beanstalk", True),
    (r"\.cloudfront\.net$",                  "AWS CloudFront",        False),
    (r"\.elb\.amazonaws\.com$",              "AWS ELB",               False),
    (r"\.amazonaws\.com$",                   "AWS",                   False),
    (r"\.azurewebsites\.net$",               "Azure App Service",     True),
    (r"\.azure\.com$",                       "Azure",                 False),
    (r"\.trafficmanager\.net$",              "Azure Traffic Mgr",     True),
    (r"\.blob\.core\.windows\.net$",         "Azure Blob",            True),
    (r"\.cloudapp\.azure\.com$",             "Azure",                 True),
    (r"\.azureedge\.net$",                   "Azure CDN",             True),
    (r"\.storage\.googleapis\.com$",         "GCS",                   True),
    (r"\.appspot\.com$",                     "Google App Engine",     True),
    (r"\.googleapis\.com$",                  "Google APIs",           False),
    (r"\.run\.app$",                         "Google Cloud Run",      False),
    (r"\.netlify\.app$",                     "Netlify",               True),
    (r"\.netlify\.com$",                     "Netlify",               True),
    (r"\.vercel\.app$",                      "Vercel",                True),
    (r"\.now\.sh$",                          "Vercel",                True),
    (r"\.pages\.dev$",                       "Cloudflare Pages",      True),
    (r"\.workers\.dev$",                     "Cloudflare Workers",    False),
    (r"\.github\.io$",                       "GitHub Pages",          True),
    (r"\.fastly\.net$",                      "Fastly",                False),
    (r"\.pantheonsite\.io$",                 "Pantheon",              True),
    (r"\.wpengine\.com$",                    "WP Engine",             False),
    (r"\.shopify\.com$",                     "Shopify",               False),
    (r"\.myshopify\.com$",                   "Shopify",               False),
    (r"\.squarespace\.com$",                 "Squarespace",           True),
    (r"\.wixsite\.com$",                     "Wix",                   False),
    (r"\.hubspot\.net$",                     "HubSpot",               True),
    (r"\.helpscoutdocs\.com$",               "HelpScout",             True),
    (r"\.statuspage\.io$",                   "StatusPage",            True),
    (r"\.zendesk\.com$",                     "Zendesk",               True),
    (r"\.readme\.io$",                       "ReadMe",                True),
    (r"\.ghost\.io$",                        "Ghost",                 True),
    (r"\.tumblr\.com$",                      "Tumblr",                True),
    (r"\.surge\.sh$",                        "Surge",                 True),
    (r"\.fly\.dev$",                         "Fly.io",                False),
    (r"\.herokussl\.com$|\.herokudns\.com$", "Heroku",                True),
    (r"\.herokuapp\.com$",                   "Heroku",                True),
    (r"\.render\.com$",                      "Render",                False),
    (r"akamaitechnologies\.com$",            "Akamai",                False),
    (r"edgekey\.net$",                       "Akamai",                False),
    (r"cloudflare\.com$",                    "Cloudflare",            False),
]

IP_RANGE_PROVIDERS = [
    ("13.",    "AWS"),    ("52.",    "AWS"),    ("54.",    "AWS"),
    ("3.",     "AWS"),    ("35.",    "GCP"),    ("34.",    "GCP"),
    ("104.",   "Cloudflare"), ("172.6.",  "Cloudflare"), ("172.67.", "Cloudflare"),
    ("20.",    "Azure"),  ("40.",    "Azure"),  ("51.",    "Azure"),
]

TAKEOVER_FINGERPRINTS = [
    ("AWS S3",            ["NoSuchBucket", "The specified bucket does not exist"]),
    ("AWS Elastic Beanstalk", ["there is no app currently deployed"]),
    ("Azure App Service", ["404 Web Site not found"]),
    ("Azure Blob",        ["BlobNotFound", "ResourceNotFound"]),
    ("Netlify",           ["Not Found - Request ID"]),
    ("GitHub Pages",      ["There isn't a GitHub Pages site here"]),
    ("Heroku",            ["No such app", "herokucdn.com/error-pages/no-such-app"]),
    ("Fastly",            ["Fastly error: unknown domain"]),
    ("HubSpot",           ["does not exist in our system"]),
    ("Zendesk",           ["Help Center Closed"]),
    ("Tumblr",            ["There's nothing here"]),
    ("Ghost",             ["The thing you were looking for is no longer here"]),
    ("Surge",             ["project not found"]),
    ("Squarespace",       ["No Such Account"]),
    ("ReadMe",            ["Project doesnt exist"]),
    ("StatusPage",        ["Better luck next time"]),
]

# ── Propagation resolvers ─────────────────────────────────────────────────────

PROPAGATION_RESOLVERS = {
    "Cloudflare":  "1.1.1.1",
    "Google":      "8.8.8.8",
    "Quad9":       "9.9.9.9",
    "OpenDNS":     "208.67.222.222",
}

COMMON_SRV = [
    "_sip._tcp", "_sip._udp", "_xmpp-client._tcp", "_xmpp-server._tcp",
    "_autodiscover._tcp", "_imap._tcp", "_imaps._tcp", "_pop3._tcp",
    "_smtp._tcp", "_ldap._tcp", "_kerberos._tcp", "_http._tcp",
    "_https._tcp", "_caldav._tcp", "_carddav._tcp",
]

DKIM_SELECTORS = [
    "default", "google", "mail", "email", "dkim", "k1", "k2", "s1", "s2",
    "selector1", "selector2", "mandrill", "mailchimp", "sendgrid",
    "amazonses", "smtp", "key1", "key2", "protonmail",
]

# ── Provider detection ────────────────────────────────────────────────────────

def _detect_provider(cnames: list, ips: list) -> Optional[str]:
    for cname in cnames:
        for pattern, provider, _ in CNAME_PROVIDERS:
            if re.search(pattern, cname, re.I):
                return provider
    for ip in ips:
        for prefix, provider in IP_RANGE_PROVIDERS:
            if ip.startswith(prefix):
                return provider
    return None

# ── Takeover check ────────────────────────────────────────────────────────────

async def _check_takeover(subdomain: str, cnames: list) -> dict:
    result = {"possible": False, "provider": None, "reason": None, "evidence": None}
    for cname in cnames:
        for pattern, provider, takeover_possible in CNAME_PROVIDERS:
            if re.search(pattern, cname, re.I) and takeover_possible:
                result["provider"] = provider
                result["reason"]   = f"CNAME → {cname}"
                try:
                    async with httpx.AsyncClient(follow_redirects=True, timeout=6, verify=False) as client:
                        for scheme in ("https://", "http://"):
                            try:
                                resp = await client.get(f"{scheme}{subdomain}")
                                body = resp.text[:5000].lower()
                                for fp_provider, fp_strings in TAKEOVER_FINGERPRINTS:
                                    for fingerprint in fp_strings:
                                        if fingerprint.lower() in body:
                                            result["possible"]  = True
                                            result["evidence"]  = fingerprint
                                            return result
                                break
                            except Exception:
                                continue
                except Exception:
                    pass
                return result
    return result

# ── SPF analysis ──────────────────────────────────────────────────────────────

def _analyze_spf(txt_records: list) -> dict:
    spf = next((r for r in txt_records if r.strip().lower().startswith("v=spf1")), None)
    if not spf:
        return {"found": False, "record": None, "policy": None,
                "issues": ["No SPF record — domain may be spoofable for phishing"]}
    issues = []
    if "+all" in spf:
        issues.append("CRITICAL: +all permits ANY server to send as this domain")
        policy = "pass_all"
    elif "?all" in spf:
        issues.append("WEAK: ?all is neutral — no real protection")
        policy = "neutral"
    elif "~all" in spf:
        policy = "softfail"
    elif "-all" in spf:
        policy = "fail"
    else:
        issues.append("No 'all' mechanism — SPF incomplete")
        policy = "none"
    lookups = len(re.findall(r'\b(?:include|a|mx|ptr|exists):', spf))
    if lookups > 10:
        issues.append(f"Too many DNS lookups ({lookups}/10) — PermError risk")
    if re.search(r'\bptr\b', spf):
        issues.append("Uses deprecated 'ptr' mechanism")
    redirect = re.search(r'redirect=([^\s]+)', spf)
    includes = re.findall(r'include:([^\s]+)', spf)
    return {
        "found":         True,
        "record":        spf,
        "policy":        policy,
        "issues":        issues,
        "lookup_count":  lookups,
        "includes":      includes,
        "redirect":      redirect.group(1) if redirect else None,
    }

# ── DMARC analysis ────────────────────────────────────────────────────────────

def _analyze_dmarc(txt_records: list) -> dict:
    dmarc = next((r for r in txt_records if r.strip().lower().startswith("v=dmarc1")), None)
    if not dmarc:
        return {"found": False, "record": None, "policy": None,
                "issues": ["No DMARC record — phishing / spoofing risk"]}
    issues = []
    p_match  = re.search(r'\bp=(\w+)',   dmarc, re.I)
    sp_match = re.search(r'\bsp=(\w+)',  dmarc, re.I)
    pct_match = re.search(r'\bpct=(\d+)', dmarc)
    policy = p_match.group(1).lower() if p_match else "none"
    sp     = sp_match.group(1).lower() if sp_match else policy
    pct    = int(pct_match.group(1)) if pct_match else 100
    if policy == "none":
        issues.append("Policy 'none' — monitoring only, no enforcement")
    if pct < 100:
        issues.append(f"Only {pct}% of messages subject to DMARC policy")
    rua = re.search(r'\brua=([^\s;]+)', dmarc)
    ruf = re.search(r'\bruf=([^\s;]+)', dmarc)
    adkim = re.search(r'\badkim=(\w+)', dmarc, re.I)
    aspf  = re.search(r'\baspf=(\w+)',  dmarc, re.I)
    return {
        "found":            True,
        "record":           dmarc,
        "policy":           policy,
        "subdomain_policy": sp,
        "pct":              pct,
        "reporting_uri":    rua.group(1) if rua else None,
        "forensic_uri":     ruf.group(1) if ruf else None,
        "adkim":            adkim.group(1) if adkim else "r",
        "aspf":             aspf.group(1)  if aspf  else "r",
        "issues":           issues,
    }

# ── DKIM check ────────────────────────────────────────────────────────────────

async def _check_dkim(domain: str) -> dict:
    found = []
    try:
        import dns.resolver
        resolver = dns.resolver.Resolver()
        resolver.timeout = 3
        for sel in DKIM_SELECTORS:
            try:
                ans = resolver.resolve(f"{sel}._domainkey.{domain}", "TXT")
                for r in ans:
                    txt = b"".join(r.strings).decode("utf-8", "ignore")
                    if "v=dkim1" in txt.lower() or "p=" in txt:
                        key_m = re.search(r'p=([A-Za-z0-9+/=]+)', txt)
                        key_len = len(key_m.group(1)) * 6 // 8 if key_m else None
                        found.append({
                            "selector":   sel,
                            "record":     txt[:300],
                            "key_bits":   key_len * 8 if key_len else None,
                            "empty_key":  bool(re.search(r'p=\s*;', txt)),
                            "revoked":    bool(re.search(r'p=\s*;', txt)),
                        })
            except Exception:
                pass
    except ImportError:
        pass
    issues = []
    for k in found:
        if k["revoked"]:
            issues.append(f"Selector '{k['selector']}' has empty/revoked key")
        if k["key_bits"] and k["key_bits"] < 1024:
            issues.append(f"Selector '{k['selector']}' uses weak {k['key_bits']}-bit key")
    return {"selectors_checked": len(DKIM_SELECTORS), "found": found, "issues": issues}

# ── Interesting TXT records ───────────────────────────────────────────────────

def _interesting_txt(txt_records: list) -> list:
    patterns = [
        (r"google-site-verification", "Google Search Console"),
        (r"ms=ms",                    "Microsoft/O365 verification"),
        (r"atlassian-domain-verification", "Atlassian"),
        (r"apple-domain-verification","Apple"),
        (r"facebook-domain-verification", "Facebook"),
        (r"docusign=",               "DocuSign"),
        (r"stripe-verification=",    "Stripe"),
        (r"zoho-verification=",      "Zoho"),
        (r"onetrust",                "OneTrust"),
        (r"loaderio=",               "Loader.io"),
        (r"blitz=",                  "Blitz.io"),
        (r"globalsign-smime-dv=",    "GlobalSign S/MIME"),
        (r"have-i-been-pwned",       "HaveIBeenPwned"),
        (r"protonmail-verification", "ProtonMail"),
        (r"cisco-ci-domain-verification", "Cisco"),
        (r"_github-challenge-",      "GitHub ownership"),
        (r"docker-verification=",    "Docker Hub"),
    ]
    out = []
    for record in txt_records:
        if record.strip().lower().startswith(("v=spf1", "v=dmarc1", "v=dkim1")):
            continue
        for pattern, label in patterns:
            if re.search(pattern, record, re.I):
                out.append({"record": record[:200], "type": label})
                break
    return out

# ── Zone transfer (AXFR) ─────────────────────────────────────────────────────

async def _axfr(domain: str, nameservers: list) -> dict:
    result = {"attempted": False, "success": False, "records": [], "servers_tried": []}
    if not nameservers:
        return result
    try:
        import dns.zone, dns.query, dns.resolver
        resolver = dns.resolver.Resolver()
        for ns in nameservers[:3]:
            ns_host = ns.rstrip(".")
            result["servers_tried"].append(ns_host)
            result["attempted"] = True
            try:
                ns_ips = []
                try:
                    ns_ips = [r.address for r in resolver.resolve(ns_host, "A")]
                except Exception:
                    ns_ips = [ns_host]
                for ip in ns_ips[:1]:
                    try:
                        zone = dns.zone.from_xfr(dns.query.xfr(ip, domain, timeout=5))
                        records = []
                        for name, node in zone.nodes.items():
                            for rdataset in node.rdatasets:
                                for rdata in rdataset:
                                    records.append(f"{name} {rdataset.rdtype.name} {rdata}")
                        result.update({"success": True, "records": records[:200], "server": ip})
                        return result
                    except Exception:
                        pass
            except Exception:
                pass
    except ImportError:
        pass
    return result

# ── PTR reverse lookup ───────────────────────────────────────────────────────

async def _ptr_lookup(ips: list) -> dict:
    results = {}
    try:
        import dns.resolver, dns.reversename
        resolver = dns.resolver.Resolver()
        resolver.timeout = 3
        for ip in ips[:5]:
            try:
                rev = dns.reversename.from_address(ip)
                ans = resolver.resolve(rev, "PTR")
                results[ip] = [str(r.target).rstrip(".") for r in ans]
            except Exception:
                results[ip] = []
    except ImportError:
        for ip in ips[:5]:
            try:
                results[ip] = [socket.gethostbyaddr(ip)[0]]
            except Exception:
                results[ip] = []
    return results

# ── SRV records ──────────────────────────────────────────────────────────────

async def _get_srv(domain: str) -> list:
    found = []
    try:
        import dns.resolver
        resolver = dns.resolver.Resolver()
        resolver.timeout = 2
        for srv in COMMON_SRV:
            try:
                ans = resolver.resolve(f"{srv}.{domain}", "SRV")
                for r in ans:
                    found.append({
                        "service":  srv,
                        "target":   str(r.target).rstrip("."),
                        "port":     r.port,
                        "priority": r.priority,
                        "weight":   r.weight,
                    })
            except Exception:
                pass
    except ImportError:
        pass
    return found

# ── CAA records ──────────────────────────────────────────────────────────────

async def _get_caa(domain: str) -> list:
    try:
        import dns.resolver
        resolver = dns.resolver.Resolver()
        resolver.timeout = 4
        ans = resolver.resolve(domain, "CAA")
        return [{"flag": r.flags, "tag": r.tag.decode(), "value": r.value.decode()} for r in ans]
    except Exception:
        return []

# ── DNSSEC status ─────────────────────────────────────────────────────────────

async def _dnssec_status(domain: str) -> dict:
    try:
        async with httpx.AsyncClient(timeout=6, verify=False) as client:
            resp = await client.get(
                "https://cloudflare-dns.com/dns-query",
                params={"name": domain, "type": "DNSKEY", "do": "1"},
                headers={"Accept": "application/dns-json"},
            )
            data = resp.json()
            has_dnskey = any(a.get("type") == 48 for a in data.get("Answer", []))
            ad_flag    = data.get("AD", False)
            return {
                "enabled":    has_dnskey or ad_flag,
                "ad_flag":    ad_flag,
                "has_dnskey": has_dnskey,
            }
    except Exception:
        return {"enabled": False, "error": "lookup failed"}

# ── DNS propagation check ─────────────────────────────────────────────────────

async def _propagation_check(domain: str) -> dict:
    results = {}
    try:
        import dns.resolver, dns.rdatatype
    except ImportError:
        return results

    async def _query_resolver(name: str, ip: str) -> list:
        loop = asyncio.get_event_loop()
        def _sync():
            r = dns.resolver.Resolver(configure=False)
            r.nameservers = [ip]
            r.timeout = 4
            try:
                return [a.address for a in r.resolve(domain, "A")]
            except Exception:
                return []
        return await loop.run_in_executor(None, _sync)

    tasks = {name: _query_resolver(name, ip) for name, ip in PROPAGATION_RESOLVERS.items()}
    for name, coro in tasks.items():
        results[name] = await coro

    # Check consistency
    unique_sets = [frozenset(v) for v in results.values() if v]
    consistent = len(set(unique_sets)) <= 1 if unique_sets else True
    return {"resolvers": results, "consistent": consistent,
            "note": "" if consistent else "Inconsistent answers — split-horizon or slow propagation"}

# ── DoH comparison ────────────────────────────────────────────────────────────

async def _doh_compare(domain: str, sys_ips: list) -> dict:
    try:
        async with httpx.AsyncClient(timeout=5, verify=False) as client:
            resp = await client.get(
                "https://cloudflare-dns.com/dns-query",
                params={"name": domain, "type": "A"},
                headers={"Accept": "application/dns-json"},
            )
            doh_ips = [a["data"] for a in resp.json().get("Answer", []) if a.get("type") == 1]
        mismatch = bool(doh_ips) and bool(sys_ips) and set(doh_ips) != set(sys_ips)
        return {
            "doh_ips":  doh_ips,
            "mismatch": mismatch,
            "note":     "Split-horizon: different IPs via DoH vs local resolver" if mismatch else "",
        }
    except Exception:
        return {"error": "doh lookup failed"}

# ── ASN / GeoIP via ipapi.co ─────────────────────────────────────────────────

async def _ip_info(ips: list) -> dict:
    results = {}
    async with httpx.AsyncClient(timeout=5, verify=False) as client:
        for ip in ips[:3]:
            try:
                resp = await client.get(f"https://ipapi.co/{ip}/json/")
                d = resp.json()
                results[ip] = {
                    "asn":      d.get("asn", ""),
                    "org":      d.get("org", ""),
                    "country":  d.get("country_name", ""),
                    "city":     d.get("city", ""),
                    "region":   d.get("region", ""),
                    "timezone": d.get("timezone", ""),
                    "is_cloud": any(p in d.get("org", "") for p in
                                    ["Amazon", "Google", "Microsoft", "Cloudflare", "Fastly", "Akamai"]),
                }
            except Exception:
                results[ip] = {}
    return results

# ── Main resolver ─────────────────────────────────────────────────────────────

async def _resolve(subdomain: str, primary_domain: str = None, deep: bool = False) -> Dict:
    domain = primary_domain or (subdomain if "." in subdomain else subdomain)

    result = {
        "subdomain":       subdomain,
        "A": [], "AAAA": [], "CNAME": [], "MX": [],
        "TXT": [], "NS": [], "SOA": {}, "CAA": [], "SRV": [],
        "PTR":             {},
        "ip_info":         {},
        "provider":        None,
        "takeover":        None,
        "dnssec":          None,
        "spf":             None,
        "dmarc":           None,
        "dkim":            None,
        "txt_interesting": [],
        "zone_transfer":   None,
        "propagation":     None,
        "doh_comparison":  None,
        "error":           None,
    }

    try:
        import dns.resolver
        resolver = dns.resolver.Resolver()
        resolver.timeout  = 5
        resolver.lifetime = 8

        # ── Standard records ──────────────────────────────────────────────────
        for rtype in ("A", "AAAA", "CNAME", "MX", "TXT", "NS"):
            try:
                ans = resolver.resolve(subdomain, rtype)
                if rtype == "A":
                    result["A"] = [r.address for r in ans]
                elif rtype == "AAAA":
                    result["AAAA"] = [r.address for r in ans]
                elif rtype == "CNAME":
                    result["CNAME"] = [str(r.target).rstrip(".") for r in ans]
                elif rtype == "MX":
                    result["MX"] = sorted(
                        [{"priority": r.preference, "host": str(r.exchange).rstrip(".")} for r in ans],
                        key=lambda x: x["priority"]
                    )
                elif rtype == "TXT":
                    result["TXT"] = [b"".join(r.strings).decode("utf-8", "ignore") for r in ans]
                elif rtype == "NS":
                    result["NS"] = [str(r.target).rstrip(".") for r in ans]
            except (dns.resolver.NoAnswer, dns.resolver.NXDOMAIN):
                pass
            except Exception:
                pass

        # SOA
        try:
            ans = resolver.resolve(domain, "SOA")
            for r in ans:
                result["SOA"] = {
                    "mname":   str(r.mname).rstrip("."),
                    "rname":   str(r.rname).rstrip(".").replace(".", "@", 1),
                    "serial":  r.serial,
                    "refresh": r.refresh,
                    "retry":   r.retry,
                    "expire":  r.expire,
                    "minimum": r.minimum,
                }
        except Exception:
            pass

    except ImportError:
        try:
            infos = socket.getaddrinfo(subdomain, None)
            result["A"]    = list({i[4][0] for i in infos if i[0].name == "AF_INET"})
            result["AAAA"] = list({i[4][0] for i in infos if i[0].name == "AF_INET6"})
        except Exception as e:
            result["error"] = str(e)
        return result
    except Exception as e:
        result["error"] = str(e)
        return result

    # ── Provider + takeover ───────────────────────────────────────────────────
    result["provider"] = _detect_provider(result["CNAME"], result["A"])
    if result["CNAME"]:
        result["takeover"] = await _check_takeover(subdomain, result["CNAME"])

    # ── PTR + IP info ─────────────────────────────────────────────────────────
    if result["A"]:
        result["PTR"]     = await _ptr_lookup(result["A"])
        result["ip_info"] = await _ip_info(result["A"])

    # ── CAA + DNSSEC ─────────────────────────────────────────────────────────
    result["CAA"]    = await _get_caa(subdomain)
    result["dnssec"] = await _dnssec_status(domain)

    # ── Email security ────────────────────────────────────────────────────────
    result["spf"]             = _analyze_spf(result["TXT"])
    result["dmarc"]           = _analyze_dmarc(result["TXT"])
    result["txt_interesting"] = _interesting_txt(result["TXT"])

    # ── DoH comparison ────────────────────────────────────────────────────────
    result["doh_comparison"] = await _doh_compare(subdomain, result["A"])

    # ── Deep mode (slower) ────────────────────────────────────────────────────
    if deep:
        result["dkim"]         = await _check_dkim(domain)
        result["SRV"]          = await _get_srv(domain)
        result["zone_transfer"] = await _axfr(domain, result["NS"])
        result["propagation"]  = await _propagation_check(subdomain)

    return result


# ── Public API ────────────────────────────────────────────────────────────────

async def get_dns_records(
    subdomain: str,
    primary_domain: str = None,
    deep: bool = False,
) -> Dict:
    return await _resolve(subdomain, primary_domain=primary_domain, deep=deep)


async def get_dns_bulk(
    subdomains: List[str],
    primary_domain: str = None,
    max_concurrent: int = 20,
    deep: bool = False,
) -> Dict[str, Dict]:
    sem = asyncio.Semaphore(max_concurrent)

    async def _g(s):
        async with sem:
            return await _resolve(s, primary_domain=primary_domain, deep=deep)

    results = await asyncio.gather(*[_g(s) for s in subdomains])
    return {r["subdomain"]: r for r in results}