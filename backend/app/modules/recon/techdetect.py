# modules/recon/techdetect.py
"""
Technology Detector — deep fingerprinting with version extraction + ExploitDB lookup.
Detects CMS, frameworks, servers, analytics via HTTP headers, HTML, cookies, meta tags,
script src attributes, and JS variable patterns.
"""
import asyncio
import httpx
import re
import json
from typing import Dict, List, Optional

# ── Version extraction patterns ───────────────────────────────────────────────
VERSION_PATTERNS = {
    "WordPress": [
        r'<meta name="generator" content="WordPress ([0-9.]+)"',
        r'wp-includes/js/wp-emoji-release\.min\.js\?ver=([0-9.]+)',
        r'\?ver=([0-9.]+)"[^>]+wp-content',
    ],
    "Joomla": [
        r'<meta name="generator" content="Joomla! ([0-9.]+)"',
        r'/media/jui/js/jquery\.min\.js\?([0-9.]+)',
    ],
    "Drupal": [
        r'<meta name="generator" content="Drupal ([0-9.]+)"',
        r'Drupal\.settings.*?"version":"([0-9.]+)"',
        r'drupal\.js\?([a-z0-9]+)',
    ],
    "jQuery": [
        r'jquery[.-]([0-9]+\.[0-9]+\.?[0-9]*)(?:\.min)?\.js',
        r'jQuery v([0-9]+\.[0-9]+\.?[0-9]*)',
        r'"jquery":"([0-9]+\.[0-9]+\.?[0-9]*)"',
    ],
    "Bootstrap": [
        r'bootstrap[.-]([0-9]+\.[0-9]+\.?[0-9]*)(?:\.min)?\.(?:js|css)',
        r'Bootstrap v([0-9]+\.[0-9]+\.?[0-9]*)',
    ],
    "React": [
        r'react[.-]([0-9]+\.[0-9]+\.?[0-9]*)(?:\.min)?\.js',
        r'"react":"([0-9]+\.[0-9]+\.?[0-9]*)"',
        r'React\.version\s*=\s*["\']([0-9.]+)',
    ],
    "Vue.js": [
        r'vue[.-]([0-9]+\.[0-9]+\.?[0-9]*)(?:\.min)?\.js',
        r'Vue\.version\s*=\s*["\']([0-9.]+)',
        r'"vue":"([0-9]+\.[0-9]+\.?[0-9]*)"',
    ],
    "Angular": [
        r'ng-version="([0-9.]+)"',
        r'angular[.-]([0-9]+\.[0-9]+\.?[0-9]*)(?:\.min)?\.js',
    ],
    "Next.js": [
        r'"version":"([0-9.]+)".*?"framework":"next"',
        r'/_next/static/chunks/.*?-([0-9a-f]{8,})',
        r'"buildId":"([^"]+)"',
    ],
    "Nginx": [
        r'nginx/([0-9]+\.[0-9]+\.?[0-9]*)',
    ],
    "Apache": [
        r'Apache/([0-9]+\.[0-9]+\.?[0-9]*)',
    ],
    "IIS": [
        r'Microsoft-IIS/([0-9.]+)',
    ],
    "PHP": [
        r'PHP/([0-9]+\.[0-9]+\.?[0-9]*)',
        r'X-Powered-By: PHP/([0-9]+\.[0-9]+\.?[0-9]*)',
    ],
    "ASP.NET": [
        r'ASP\.NET Version:([0-9.]+)',
        r'X-AspNet-Version: ([0-9.]+)',
    ],
    "OpenSSL": [
        r'OpenSSL/([0-9]+\.[0-9]+\.?[0-9]*[a-z]?)',
    ],
    "Shopify": [
        r'Shopify\.theme.*?"version":"([0-9.]+)"',
    ],
    "Magento": [
        r'Magento/([0-9]+\.[0-9]+\.?[0-9]*)',
        r'"version":"([0-9.]+)".*?magento',
    ],
    "PrestaShop": [
        r'PrestaShop ([0-9.]+)',
    ],
    "Ghost": [
        r'"version":"([0-9.]+)".*?ghost',
        r'/ghost/api/v([0-9.]+)/',
    ],
    "Cloudflare": [
        r'cloudflare/([0-9.]+)',
    ],
    "Node.js": [
        r'node\.js/([0-9]+\.[0-9]+\.?[0-9]*)',
        r'Express/([0-9]+\.[0-9]+\.?[0-9]*)',
    ],
    "Ruby on Rails": [
        r'Rails/([0-9]+\.[0-9]+\.?[0-9]*)',
    ],
    "Django": [
        r'Django/([0-9]+\.[0-9]+\.?[0-9]*)',
    ],
    "Laravel": [
        r'laravel[_-]session',
        r'"laravel":"([0-9.]+)"',
    ],
    "Spring": [
        r'Spring[- ]Framework[/ ]([0-9.]+)',
    ],
    "Webpack": [
        r'webpackJsonp.*?([0-9]+\.[0-9]+\.?[0-9]*)',
        r'"webpack":"([0-9.]+)"',
    ],
    "Lodash": [
        r'lodash[.-]([0-9]+\.[0-9]+\.?[0-9]*)(?:\.min)?\.js',
        r'lodash[._]VERSION\s*=\s*["\']([0-9.]+)',
    ],
}

