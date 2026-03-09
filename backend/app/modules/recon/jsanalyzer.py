# modules/recon/jsanalyzer.py
"""
JS File Analyzer — accurate, fast, deep:
  - High-precision secret detection (no false positives from validation strings)
  - Real endpoint extraction (filters out JS expressions, template literals, etc.)
  - Internal IP / hostname detection
  - Hardcoded domain detection
  - Interesting comments (TODO, FIXME, credentials, internal paths)
  - GraphQL query/mutation detection
  - Source map exposure detection
  - JWT token exposure
  - Cloud bucket / resource exposure
  - Deduplicated + scored results
  - Streaming progress via per-batch results
  - Parallel fetch with connection pooling (fast on 2000+ files)
"""
import asyncio
import hashlib
import re
import httpx
from typing import Dict, List, Set, Tuple
from urllib.parse import urlparse

# ── False-positive filters ────────────────────────────────────────────────────
# These patterns in the matched value indicate it's NOT a real secret

FP_VALUE_PATTERNS = [
    r'^[A-Z_]+$',                        # ALL_CAPS_CONSTANT like SOME_KEY
    r'^\$\{',                            # template literal ${VAR}
    r'^<',                               # HTML/template tags
    r'^\w+\s+\w+',                       # natural language like "Must be same"
    r'^[a-z]+\s',                        # sentence fragment
    r'^\s',                              # whitespace prefix
    r'[,;{}()\[\]]',                     # contains code punctuation
    r'^(true|false|null|undefined|none|NaN)$',
    r'^(your|my|the|this|that|enter|fill|example|sample|test|demo|replace|insert)[\s_-]',
    r'^(xxx+|yyy+|zzz+|aaa+|000+|111+)$',
    r'^(placeholder|changeme|secret_here|api_key_here|token_here|password_here)$',
    r'(validation|message|error|label|hint|help|description|tooltip)',
    r'^https?://',                       # URLs are not secrets
    r'^\d+$',                            # pure numbers
    r'^[a-f0-9]{8}-[a-f0-9]{4}',        # UUID (usually not secret)
]

FP_CONTEXT_PATTERNS = [
    r'(i18n|translation|locale|l10n|lang)',   # i18n strings
    r'(validation|validator|validate)',         # form validation
    r'(placeholder|label|title|tooltip)',       # UI strings
    r'(error_?message|err_?msg)',
    r'(display|render|format|parse)',
    r'(className|classList|style)',
]

PLACEHOLDER_VALUES = {
    "your_api_key", "xxx", "yyy", "placeholder", "example", "changeme",
    "your_token", "your_secret", "insert_key", "replace_me", "todo",
    "your_password", "enter_password", "password123", "test", "demo",
    "sample", "dummy", "fake", "mock", "null", "undefined", "none",
    "n/a", "na", "tbd", "fixme", "secret", "key", "token", "value",
    "string", "your_key_here", "api_key_here", "", "****", "----",
}

MIN_ENTROPY_THRESHOLD = 3.2  # bits per char — real secrets are high entropy

def _shannon_entropy(s: str) -> float:
    """Calculate Shannon entropy of a string."""
    if not s:
        return 0.0
    freq = {}
    for c in s:
        freq[c] = freq.get(c, 0) + 1
    length = len(s)
    import math
    return -sum((f / length) * math.log2(f / length) for f in freq.values())

def _is_false_positive(value: str, context: str, secret_type: str) -> bool:
    """Multi-layer false positive filter."""
    v = value.strip()

    # Empty or too short
    if len(v) < 6:
        return True

    # Known placeholder values
    if v.lower() in PLACEHOLDER_VALUES:
        return True

    # Value pattern checks
    for pat in FP_VALUE_PATTERNS:
        if re.search(pat, v, re.I):
            return True

    # Context checks (surrounding code suggests it's not a real secret)
    ctx = context.lower()
    for pat in FP_CONTEXT_PATTERNS:
        if re.search(pat, ctx, re.I):
            return True

    # For password/token/key types specifically, require high entropy
    if secret_type in ("Password", "Token", "API Key", "Secret Key", "Bearer Token"):
        entropy = _shannon_entropy(v)
        if entropy < MIN_ENTROPY_THRESHOLD:
            return True
        # If it looks like natural language (has spaces), skip
        if " " in v and not v.startswith("Bearer "):
            return True

    # Repeated characters like "aaaaaaaa"
    if len(set(v)) < 4 and len(v) > 8:
        return True

    return False


