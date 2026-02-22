import requests
from bs4 import BeautifulSoup

def get_subdomains_from_rapiddns(domain: str):
    url = f"https://rapiddns.io/subdomain/{domain}?full=1"

    try:
        headers = {
            "User-Agent": "Mozilla/5.0"
        }

        response = requests.get(url, headers=headers, timeout=15)
        response.raise_for_status()

        soup = BeautifulSoup(response.text, "html.parser")

        subdomains = set()

        for link in soup.find_all("td"):
            text = link.get_text().strip().lower()

            if text.endswith("." + domain):
                subdomains.add(text)

        return list(subdomains)

    except Exception as e:
        print(f"[ERROR] RapidDNS fetch failed: {e}")
        return []