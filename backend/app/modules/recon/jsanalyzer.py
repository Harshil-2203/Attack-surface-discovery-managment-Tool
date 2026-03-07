# modules/recon/jsanalyzer.py
"""
JS File Analyzer — fetch JS files and extract:
- API endpoints / paths
- Hardcoded secrets (API keys, tokens, passwords)
- Internal domains / IPs
- Interesting function names and comments
"""
import asyncio
import re
import httpx
from typing import Dict, List, Set
from urllib.parse import urljoin, urlparse

# ── Secret patterns ───────────────────────────────────────────────────────────
SECRET_PATTERNS = [
    (r'(?i)(api[_-]?key|apikey)\s*[:=]\s*["\']([A-Za-z0-9_\-]{16,})["\']',           "API Key"),
    (r'(?i)(secret[_-]?key|secret)\s*[:=]\s*["\']([A-Za-z0-9_\-]{16,})["\']',        "Secret Key"),
    (r'(?i)(password|passwd|pwd)\s*[:=]\s*["\']([^"\']{6,})["\']',                    "Password"),
    (r'(?i)(token|auth[_-]?token|access[_-]?token)\s*[:=]\s*["\']([A-Za-z0-9_.\-]{20,})["\']', "Token"),
    (r'(?i)(aws[_-]?access[_-]?key[_-]?id)\s*[:=]\s*["\']([A-Z0-9]{20})["\']',       "AWS Access Key"),
    (r'(?i)(aws[_-]?secret)\s*[:=]\s*["\']([A-Za-z0-9/+=]{40})["\']',                "AWS Secret"),
    (r'AIza[0-9A-Za-z\-_]{35}',                                                        "Google API Key"),
    (r'(?i)(stripe[_-]?(?:pub|secret|live|test)[_-]?key)\s*[:=]\s*["\']([a-z]{2,4}_[A-Za-z0-9]{24,})["\']', "Stripe Key"),
    (r'github_pat_[A-Za-z0-9_]{82}',                                                   "GitHub PAT"),
    (r'ghp_[A-Za-z0-9]{36}',                                                           "GitHub Token"),
    (r'(?i)(bearer|authorization)\s*[:=]\s*["\']([A-Za-z0-9._\-]{30,})["\']',        "Bearer Token"),
    (r'-----BEGIN (?:RSA |EC )?PRIVATE KEY-----',                                      "Private Key"),
    (r'(?i)(firebase[_-]?api[_-]?key)\s*[:=]\s*["\']([A-Za-z0-9_\-]{30,})["\']',    "Firebase Key"),
    (r'["\']mongodb(?:\+srv)?://[^\s"\']+["\']',                                       "MongoDB URI"),
    (r'["\']postgres(?:ql)?://[^\s"\']+["\']',                                         "PostgreSQL URI"),
    (r'["\']redis://[^\s"\']+["\']',                                                   "Redis URI"),
]

# ── Endpoint patterns ─────────────────────────────────────────────────────────
ENDPOINT_PATTERNS = [
    r'["\'](/api/v\d[^\s"\'<>]*)["\']',
    r'["\'](/v\d/[^\s"\'<>]*)["\']',
    r'["\']([/][a-z][a-z0-9_\-/]{3,60})["\']',
    r'(?:fetch|axios\.(?:get|post|put|delete|patch))\s*\(\s*["\']([^"\']+)["\']',
    r'(?:url|endpoint|baseURL|BASE_URL)\s*[:=]\s*["\']([^"\']{5,100})["\']',
]

INTERNAL_IP_PATTERN = re.compile(
    r'\b(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|localhost)\b'
)

async def _fetch_js(client: httpx.AsyncClient, url: str) -> str:
    try:
        resp = await client.get(url, timeout=10)
        if resp.status_code == 200 and "javascript" in resp.headers.get("content-type", ""):
            return resp.text[:500_000]  # cap 500KB
        return ""
    except Exception:
        return ""

def _analyze_js_content(content: str, base_url: str) -> Dict:
    endpoints: Set[str] = set()
    secrets   = []
    ips       = set()

    # Endpoints
    for pattern in ENDPOINT_PATTERNS:
        for m in re.finditer(pattern, content, re.IGNORECASE):
            ep = m.group(1)
            if len(ep) > 3 and not ep.startswith("//") and ep not in ("/", "//"):
                endpoints.add(ep)

    # Secrets
    for pattern, label in SECRET_PATTERNS:
        for m in re.finditer(pattern, content):
            val = m.group(0)
            # Try to get just the value group if available
            try: val = m.group(2)
            except IndexError: pass
            # Skip obvious placeholders
            if val.lower() in ("your_api_key", "xxx", "placeholder", "example", "changeme"):
                continue
            secrets.append({"type": label, "value": val[:60] + ("…" if len(val) > 60 else ""), "context": content[max(0,m.start()-40):m.end()+40].strip()})

    # Internal IPs
    ips = set(INTERNAL_IP_PATTERN.findall(content))

    return {
        "url":       base_url,
        "endpoints": sorted(endpoints)[:200],
        "secrets":   secrets[:50],
        "internal_ips": list(ips),
    }

async def analyze_js_files(js_urls: List[str]) -> Dict:
    """
    Given a list of JS file URLs (e.g. from a crawl),
    fetch and analyze each one.
    """
    sem = asyncio.Semaphore(10)
    results = []
    total_endpoints = set()
    total_secrets   = []

    async def _process(url):
        async with sem:
            async with httpx.AsyncClient(follow_redirects=True) as client:
                content = await _fetch_js(client, url)
                if content:
                    r = _analyze_js_content(content, url)
                    results.append(r)
                    total_endpoints.update(r["endpoints"])
                    total_secrets.extend(r["secrets"])

    await asyncio.gather(*[_process(u) for u in js_urls])

    return {
        "files_analyzed": len(results),
        "total_endpoints": len(total_endpoints),
        "total_secrets":   len(total_secrets),
        "all_endpoints":   sorted(total_endpoints)[:500],
        "all_secrets":     total_secrets[:100],
        "per_file":        results,
    }