# ── Signature database ────────────────────────────────────────────────────────
SIGNATURES = {
    # CMS
    "WordPress":      {"headers": {"x-powered-by": "wordpress"}, "html": [r"wp-content/", r"wp-includes/"], "cookies": ["wordpress_"]},
    "Joomla":         {"html": [r"/components/com_", r"Joomla!"]},
    "Drupal":         {"headers": {"x-generator": "drupal"}, "html": [r"sites/default/files", r"Drupal\.settings"]},
    "Shopify":        {"html": [r"cdn\.shopify\.com", r"Shopify\.shop"], "cookies": ["_shopify_"]},
    "Wix":            {"html": [r"static\.wixstatic\.com", r"wixsite\.com"]},
    "Squarespace":    {"html": [r"squarespace\.com", r"static1\.squarespace"]},
    "Magento":        {"html": [r"Mage\.Cookies", r"/skin/frontend/"], "cookies": ["frontend"]},
    "PrestaShop":     {"html": [r"prestashop", r"/themes/default-bootstrap/"]},
    "Ghost":          {"html": [r"ghost\.io", r"/ghost/api/"]},
    "Webflow":        {"html": [r"webflow\.com", r"wf-form"]},
    "TYPO3":          {"html": [r"typo3", r"/typo3conf/ext/"]},
    "Craft CMS":      {"html": [r"craft-csrf-token", r"craftcms"]},
    "OpenCart":       {"html": [r"opencart", r"catalog/view/theme"]},
    "osCommerce":     {"html": [r"oscommerce", r"osCsid"]},
    "Concrete5":      {"html": [r"concrete5", r"ccm__core"]},
    "ModX":           {"html": [r"modx", r"assets/components/"]},

    # JS Frameworks
    "React":          {"html": [r"react(?:\.min)?\.js", r"__REACT_", r"data-reactroot", r"data-reactid"]},
    "Vue.js":         {"html": [r"vue(?:\.min)?\.js", r"__vue__", r"v-bind:", r"v-model="]},
    "Angular":        {"html": [r"angular(?:\.min)?\.js", r"ng-version", r"ng-app", r"ng-controller"]},
    "Next.js":        {"html": [r"__NEXT_DATA__", r"/_next/static/"]},
    "Nuxt.js":        {"html": [r"__NUXT__", r"/_nuxt/"]},
    "Svelte":         {"html": [r"__svelte", r"svelte-"]},
    "Ember.js":       {"html": [r"ember(?:\.min)?\.js", r"Ember\.Application"]},
    "Backbone.js":    {"html": [r"backbone(?:\.min)?\.js", r"Backbone\.View"]},
    "jQuery":         {"html": [r"jquery(?:\.min)?\.js", r"jQuery\.fn\.jquery", r"\$\.ajax\("]},
    "jQuery UI":      {"html": [r"jquery-ui(?:\.min)?\.(?:js|css)", r"ui-widget"]},
    "Bootstrap":      {"html": [r"bootstrap(?:\.min)?\.(?:js|css)", r"class=\"container\""]},
    "Tailwind CSS":   {"html": [r"tailwind(?:\.min)?\.css", r"class=\"[^\"]*(?:flex|grid|px-|py-|text-)[^\"]*\""]},
    "Lodash":         {"html": [r"lodash(?:\.min)?\.js", r"_\.cloneDeep", r"_\.merge\("]},
    "Webpack":        {"html": [r"webpackJsonp", r"__webpack_require__"]},
    "Axios":          {"html": [r"axios(?:\.min)?\.js", r"axios\.get\(", r"axios\.post\("]},

    # Backend Frameworks
    "Laravel":        {"cookies": ["laravel_session"], "html": [r"laravel", r"csrf-token.*laravel"]},
    "Django":         {"cookies": ["csrftoken", "sessionid"], "headers": {"x-frame-options": "sameorigin"}, "html": [r"django", r"csrfmiddlewaretoken"]},
    "Ruby on Rails":  {"headers": {"x-runtime": ""}, "cookies": ["_session_id"], "html": [r"csrf-param.*authenticity_token"]},
    "Spring":         {"headers": {"x-application-context": ""}, "cookies": ["jsessionid"], "html": [r"Spring Framework"]},
    "Flask":          {"html": [r"werkzeug", r"Flask"], "cookies": ["session"]},
    "FastAPI":        {"headers": {"x-process-time": ""}, "html": [r"FastAPI", r"openapi\.json"]},
    "Symfony":        {"html": [r"symfony", r"_token.*sf_"], "cookies": ["symfony"]},
    "CodeIgniter":    {"cookies": ["ci_session"], "html": [r"CodeIgniter"]},
    "CakePHP":        {"cookies": ["CAKEPHP"], "html": [r"CakePHP"]},
    "Yii":            {"cookies": ["PHPSESSID"], "html": [r"yii", r"yiiactiveform"]},

    # Web Servers & Infra
    "Nginx":          {"headers": {"server": "nginx"}},
    "Apache":         {"headers": {"server": "apache"}},
    "IIS":            {"headers": {"server": "microsoft-iis"}},
    "LiteSpeed":      {"headers": {"server": "litespeed", "x-litespeed-cache": ""}},
    "Caddy":          {"headers": {"server": "caddy"}},
    "OpenResty":      {"headers": {"server": "openresty"}},
    "Gunicorn":       {"headers": {"server": "gunicorn"}},
    "Tomcat":         {"headers": {"server": "apache-coyote"}, "cookies": ["jsessionid"]},

    # CDN / Security / Hosting
    "Cloudflare":     {"headers": {"server": "cloudflare", "cf-ray": ""}},
    "AWS CloudFront": {"headers": {"x-amz-cf-id": ""}},
    "AWS S3":         {"headers": {"x-amz-request-id": ""}},
    "Fastly":         {"headers": {"x-served-by": "cache-", "fastly-restarts": ""}},
    "Vercel":         {"headers": {"x-vercel-id": ""}},
    "Netlify":        {"headers": {"x-nf-request-id": ""}},
    "GitHub Pages":   {"headers": {"server": "github.com"}},
    "Akamai":         {"headers": {"x-akamai-transformed": "", "x-check-cacheable": ""}},
    "Sucuri":         {"headers": {"x-sucuri-id": "", "server": "sucuri"}},
    "Imperva":        {"headers": {"x-iinfo": ""}},
    "AWS WAF":        {"headers": {"x-amzn-requestid": ""}},

    # Languages
    "PHP":            {"headers": {"x-powered-by": "php"}},
    "ASP.NET":        {"headers": {"x-powered-by": "asp.net", "x-aspnet-version": ""}},
    "Node.js":        {"headers": {"x-powered-by": "express"}},
    "Java":           {"headers": {"x-powered-by": "servlet"}, "cookies": ["jsessionid"]},
    "ColdFusion":     {"headers": {"x-powered-by": "coldfusion"}, "cookies": ["cfid", "cftoken"]},
    "Perl":           {"headers": {"x-powered-by": "perl"}},

    # Analytics / Marketing
    "Google Analytics":    {"html": [r"google-analytics\.com/analytics\.js", r"gtag\(", r"UA-\d{4,}-\d", r"G-[A-Z0-9]{10}"]},
    "Google Tag Manager":  {"html": [r"googletagmanager\.com/gtm\.js", r"GTM-[A-Z0-9]+"]},
    "HubSpot":             {"html": [r"js\.hsforms\.net", r"hubspot\.com", r"hs-analytics"]},
    "Intercom":            {"html": [r"intercom\.io", r"Intercom\("]},
    "Hotjar":              {"html": [r"hotjar\.com", r"hj\(", r"_hjSettings"]},
    "Segment":             {"html": [r"segment\.com/analytics\.js", r"analytics\.identify\("]},
    "Mixpanel":            {"html": [r"mixpanel\.com", r"mixpanel\.track\("]},
    "Amplitude":           {"html": [r"amplitude\.com", r"amplitude\.getInstance\("]},
    "Facebook Pixel":      {"html": [r"connect\.facebook\.net/.*?/fbevents\.js", r"fbq\("]},
    "LinkedIn Insight":    {"html": [r"snap\.licdn\.com", r"_linkedin_data_partner_id"]},
    "Twitter/X Pixel":     {"html": [r"static\.ads-twitter\.com", r"twq\("]},
    "TikTok Pixel":        {"html": [r"analytics\.tiktok\.com", r"ttq\.track\("]},
    "Crisp Chat":          {"html": [r"client\.crisp\.chat"]},
    "Drift":               {"html": [r"js\.drift\.com"]},
    "Zendesk":             {"html": [r"static\.zdassets\.com", r"zopim"]},
    "Freshdesk":           {"html": [r"freshdesk\.com", r"freshchat"]},
    "Tawk.to":             {"html": [r"tawk\.to"]},

    # Payment
    "Stripe":              {"html": [r"js\.stripe\.com", r"Stripe\("]},
    "PayPal":              {"html": [r"paypalobjects\.com", r"paypal\.Buttons"]},
    "Braintree":           {"html": [r"js\.braintreegateway\.com"]},
    "Razorpay":            {"html": [r"checkout\.razorpay\.com"]},

    # Security Features
    "reCAPTCHA":           {"html": [r"google\.com/recaptcha", r"grecaptcha"]},
    "Cloudflare Turnstile":{"html": [r"challenges\.cloudflare\.com/turnstile"]},
    "hCaptcha":            {"html": [r"hcaptcha\.com"]},

    # Other detectable
    "GraphQL":             {"html": [r"__typename", r"/graphql", r"GraphQLSchema"]},
    "Elasticsearch":       {"headers": {"x-elastic-product": ""}},
    "Varnish":             {"headers": {"x-varnish": "", "via": "varnish"}},
}

