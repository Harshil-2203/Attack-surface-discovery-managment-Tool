CACHE = {}
CACHE_TTL = 300  # seconds (5 minutes)

import asyncio
import time
from .ct_logs import get_subdomains_from_crtsh
from .rapiddns import get_subdomains_from_rapiddns
from .otx import get_subdomains_from_otx
from .hackertarget import get_subdomains_from_hackertarget
from .asn import get_subdomains_from_asn
from .github import get_subdomains_from_github
from .validator import validate_subdomains
from .mapper import analyze_relationships
from .meta import fetch_meta_for_subdomains


async def run_with_timeout(func, domain, timeout=20):
    try:
        return await asyncio.wait_for(
            asyncio.to_thread(func, domain),
            timeout=timeout
        )
    except Exception:
        return []


async def run_subdomain_scan(domain: str):

    # 🔥 Check Cache First
    if domain in CACHE:
        cached_data, timestamp = CACHE[domain]
        if time.time() - timestamp < CACHE_TTL:
            print("Returning cached result")
            return cached_data

    tasks = {
        "crt_sh": run_with_timeout(get_subdomains_from_crtsh, domain, 15),
        "rapiddns": run_with_timeout(get_subdomains_from_rapiddns, domain, 15),
        "otx": run_with_timeout(get_subdomains_from_otx, domain, 15),
        "hackertarget": run_with_timeout(get_subdomains_from_hackertarget, domain, 15),
        "asn_enum": run_with_timeout(get_subdomains_from_asn, domain, 20),
        "github": run_with_timeout(get_subdomains_from_github, domain, 15),
    }

    results = await asyncio.gather(*tasks.values())
    source_results = dict(zip(tasks.keys(), results))

    combined = set()
    for res in source_results.values():
        combined.update(res)

    alive_subdomains = await validate_subdomains(list(combined))

    # Analyze relationships and build mapping
    mapping_analysis = analyze_relationships(alive_subdomains, domain)

    final_result = {
        "total_found": len(combined),
        "alive_count": len(alive_subdomains),
        "sources": {k: len(v) for k, v in source_results.items()},
        "subdomains": alive_subdomains,
        "mapping": mapping_analysis,
        "meta": await fetch_meta_for_subdomains(alive_subdomains)
    }

    # 🔥 Store in Cache
    CACHE[domain] = (final_result, time.time())

    return final_result