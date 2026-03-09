# app/modules/idor_analyzer.py
"""
IDOR Parameter Analyzer
Parses crawled URLs, extracts query parameters, ranks them by IDOR likelihood.
"""

from urllib.parse import urlparse, parse_qs
from collections import defaultdict

# ── Junk params to ignore (tracking, analytics, display) ──────────────────────
JUNK_PARAMS = {
    "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
    "gclid", "fbclid", "msclkid", "dclid", "twclkid", "mc_cid", "mc_eid",
    "ref", "referrer", "source", "medium", "campaign",
    "lang", "language", "locale", "currency", "tz", "timezone",
    "theme", "color", "size", "format", "view", "layout", "style",
    "callback", "jsonp", "_", "__cf_chl_tk", "v", "ver", "version",
    "nocache", "cache", "bust", "ts", "timestamp", "t", "time",
    "s", "q", "query", "search", "keyword", "keywords", "term",
    "page", "per_page", "limit", "offset", "from", "to", "start",
    "sort", "order", "dir", "direction", "asc", "desc",
    "debug", "test", "preview", "draft", "mode",
}

# ── High-risk param name patterns ─────────────────────────────────────────────
HIGH_RISK_KEYWORDS = [
    "id", "uid", "user_id", "userid", "account", "account_id", "accountid",
    "order", "order_id", "orderid", "invoice", "invoice_id", "invoiceid",
    "file", "file_id", "fileid", "doc", "document", "document_id",
    "record", "record_id", "profile", "profile_id",
    "ticket", "ticket_id", "token", "key", "api_key", "apikey",
    "pid", "cid", "bid", "rid", "oid", "fid", "did",
    "num", "no", "number", "idx", "index",
    "customer", "customer_id", "client", "client_id",
    "member", "member_id", "employee", "employee_id",
    "product", "product_id", "item", "item_id",
    "message", "message_id", "thread", "thread_id",
    "post", "post_id", "comment", "comment_id",
    "transaction", "transaction_id", "payment", "payment_id",
    "report", "report_id", "case", "case_id",
]

def _is_numeric(val: str) -> bool:
    return val.isdigit()

def _is_uuid(val: str) -> bool:
    import re
    return bool(re.match(
        r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
        val, re.I
    ))

def _is_hash(val: str) -> bool:
    """Looks like an MD5/SHA hash."""
    import re
    return bool(re.match(r'^[0-9a-f]{32,64}$', val, re.I)) and len(val) in (32, 40, 64)

def _param_risk_score(param: str, values: list) -> int:
    """
    Score 0-100. Higher = more IDOR-prone.
    """
    score = 0
    p = param.lower().strip("_-")

    # Exact match high risk keyword
    if p in HIGH_RISK_KEYWORDS:
        score += 50
    # Partial match (ends or starts with keyword)
    elif any(p.endswith(k) or p.startswith(k) for k in HIGH_RISK_KEYWORDS):
        score += 30

    # Value analysis
    numeric_count = sum(1 for v in values if _is_numeric(v))
    uuid_count    = sum(1 for v in values if _is_uuid(v))
    hash_count    = sum(1 for v in values if _is_hash(v))

    if uuid_count > 0:
        score += 35
    elif numeric_count > 0:
        score += 25
    elif hash_count > 0:
        score += 20

    # Frequency bonus — appears in many URLs
    if len(values) >= 10:
        score += 10
    elif len(values) >= 5:
        score += 5

    return min(score, 100)


def analyze_idor_params(urls: list) -> dict:
    """
    Parse all URLs, extract query params, rank by IDOR likelihood.

    Returns:
    {
      "params": {
        "user_id": {
          "count": 42,
          "example_values": ["1", "2", "100"],
          "example_urls": ["https://..."],
          "score": 85,
        },
        ...
      },
      "total_urls": 500,
      "urls_with_params": 120,
      "total_params": 18,
    }
    """
    param_data     = defaultdict(lambda: {"urls": set(), "values": set()})
    total_urls     = len(urls)
    urls_with_params = 0

    for raw_url in urls:
        url = raw_url.strip()
        if not url:
            continue
        try:
            parsed = urlparse(url if url.startswith("http") else f"https://{url}")
            qs = parse_qs(parsed.query, keep_blank_values=False)
        except Exception:
            continue

        if not qs:
            continue

        urls_with_params += 1

        for param, vals in qs.items():
            # Skip junk params
            if param.lower() in JUNK_PARAMS:
                continue
            # Skip very long param names (unlikely to be IDOR)
            if len(param) > 50:
                continue

            for v in vals:
                v = v.strip()
                if v and len(v) < 128:
                    param_data[param]["values"].add(v)
            param_data[param]["urls"].add(url)

    # Build ranked output
    results = {}
    for param, data in param_data.items():
        values = list(data["values"])
        score  = _param_risk_score(param, values)

        # Only include params with score > 0
        if score == 0:
            continue

        results[param] = {
            "count":          len(data["urls"]),
            "score":          score,
            "example_values": sorted(
                values,
                key=lambda v: (0 if _is_numeric(v) else 1 if _is_uuid(v) else 2)
            )[:10],
            "example_urls":   sorted(list(data["urls"]))[:5],
        }

    # Sort by score descending
    sorted_results = dict(
        sorted(results.items(), key=lambda x: x[1]["score"], reverse=True)
    )

    return {
        "params":           sorted_results,
        "total_urls":       total_urls,
        "urls_with_params": urls_with_params,
        "total_params":     len(sorted_results),
    }