CATEGORIES = {
    "WordPress": "CMS", "Joomla": "CMS", "Drupal": "CMS", "Shopify": "CMS",
    "Wix": "CMS", "Squarespace": "CMS", "Magento": "CMS", "PrestaShop": "CMS",
    "Ghost": "CMS", "Webflow": "CMS", "TYPO3": "CMS", "Craft CMS": "CMS",
    "OpenCart": "CMS", "osCommerce": "CMS", "Concrete5": "CMS", "ModX": "CMS",
    "React": "Frontend Framework", "Vue.js": "Frontend Framework",
    "Angular": "Frontend Framework", "Next.js": "Frontend Framework",
    "Nuxt.js": "Frontend Framework", "Svelte": "Frontend Framework",
    "Ember.js": "Frontend Framework", "Backbone.js": "Frontend Framework",
    "jQuery": "JavaScript Library", "jQuery UI": "JavaScript Library",
    "Lodash": "JavaScript Library", "Axios": "JavaScript Library",
    "Bootstrap": "CSS Framework", "Tailwind CSS": "CSS Framework",
    "Webpack": "Build Tool",
    "Laravel": "Backend Framework", "Django": "Backend Framework",
    "Ruby on Rails": "Backend Framework", "Spring": "Backend Framework",
    "Flask": "Backend Framework", "FastAPI": "Backend Framework",
    "Symfony": "Backend Framework", "CodeIgniter": "Backend Framework",
    "CakePHP": "Backend Framework", "Yii": "Backend Framework",
    "Nginx": "Web Server", "Apache": "Web Server", "IIS": "Web Server",
    "LiteSpeed": "Web Server", "Caddy": "Web Server",
    "OpenResty": "Web Server", "Gunicorn": "Web Server", "Tomcat": "Web Server",
    "Cloudflare": "CDN/Security", "AWS CloudFront": "CDN", "AWS S3": "Storage",
    "Fastly": "CDN", "Vercel": "Hosting", "Netlify": "Hosting",
    "GitHub Pages": "Hosting", "Akamai": "CDN",
    "Sucuri": "WAF", "Imperva": "WAF", "AWS WAF": "WAF",
    "PHP": "Language", "ASP.NET": "Language", "Node.js": "Language",
    "Java": "Language", "ColdFusion": "Language", "Perl": "Language",
    "Google Analytics": "Analytics", "Google Tag Manager": "Analytics",
    "HubSpot": "Marketing", "Intercom": "Support", "Hotjar": "Analytics",
    "Segment": "Analytics", "Mixpanel": "Analytics", "Amplitude": "Analytics",
    "Facebook Pixel": "Marketing", "LinkedIn Insight": "Marketing",
    "Twitter/X Pixel": "Marketing", "TikTok Pixel": "Marketing",
    "Crisp Chat": "Support", "Drift": "Support", "Zendesk": "Support",
    "Freshdesk": "Support", "Tawk.to": "Support",
    "Stripe": "Payment", "PayPal": "Payment", "Braintree": "Payment",
    "Razorpay": "Payment",
    "reCAPTCHA": "Security", "Cloudflare Turnstile": "Security", "hCaptcha": "Security",
    "GraphQL": "API", "Elasticsearch": "Search", "Varnish": "Cache",
}