# ── Secret patterns (ordered by specificity — most specific first) ────────────

SECRET_PATTERNS: List[Tuple[str, str, str]] = [
    # AWS — very specific, low FP
    (r'(?<![A-Z0-9])(AKIA[A-Z0-9]{16})(?![A-Z0-9])',
     "AWS Access Key ID", "critical"),
    (r'(?i)aws[_-]?secret[_-]?(?:access[_-]?)?key\s*[:=]\s*["\']([A-Za-z0-9/+=]{40})["\']',
     "AWS Secret Access Key", "critical"),
    (r'(?i)aws[_-]?session[_-]?token\s*[:=]\s*["\']([A-Za-z0-9/+=]{100,})["\']',
     "AWS Session Token", "critical"),

    # Private Keys
    (r'-----BEGIN\s+(?:RSA\s+|EC\s+|DSA\s+|OPENSSH\s+)?PRIVATE\s+KEY(?:\s+BLOCK)?-----',
     "Private Key", "critical"),

    # GitHub tokens
    (r'github_pat_[A-Za-z0-9_]{82}',   "GitHub PAT",   "critical"),
    (r'ghp_[A-Za-z0-9]{36}',           "GitHub Token (classic)", "critical"),
    (r'gho_[A-Za-z0-9]{36}',           "GitHub OAuth Token", "critical"),
    (r'ghs_[A-Za-z0-9]{36}',           "GitHub App Token", "critical"),

    # Stripe — very specific format
    (r'\b(sk_live_[A-Za-z0-9]{24,})\b', "Stripe Live Secret Key", "critical"),
    (r'\b(rk_live_[A-Za-z0-9]{24,})\b', "Stripe Live Restricted Key", "critical"),
    (r'\b(sk_test_[A-Za-z0-9]{24,})\b', "Stripe Test Secret Key", "high"),
    (r'\b(pk_live_[A-Za-z0-9]{24,})\b', "Stripe Live Public Key", "medium"),
    (r'\b(pk_test_[A-Za-z0-9]{24,})\b', "Stripe Test Public Key", "low"),

    # Google
    (r'\b(AIza[0-9A-Za-z\-_]{35})\b',  "Google API Key", "high"),
    (r'\b(ya29\.[0-9A-Za-z\-_]+)\b',   "Google OAuth Token", "critical"),

    # Slack
    (r'\b(xox[baprs]-[0-9A-Za-z\-]{10,})\b', "Slack Token", "critical"),
    (r'https://hooks\.slack\.com/services/[A-Z0-9]+/[A-Z0-9]+/[A-Za-z0-9]+',
     "Slack Webhook", "high"),

    # Twilio
    (r'\b(AC[a-z0-9]{32})\b',          "Twilio Account SID", "high"),
    (r'(?i)twilio.*?auth.*?token.*?["\']([a-z0-9]{32})["\']', "Twilio Auth Token", "critical"),

    # SendGrid
    (r'\b(SG\.[A-Za-z0-9_\-]{22}\.[A-Za-z0-9_\-]{43})\b', "SendGrid API Key", "critical"),

    # JWT
    (r'\b(eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,})\b',
     "JWT Token", "high"),

    # Firebase
    (r'(?i)firebase.*?["\']([A-Za-z0-9_\-]{30,})["\']', "Firebase API Key", "high"),
    (r'https://[a-zA-Z0-9\-]+\.firebaseio\.com',         "Firebase Database URL", "medium"),

    # Database URIs — very specific
    (r'["\']mongodb(?:\+srv)?://[^"\']{10,}["\']',       "MongoDB URI", "critical"),
    (r'["\']postgres(?:ql)?://[^"\']{10,}["\']',         "PostgreSQL URI", "critical"),
    (r'["\']mysql://[^"\']{10,}["\']',                   "MySQL URI", "critical"),
    (r'["\']redis://[^"\']{10,}["\']',                   "Redis URI", "critical"),
    (r'["\']amqp://[^"\']{10,}["\']',                    "RabbitMQ URI", "high"),

    # Generic API keys — require high-entropy quoted values
    (r'(?i)\bapi[_-]?key\s*[:=]\s*["\']([A-Za-z0-9_\-]{20,64})["\']',
     "API Key", "high"),
    (r'(?i)\baccess[_-]?key\s*[:=]\s*["\']([A-Za-z0-9_\-]{20,64})["\']',
     "Access Key", "high"),
    (r'(?i)\bclient[_-]?secret\s*[:=]\s*["\']([A-Za-z0-9_\-]{20,64})["\']',
     "Client Secret", "high"),
    (r'(?i)\bprivate[_-]?key\s*[:=]\s*["\']([A-Za-z0-9_\-]{20,64})["\']',
     "Private Key Value", "high"),
    (r'(?i)\bsecret[_-]?key\s*[:=]\s*["\']([A-Za-z0-9_\-]{20,64})["\']',
     "Secret Key", "high"),

    # Auth tokens (not generic "token" to reduce FP)
    (r'(?i)\bauth[_-]?token\s*[:=]\s*["\']([A-Za-z0-9_.\-]{25,})["\']',
     "Auth Token", "high"),
    (r'(?i)\baccess[_-]?token\s*[:=]\s*["\']([A-Za-z0-9_.\-]{25,})["\']',
     "Access Token", "high"),
    (r'(?i)\bbearer\s+([A-Za-z0-9_.\-]{25,})',
     "Bearer Token", "high"),

    # Passwords — only high-entropy quoted values, NOT validation messages
    (r'(?i)\bpassword\s*[:=]\s*["\']([^"\']{8,64})["\']',
     "Hardcoded Password", "high"),

    # Mailchimp
    (r'\b([a-zA-Z0-9]{32}-us\d{1,2})\b', "Mailchimp API Key", "high"),

    # Heroku
    (r'(?i)heroku.*?["\']([0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12})["\']',
     "Heroku API Key", "critical"),

    # Cloudinary
    (r'cloudinary://[A-Za-z0-9]+:[A-Za-z0-9_\-]+@[A-Za-z0-9]+',
     "Cloudinary URL (with secret)", "high"),

    # Mapbox
    (r'\b(pk\.eyJ1[A-Za-z0-9_\-\.]+)\b', "Mapbox Token", "medium"),
    (r'\b(sk\.eyJ1[A-Za-z0-9_\-\.]+)\b', "Mapbox Secret Token", "critical"),

    # Telegram bot
    (r'\b(\d{8,10}:[A-Za-z0-9_\-]{35})\b', "Telegram Bot Token", "critical"),

    # Salesforce
    (r'(?i)salesforce.*?access.*?token.*?["\']([A-Za-z0-9!]{40,})["\']',
     "Salesforce Access Token", "critical"),

    # Generic high-entropy secrets in env-like assignments
    (r'(?i)(?:SECRET|PRIVATE|PASSWORD|PASSWD|PWD|AUTH|CRED)\s*[:=]\s*["\']([A-Za-z0-9+/=_\-]{24,})["\']',
     "High-Entropy Credential", "high"),
]

