import requests

def clean_subdomain(name: str, domain: str):
    name = name.strip().lower()

    # Remove wildcard prefix
    if name.startswith("*."):
        name = name[2:]

    # Remove trailing dot
    if name.endswith("."):
        name = name[:-1]

    # Only keep subdomains of target
    if name == domain:
        return None

    if name.endswith("." + domain):
        return name

    return None


def get_subdomains_from_crtsh(domain: str):
    url = f"https://crt.sh/?q=%25.{domain}&output=json"

    try:
        response = requests.get(url, timeout=15)
        response.raise_for_status()

        data = response.json()
        subdomains = set()

        for entry in data:
            name_value = entry.get("name_value")
            if not name_value:
                continue

            names = name_value.split("\n")

            for name in names:
                cleaned = clean_subdomain(name, domain)
                if cleaned:
                    subdomains.add(cleaned)

        return list(subdomains)

    except Exception as e:
        print(f"[ERROR] crt.sh fetch failed: {e}")
        return []