# ── ExploitDB CVE search ──────────────────────────────────────────────────────
# Search ExploitDB for known exploits matching tech + version

EXPLOITDB_SEARCH_URL = "https://www.exploit-db.com/search"

async def _search_exploitdb(tech: str, version: Optional[str], client: httpx.AsyncClient) -> list:
    """Search ExploitDB for exploits related to a technology and version."""
    try:
        query = tech
        if version:
            # Use major.minor for broader match
            parts = version.split(".")
            query = f"{tech} {'.'.join(parts[:2])}"

        params = {
            "q": query,
            "type": "webapps",
        }
        resp = await client.get(
            EXPLOITDB_SEARCH_URL,
            params=params,
            headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json, text/html"},
            timeout=8,
        )
        if resp.status_code != 200:
            return []

        # ExploitDB returns JSON when Accept: application/json
        # Try to parse — if HTML fallback to regex
        try:
            data = resp.json()
            records = data.get("data", [])[:5]
            return [
                {
                    "edb_id":      r.get("id", ""),
                    "title":       r.get("description", r.get("title", "")),
                    "type":        r.get("type", {}).get("label", "") if isinstance(r.get("type"), dict) else r.get("type", ""),
                    "platform":    r.get("platform", {}).get("label", "") if isinstance(r.get("platform"), dict) else r.get("platform", ""),
                    "date":        r.get("date_published", r.get("date", "")),
                    "url":         f"https://www.exploit-db.com/exploits/{r.get('id', '')}",
                    "cvss":        r.get("cvss", {}).get("score", "") if isinstance(r.get("cvss"), dict) else "",
                }
                for r in records if r.get("id")
            ]
        except Exception:
            # Fallback: parse HTML for exploit IDs/titles
            exploits = []
            matches = re.findall(
                r'href="/exploits/(\d+)"[^>]*>.*?</a>.*?<td[^>]*>(.*?)</td>',
                resp.text, re.DOTALL
            )
            for edb_id, title in matches[:5]:
                exploits.append({
                    "edb_id": edb_id,
                    "title":  re.sub(r'<[^>]+>', '', title).strip(),
                    "url":    f"https://www.exploit-db.com/exploits/{edb_id}",
                })
            return exploits
    except Exception as e:
        return []


