import requests

def get_subdomains_from_hackertarget(domain: str):
    url = f"https://api.hackertarget.com/hostsearch/?q={domain}"

    try:
        response = requests.get(url, timeout=15)
        response.raise_for_status()

        subdomains = set()

        lines = response.text.splitlines()

        for line in lines:
            if "," in line:
                hostname = line.split(",")[0].strip().lower()

                if hostname.endswith("." + domain):
                    subdomains.add(hostname)

        return list(subdomains)

    except Exception as e:
        print(f"[ERROR] HackerTarget fetch failed: {e}")
        return []