# ── Endpoint extraction (accurate) ───────────────────────────────────────────

# Patterns that reliably indicate real API paths
ENDPOINT_PATTERNS = [
    # Quoted full URLs
    r'["\']((https?://[^\s"\'<>]{10,200}))["\']',
    # Explicit fetch/axios/XHR calls
    r'(?:fetch|axios\.(?:get|post|put|patch|delete|head)\s*\()\s*["\']([^"\']{4,200})["\']',
    # url/endpoint/path/route assignment
    r'(?:url|endpoint|path|route|baseUrl|BASE_URL|API_URL|apiUrl|apiPath)\s*[:=]\s*["\']([^"\']{4,200})["\']',
    # /api/v1/... paths (strict: must start with / and have multiple segments)
    r'["\'](/(?:api|v\d|rest|graphql|auth|admin|internal|public|private|user|account|payment|webhook)[^\s"\'<>]{2,100})["\']',
    # template literal paths like `/api/${version}/users`
    r'`(/(?:api|v\d|rest|graphql|auth|admin|internal)[^`]{2,100})`',
    # Router definitions: router.get('/path', ...)
    r'(?:router|app)\.(?:get|post|put|delete|patch|all)\s*\(\s*["\']([^\s"\']{3,100})["\']',
]

# Patterns to EXCLUDE from endpoints (JS expressions, not real paths)
ENDPOINT_EXCLUDES = [
    r'^\+',                              # concatenation artifacts: + postUrl +
    r'^\)',                              # closing paren
    r'\.replace\(',                      # replace() calls
    r'encodeURI',                        # encoding functions
    r'\$\{',                             # template literals mid-string
    r'^[a-zA-Z_$][a-zA-Z0-9_$]*\s*\+', # variable + string
    r'^\w+,\s',                          # comma-separated args
    r'^\w+\.\w+\(',                     # method calls
    r'^https?://[^\s]{200,}',           # suspiciously long URLs
    r'\s{2,}',                           # contains whitespace runs (prose)
    r'[<>{}\\]',                         # HTML or template syntax
    r'^[\d.]+$',                         # pure numbers
    r'^(true|false|null|undefined)$',
    r'\*\*|\|\||&&',                     # operators
    r'^[^/].*[^a-zA-Z0-9_\-/.?=&%@#]$', # ends in unusual char (not a path)
]