async def _search_nvd_cve(tech: str, version: Optional[str], client: httpx.AsyncClient) -> list:
    """Search NIST NVD for CVEs affecting a technology."""
    try:
        query = tech
        if version:
            parts = version.split(".")
            query = f"{tech} {'.'.join(parts[:2])}"

        resp = await client.get(
            "https://services.nvd.nist.gov/rest/json/cves/2.0",
            params={"keywordSearch": query, "resultsPerPage": 5},
            headers={"User-Agent": "ASDMT/1.0"},
            timeout=8,
        )
        if resp.status_code != 200:
            return []

        data = resp.json()
        cves = []
        for item in data.get("vulnerabilities", [])[:5]:
            cve = item.get("cve", {})
            cve_id = cve.get("id", "")
            desc = ""
            for d in cve.get("descriptions", []):
                if d.get("lang") == "en":
                    desc = d.get("value", "")
                    break
            metrics = cve.get("metrics", {})
            cvss_score = ""
            cvss_severity = ""
            for key in ["cvssMetricV31", "cvssMetricV30", "cvssMetricV2"]:
                if key in metrics and metrics[key]:
                    m = metrics[key][0].get("cvssData", {})
                    cvss_score    = str(m.get("baseScore", ""))
                    cvss_severity = m.get("baseSeverity", "")
                    break
            cves.append({
                "cve_id":       cve_id,
                "description":  desc[:200],
                "cvss_score":   cvss_score,
                "cvss_severity": cvss_severity,
                "url":          f"https://nvd.nist.gov/vuln/detail/{cve_id}",
                "published":    cve.get("published", "")[:10],
            })
        return cves
    except Exception:
        return []


