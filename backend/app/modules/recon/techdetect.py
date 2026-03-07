# modules/recon/techdetect.py
"""
Technology Detector — detects CMS, frameworks, servers, analytics
by analyzing HTTP headers, HTML content, cookies and JS files.
No external API required.
"""
import asyncio
import httpx
import re
from typing import Dict, List

# ── Signature database ────────────────────────────────────────────────────────
SIGNATURES = {
    # CMS
    "WordPress":      {"headers": {"x-powered-by": "wordpress"}, "html": [r"wp-content/", r"wp-includes/"], "cookies": ["wordpress_"]},
    "Joomla":         {"html": [r"/components/com_", r"Joomla!"]},
    "Drupal":         {"headers": {"x-generator": "drupal"}, "html": [r"sites/default/files", r"Drupal.settings"]},
    "Shopify":        {"html": [r"cdn\.shopify\.com", r"Shopify\.shop"], "cookies": ["_shopify_"]},
    "Wix":            {"html": [r"static\.wixstatic\.com", r"wixsite\.com"]},
    "Squarespace":    {"html": [r"squarespace\.com", r"static1\.squarespace"]},
    "Magento":        {"html": [r"Mage\.Cookies", r"/skin/frontend/"], "cookies": ["frontend"]},
    "PrestaShop":     {"html": [r"prestashop", r"/themes/default-bootstrap/"]},
    "Ghost":          {"html": [r"ghost\.io", r"/ghost/api/"]},
    "Webflow":        {"html": [r"webflow\.com", r"wf-form"]},

    # JS Frameworks
    "React":          {"html": [r"react(?:\.min)?\.js", r"__REACT_", r"data-reactroot"]},
    "Vue.js":         {"html": [r"vue(?:\.min)?\.js", r"__vue__", r"v-bind:"]},
    "Angular":        {"html": [r"angular(?:\.min)?\.js", r"ng-version", r"ng-app"]},
    "Next.js":        {"html": [r"__NEXT_DATA__", r"/_next/static/"]},
    "Nuxt.js":        {"html": [r"__NUXT__", r"/_nuxt/"]},
    "jQuery":         {"html": [r"jquery(?:\.min)?\.js", r"jQuery\.fn\.jquery"]},
    "Bootstrap":      {"html": [r"bootstrap(?:\.min)?\.(?:js|css)"]},

    # Servers
    "Nginx":          {"headers": {"server": "nginx"}},
    "Apache":         {"headers": {"server": "apache"}},
    "IIS":            {"headers": {"server": "microsoft-iis"}},
    "Cloudflare":     {"headers": {"server": "cloudflare", "cf-ray": ""}},
    "AWS CloudFront": {"headers": {"x-amz-cf-id": ""}},
    "Fastly":         {"headers": {"x-served-by": "cache-"}},
    "Vercel":         {"headers": {"x-vercel-id": ""}},
    "Netlify":        {"headers": {"x-nf-request-id": ""}},

    # Languages / Platforms
    "PHP":            {"headers": {"x-powered-by": "php"}},
    "ASP.NET":        {"headers": {"x-powered-by": "asp.net", "x-aspnet-version": ""}},
    "Node.js":        {"headers": {"x-powered-by": "express"}},
    "Python/Django":  {"headers": {"x-frame-options": "sameorigin"}, "cookies": ["csrftoken", "sessionid"]},
    "Ruby on Rails":  {"headers": {"x-runtime": ""}, "cookies": ["_session_id"]},
    "Java":           {"headers": {"x-powered-by": "servlet"}, "cookies": ["jsessionid"]},

    # Analytics / Marketing
    "Google Analytics": {"html": [r"google-analytics\.com/analytics\.js", r"gtag\(", r"UA-\d{4,}-\d"]},
    "Google Tag Manager": {"html": [r"googletagmanager\.com/gtm\.js"]},
    "HubSpot":        {"html": [r"js\.hsforms\.net", r"hubspot\.com"]},
    "Intercom":       {"html": [r"intercom\.io", r"Intercom\("]},
    "Hotjar":         {"html": [r"hotjar\.com", r"hj\("]},

    # Security
    "reCAPTCHA":      {"html": [r"google\.com/recaptcha", r"grecaptcha"]},
    "Cloudflare Turnstile": {"html": [r"challenges\.cloudflare\.com/turnstile"]},
    "hCaptcha":       {"html": [r"hcaptcha\.com"]},
}

CATEGORIES = {
    "WordPress": "CMS", "Joomla": "CMS", "Drupal": "CMS", "Shopify": "CMS",
    "Wix": "CMS", "Squarespace": "CMS", "Magento": "CMS", "PrestaShop": "CMS",
    "Ghost": "CMS", "Webflow": "CMS",
    "React": "Frontend Framework", "Vue.js": "Frontend Framework",
    "Angular": "Frontend Framework", "Next.js": "Frontend Framework",
    "Nuxt.js": "Frontend Framework", "jQuery": "JavaScript Library",
    "Bootstrap": "CSS Framework",
    "Nginx": "Web Server", "Apache": "Web Server", "IIS": "Web Server",
    "Cloudflare": "CDN/Security", "AWS CloudFront": "CDN", "Fastly": "CDN",
    "Vercel": "Hosting", "Netlify": "Hosting",
    "PHP": "Language", "ASP.NET": "Language", "Node.js": "Language",
    "Python/Django": "Language", "Ruby on Rails": "Language", "Java": "Language",
    "Google Analytics": "Analytics", "Google Tag Manager": "Analytics",
    "HubSpot": "Marketing", "Intercom": "Support", "Hotjar": "Analytics",
    "reCAPTCHA": "Security", "Cloudflare Turnstile": "Security", "hCaptcha": "Security",
}

def _detect(headers: dict, html: str, cookies: list, sig: dict) -> bool:
    for h_key, h_val in sig.get("headers", {}).items():
        hval = headers.get(h_key, "").lower()
        if h_val == "" and hval:   # just presence check
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

async def detect_technologies(subdomain: str) -> Dict:
    result = {"subdomain": subdomain, "technologies": [], "error": None}
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=12) as client:
            for scheme in ("https://", "http://"):
                try:
                    resp = await client.get(f"{scheme}{subdomain}")
                    headers = {k.lower(): v for k, v in resp.headers.items()}
                    html    = resp.text[:80000]   # cap at 80KB
                    cookies = list(resp.cookies.keys())

                    found = []
                    for tech, sig in SIGNATURES.items():
                        if _detect(headers, html, cookies, sig):
                            found.append({
                                "name":     tech,
                                "category": CATEGORIES.get(tech, "Other"),
                            })
                    result["technologies"] = found
                    result["status"] = resp.status_code
                    return result
                except Exception:
                    continue
    except Exception as e:
        result["error"] = str(e)
    return result

async def detect_bulk(subdomains: List[str], max_concurrent: int = 15) -> Dict[str, Dict]:
    sem = asyncio.Semaphore(max_concurrent)
    async def _guarded(sub):
        async with sem:
            return await detect_technologies(sub)

    results_list = await asyncio.gather(*[_guarded(s) for s in subdomains])
    return {r["subdomain"]: r for r in results_list}