def _is_valid_endpoint(ep: str) -> bool:
    ep = ep.strip()
    if len(ep) < 3 or len(ep) > 250:
        return False
    for pat in ENDPOINT_EXCLUDES:
        if re.search(pat, ep):
            return False
    # Must look like an actual path or URL
    if ep.startswith("/"):
        # Internal path — must have at least one letter after the slash
        return bool(re.match(r'^/[a-zA-Z]', ep))
    if ep.startswith("http"):
        return True
    return False

# ── Other detection patterns ──────────────────────────────────────────────────

INTERNAL_IP_RE = re.compile(
    r'\b((?:10|127)\.\d{1,3}\.\d{1,3}\.\d{1,3}'
    r'|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}'
    r'|192\.168\.\d{1,3}\.\d{1,3}'
    r'|0\.0\.0\.0'
    r'|localhost)\b'
)

INTERNAL_HOST_RE = re.compile(
    r'["\']([a-z0-9\-]+\.(?:internal|local|corp|intranet|priv|private|lan|home|dev|staging|int)(?:\.[a-z]{2,6})?)["\']',
    re.I
)

CLOUD_BUCKET_RE = re.compile(
    r'(s3://[a-z0-9\-\.]+|'
    r'https://[a-z0-9\-\.]+\.s3[.\-][a-z0-9\-]+\.amazonaws\.com[^"\'<>\s]*|'
    r'https://[a-z0-9\-]+\.blob\.core\.windows\.net[^"\'<>\s]*|'
    r'https://storage\.googleapis\.com/[a-z0-9\-\.]+[^"\'<>\s]*)',
    re.I
)

GRAPHQL_RE = re.compile(
    r'(query\s+\w+\s*\{[^}]{10,200}\}|mutation\s+\w+\s*[\({][^}]{10,200}\})',
    re.S
)

SOURCE_MAP_RE = re.compile(
    r'//[#@]\s*sourceMappingURL\s*=\s*([^\s]+\.map)'
)

INTERESTING_COMMENT_RE = re.compile(
    r'(?://[^\n]*(?:todo|fixme|hack|password|secret|key|token|credential|auth|login|admin|internal|debug|remove|temp|deprecated)[^\n]*'
    r'|/\*[^*]*(?:todo|fixme|hack|password|secret|key|token|credential|auth|login|admin|internal|debug)[^*]*\*/)',
    re.I
)

HARDCODED_DOMAIN_RE = re.compile(
    r'["\']([a-z0-9\-\.]+\.(?:internal|corp|priv|dev|staging|uat|qa|test)\.[a-z]{2,6})["\']',
    re.I
)

# ── JS fetch + analysis ───────────────────────────────────────────────────────

async def _fetch_js(client: httpx.AsyncClient, url: str) -> Tuple[str, int]:
    """Returns (content, size_bytes). Empty string on failure."""
    try:
        resp = await client.get(url)
        if resp.status_code != 200:
            return "", 0
        # Accept anything that looks like JS — servers often misconfigure content-type
        ct = resp.headers.get("content-type", "")
        url_lower = url.lower().split("?")[0]
        is_js_url = url_lower.endswith(".js") or url_lower.endswith(".mjs")
        is_js_ct  = any(t in ct for t in ("javascript", "ecmascript", "text/plain", "application/json"))
        if not is_js_url and not is_js_ct:
            return "", 0
        # Skip binary/image/font responses even if URL ends in .js (misconfigured)
        if any(t in ct for t in ("image/", "font/", "audio/", "video/", "application/zip")):
            return "", 0
        raw = resp.content
        if len(raw) < 50:          # skip near-empty files
            return "", 0
        if len(raw) > 800_000:     # cap at 800KB
            raw = raw[:800_000]
        content = raw.decode("utf-8", errors="ignore")
        return content, len(resp.content)
    except Exception:
        return "", 0