# ── Version extraction ────────────────────────────────────────────────────────

def _extract_version(tech: str, headers: dict, html: str) -> Optional[str]:
    """Try to extract a version string for a detected technology."""
    patterns = VERSION_PATTERNS.get(tech, [])

    # Also check server header directly
    server_header = headers.get("server", "") + " " + headers.get("x-powered-by", "")

    combined = server_header + "\n" + html

    for pattern in patterns:
        m = re.search(pattern, combined, re.IGNORECASE)
        if m and m.group(1):
            return m.group(1).strip()
    return None


def _extract_extra_info(headers: dict, html: str) -> dict:
    """Extract additional metadata: security headers, interesting headers, meta tags."""
    info = {}

    # Security headers audit
    sec_headers = {
        "Content-Security-Policy":   headers.get("content-security-policy", ""),
        "X-Frame-Options":           headers.get("x-frame-options", ""),
        "X-Content-Type-Options":    headers.get("x-content-type-options", ""),
        "Strict-Transport-Security": headers.get("strict-transport-security", ""),
        "Referrer-Policy":           headers.get("referrer-policy", ""),
        "Permissions-Policy":        headers.get("permissions-policy", ""),
        "X-XSS-Protection":          headers.get("x-xss-protection", ""),
    }
    info["security_headers"] = {k: v for k, v in sec_headers.items() if v}
    info["missing_security_headers"] = [k for k, v in sec_headers.items() if not v]

    # Interesting server info
    info["server"]       = headers.get("server", "")
    info["powered_by"]   = headers.get("x-powered-by", "")
    info["cf_ray"]       = headers.get("cf-ray", "")
    info["via"]          = headers.get("via", "")
    info["content_type"] = headers.get("content-type", "")

    # Meta tags
    meta_gen = re.search(r'<meta[^>]+name=["\']generator["\'][^>]+content=["\']([^"\']+)["\']', html, re.I)
    if meta_gen:
        info["generator"] = meta_gen.group(1)

    meta_desc = re.search(r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']{0,200})["\']', html, re.I)
    if meta_desc:
        info["description"] = meta_desc.group(1)

    # Interesting cookies
    return {k: v for k, v in info.items() if v}


# ── Detection core ────────────────────────────────────────────────────────────

