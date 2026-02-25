import requests

def get_subdomains_from_otx(domain: str):
    url = f"https://otx.alienvault.com/api/v1/indicators/domain/{domain}/passive_dns"

    try:
        response = requests.get(url, timeout=15)
        response.raise_for_status()

        data = response.json()

        subdomains = set()

        for record in data.get("passive_dns", []):
            hostname = record.get("hostname")

            if hostname and hostname.endswith("." + domain):
                subdomains.add(hostname.lower())

        return list(subdomains)

    except Exception as e:
        print(f"[ERROR] OTX fetch failed: {e}")
        return []