def _analyze_js_content(content: str, url: str) -> Dict:
    endpoints:    Set[str] = set()
    secrets:      list     = []
    internal_ips: Set[str] = set()
    internal_hosts: Set[str] = set()
    cloud_buckets: Set[str] = set()
    graphql_ops:  list     = []
    source_maps:  list     = []
    comments:     list     = []
    hardcoded_domains: Set[str] = set()

    # ── Endpoints ─────────────────────────────────────────────────────────────
    for pattern in ENDPOINT_PATTERNS:
        for m in re.finditer(pattern, content, re.I):
            try:
                ep = m.group(1)
            except IndexError:
                ep = m.group(0)
            ep = ep.strip()
            if _is_valid_endpoint(ep):
                endpoints.add(ep)

    # ── Secrets ───────────────────────────────────────────────────────────────
    seen_values: Set[str] = set()
    for pattern, label, severity in SECRET_PATTERNS:
        for m in re.finditer(pattern, content, re.I | re.S):
            try:
                val = m.group(1).strip()
            except IndexError:
                val = m.group(0).strip()

            # Dedup
            val_key = hashlib.md5(val.encode()).hexdigest()
            if val_key in seen_values:
                continue

            context = content[max(0, m.start() - 60): m.end() + 60].strip()
            context = re.sub(r'\s+', ' ', context)

            if _is_false_positive(val, context, label):
                continue

            seen_values.add(val_key)
            secrets.append({
                "type":     label,
                "severity": severity,
                "value":    val[:80] + ("…" if len(val) > 80 else ""),
                "context":  context[:200],
                "url":      url,
            })

    # ── Internal IPs ──────────────────────────────────────────────────────────
    for m in INTERNAL_IP_RE.finditer(content):
        internal_ips.add(m.group(1))

    # ── Internal hostnames ────────────────────────────────────────────────────
    for m in INTERNAL_HOST_RE.finditer(content):
        internal_hosts.add(m.group(1))

    # ── Hardcoded domains ─────────────────────────────────────────────────────
    for m in HARDCODED_DOMAIN_RE.finditer(content):
        hardcoded_domains.add(m.group(1))

    # ── Cloud buckets ─────────────────────────────────────────────────────────
    for m in CLOUD_BUCKET_RE.finditer(content):
        cloud_buckets.add(m.group(0)[:200])

    # ── GraphQL operations ────────────────────────────────────────────────────
    for m in GRAPHQL_RE.finditer(content):
        op = re.sub(r'\s+', ' ', m.group(0)).strip()
        graphql_ops.append(op[:300])

    # ── Source maps ───────────────────────────────────────────────────────────
    for m in SOURCE_MAP_RE.finditer(content):
        source_maps.append(m.group(1))

    # ── Interesting comments ──────────────────────────────────────────────────
    for m in INTERESTING_COMMENT_RE.finditer(content):
        c = re.sub(r'\s+', ' ', m.group(0)).strip()
        if len(c) > 15:
            comments.append(c[:300])

    return {
        "url":               url,
        "endpoints":         sorted(endpoints)[:300],
        "secrets":           secrets[:30],
        "internal_ips":      sorted(internal_ips),
        "internal_hosts":    sorted(internal_hosts),
        "cloud_buckets":     sorted(cloud_buckets),
        "graphql_ops":       graphql_ops[:20],
        "source_maps":       source_maps,
        "comments":          comments[:20],
        "hardcoded_domains": sorted(hardcoded_domains),
        "size_bytes":        0,  # filled by caller
    }


# ── Main API ──────────────────────────────────────────────────────────────────