def _detect(headers: dict, html: str, cookies: list, sig: dict) -> bool:
    for h_key, h_val in sig.get("headers", {}).items():
        hval = headers.get(h_key, "").lower()
        if h_val == "" and hval:
            return True
        if h_val and h_val.lower() in hval:
            return True
    for pattern in sig.get("html", []):
        if re.search(pattern, html, re.IGNORECASE):
            return True
    for ck in sig.get("cookies", []):
        if any(ck.lower() in c.lower() for c in cookies):
            return True
    return False


async def detect_technologies(subdomain: str, lookup_exploits: bool = True) -> Dict:
    result = {
        "subdomain":     subdomain,
        "technologies":  [],
        "extra_info":    {},
        "error":         None,
        "status":        None,
        "final_url":     None,
    }

    try:
        async with httpx.AsyncClient(
            follow_redirects=True,
            timeout=14,
            verify=False,
        ) as client:
            resp = None
            for scheme in ("https://", "http://"):
                try:
                    resp = await client.get(f"{scheme}{subdomain}")
                    result["final_url"] = str(resp.url)
                    break
                except Exception:
                    continue

            if resp is None:
                result["error"] = "unreachable"
                return result

            headers = {k.lower(): v for k, v in resp.headers.items()}
            html    = resp.text[:100_000]
            cookies = list(resp.cookies.keys())
            result["status"] = resp.status_code
            result["extra_info"] = _extract_extra_info(headers, html)

            # Detect all technologies
            detected = []
            for tech, sig in SIGNATURES.items():
                if _detect(headers, html, cookies, sig):
                    version = _extract_version(tech, headers, html)
                    entry = {
                        "name":     tech,
                        "category": CATEGORIES.get(tech, "Other"),
                        "version":  version,
                        "exploits": [],
                        "cves":     [],
                    }
                    detected.append(entry)

            # Parallel exploit/CVE lookups for versioned techs
            if lookup_exploits and detected:
                async with httpx.AsyncClient(
                    follow_redirects=True, timeout=10, verify=False
                ) as ex_client:
                    tasks = []
                    for entry in detected:
                        # Only look up techs where we have version or it's a known vuln-rich tech
                        vuln_rich = {"WordPress", "Joomla", "Drupal", "Magento", "jQuery",
                                     "Apache", "Nginx", "IIS", "PHP", "Laravel", "Shopify",
                                     "Bootstrap", "React", "Vue.js", "Angular", "PrestaShop",
                                     "OpenCart", "Ghost", "Typo3", "ColdFusion"}
                        if entry["version"] or entry["name"] in vuln_rich:
                            tasks.append((entry, _search_exploitdb(entry["name"], entry["version"], ex_client)))
                            tasks.append((entry, _search_nvd_cve(entry["name"], entry["version"], ex_client)))

                    # Run all lookups concurrently in pairs
                    for i in range(0, len(tasks), 2):
                        edb_task = tasks[i] if i < len(tasks) else None
                        nvd_task = tasks[i+1] if i+1 < len(tasks) else None

                        edb_entry, edb_coro = edb_task if edb_task else (None, None)
                        nvd_entry, nvd_coro = nvd_task if nvd_task else (None, None)

                        coros = [c for c in [edb_coro, nvd_coro] if c]
                        results_batch = await asyncio.gather(*coros, return_exceptions=True)

                        idx = 0
                        if edb_coro and edb_entry and idx < len(results_batch):
                            r = results_batch[idx]
                            if not isinstance(r, Exception):
                                edb_entry["exploits"] = r
                            idx += 1
                        if nvd_coro and nvd_entry and idx < len(results_batch):
                            r = results_batch[idx]
                            if not isinstance(r, Exception):
                                nvd_entry["cves"] = r

            result["technologies"] = detected

    except Exception as e:
        result["error"] = str(e)

    return result


async def detect_bulk(subdomains: List[str], max_concurrent: int = 10, lookup_exploits: bool = True) -> Dict[str, Dict]:
    sem = asyncio.Semaphore(max_concurrent)

    async def _guarded(sub):
        async with sem:
            return await detect_technologies(sub, lookup_exploits=lookup_exploits)

    results_list = await asyncio.gather(*[_guarded(s) for s in subdomains])
    return {r["subdomain"]: r for r in results_list}