import requests
from urllib.parse import urlparse

def get_subdomains_from_wayback(domain: str):
    url = f"http://web.archive.org/cdx/search/cdx?url=*.{domain}/*&output=json&fl=original"

    try:
        response = requests.get(url, timeout=20)
        response.raise_for_status()

        data = response.json()

        subdomains = set()

        for entry in data[1:]:  # skip header
            original_url = entry[0]
            parsed = urlparse(original_url)
            hostname = parsed.hostname

            if hostname and hostname.endswith("." + domain):
                subdomains.add(hostname.lower())

        return list(subdomains)

    except Exception as e:
        print(f"[ERROR] Wayback fetch failed: {e}")
        return []