async def analyze_js_files(
    js_urls: List[str],
    max_concurrent: int = 30,       # parallel fetches
    max_files: int = 1000,          # cap to prevent 2h runs
    progress_callback=None,         # async callable(done, total) for streaming
) -> Dict:
    """
    Analyze JS files for secrets, endpoints, and other intelligence.
    - Deduplicates by URL content hash (skips identical bundles)
    - Capped at max_files to bound runtime
    - Progress callback for streaming updates
    """
    # Deduplicate URLs first
    seen_urls: Set[str] = set()
    unique_urls = []
    for u in js_urls:
        norm = u.split("?")[0]  # strip query params for dedup
        if norm not in seen_urls:
            seen_urls.add(norm)
            unique_urls.append(u)

    # ── Skip vendor/CDN files that never contain secrets ─────────────────────
    VENDOR_SKIP = re.compile(
        r'/(?:jquery|react(?:-dom)?|vue|angular|lodash|bootstrap|moment|axios|'
        r'polyfill|core-js|regenerator|zone\.js|rxjs|tslib|'
        r'material|fontawesome|chart\.js|d3\.min|three\.min|'
        r'vendor\.|vendors\.|runtime\.|commons\.|framework\.)[^/]*\.js(?:\?|$)',
        re.I
    )
    CDN_SKIP = re.compile(r'(?:unpkg\.com|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net)', re.I)

    filtered_urls = [u for u in unique_urls if not VENDOR_SKIP.search(u) and not CDN_SKIP.search(u)]
    if len(filtered_urls) < 20 and len(unique_urls) > len(filtered_urls):
        filtered_urls = unique_urls  # don't over-filter small crawls

    urls_to_process = filtered_urls[:max_files]
    total = len(urls_to_process)

    # ── ONE shared client for all requests (key performance fix) ─────────────
    limits = httpx.Limits(
        max_connections=max_concurrent,
        max_keepalive_connections=max_concurrent,
        keepalive_expiry=30,
    )
    shared_client = httpx.AsyncClient(
        follow_redirects=True,
        timeout=httpx.Timeout(connect=5.0, read=10.0, write=5.0, pool=3.0),
        verify=False,
        limits=limits,
    )

    sem = asyncio.Semaphore(max_concurrent)
    all_endpoints:    Set[str] = set()
    all_secrets:      list     = []
    all_ips:          Set[str] = set()
    all_hosts:        Set[str] = set()
    all_buckets:      Set[str] = set()
    all_graphql:      list     = []
    all_source_maps:  list     = []
    all_comments:     list     = []
    all_domains:      Set[str] = set()
    files_analyzed   = 0
    content_hashes:  Set[str] = set()
    done = 0

    async def _process(url: str):
        nonlocal files_analyzed, done
        async with sem:
            cnt, size = await _fetch_js(shared_client, url)

        done += 1
        if progress_callback:
            await progress_callback(done, total)

        if not cnt:
            return

        # Skip identical content (same bundle on multiple CDN paths)
        h = hashlib.md5(cnt[:8192].encode()).hexdigest()
        if h in content_hashes:
            return
        content_hashes.add(h)

        # Run CPU-bound regex in executor so it doesn't block event loop
        loop = asyncio.get_event_loop()
        r = await loop.run_in_executor(None, _analyze_js_content, cnt, url)
        r["size_bytes"] = size
        files_analyzed += 1

        all_endpoints.update(r["endpoints"])
        all_secrets.extend(r["secrets"])
        all_ips.update(r["internal_ips"])
        all_hosts.update(r["internal_hosts"])
        all_buckets.update(r["cloud_buckets"])
        all_graphql.extend(r["graphql_ops"])
        all_source_maps.extend(r["source_maps"])
        all_comments.extend(r["comments"])
        all_domains.update(r["hardcoded_domains"])

    try:
        await asyncio.gather(*[_process(u) for u in urls_to_process])
    finally:
        await shared_client.aclose()

    # Deduplicate secrets by value fingerprint
    seen_secret_vals: Set[str] = set()
    deduped_secrets = []
    for s in all_secrets:
        k = hashlib.md5(s["value"].encode()).hexdigest()
        if k not in seen_secret_vals:
            seen_secret_vals.add(k)
            deduped_secrets.append(s)

    # Sort secrets by severity
    sev_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    deduped_secrets.sort(key=lambda s: sev_order.get(s.get("severity", "medium"), 2))

    return {
        "files_total":      total,
        "files_skipped":    total - len(urls_to_process),
        "files_analyzed":   files_analyzed,
        "files_deduped":    len(urls_to_process) - files_analyzed,
        "total_endpoints":  len(all_endpoints),
        "total_secrets":    len(deduped_secrets),
        "all_endpoints":    sorted(all_endpoints)[:1000],
        "all_secrets":      deduped_secrets[:200],
        "internal_ips":     sorted(all_ips),
        "internal_hosts":   sorted(all_hosts),
        "cloud_buckets":    sorted(all_buckets),
        "graphql_ops":      list(dict.fromkeys(all_graphql))[:50],
        "source_maps":      list(dict.fromkeys(all_source_maps))[:50],
        "interesting_comments": list(dict.fromkeys(all_comments))[:50],
        "hardcoded_domains": sorted(all_domains),
    }