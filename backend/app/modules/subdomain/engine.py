from .ct_logs import get_subdomains_from_crtsh
from .rapiddns import get_subdomains_from_rapiddns
# from .wayback import get_subdomains_from_wayback  # commented for now

def run_subdomain_scan(domain: str):
    crt_results = get_subdomains_from_crtsh(domain)
    rapiddns_results = get_subdomains_from_rapiddns(domain)

    combined = set(crt_results + rapiddns_results)

    return {
        "total_found": len(combined),
        "sources": {
            "crt_sh": len(crt_results),
            "rapiddns": len(rapiddns_results)
        },
        "subdomains": list(combined)
    }