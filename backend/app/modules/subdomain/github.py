import requests
import re
from bs4 import BeautifulSoup
import time
import os

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

def get_subdomains_from_github(domain: str):
    subdomains = set()

    # Try to use GitHub API if token is available
    token = os.getenv('GITHUB_TOKEN')
    if token:
        headers = {
            'Accept': 'application/vnd.github.v3+json',
            'Authorization': f'token {token}',
            'User-Agent': 'Subdomain-Enumerator/1.0'
        }

        # Search code for the domain
        url = f'https://api.github.com/search/code?q="{domain}"&per_page=100'

        try:
            response = requests.get(url, headers=headers, timeout=15)
            response.raise_for_status()

            data = response.json()
            items = data.get('items', [])

            for item in items:
                # Get the raw file URL
                raw_url = item['html_url'].replace('https://github.com/', 'https://raw.githubusercontent.com/').replace('/blob/', '/')

                try:
                    raw_response = requests.get(raw_url, headers={'User-Agent': 'Subdomain-Enumerator/1.0'}, timeout=10)
                    raw_response.raise_for_status()

                    content = raw_response.text

                    # Find potential subdomains
                    pattern = rf'\b[a-zA-Z0-9.-]+\.{re.escape(domain)}\b'
                    matches = re.findall(pattern, content)

                    for match in matches:
                        cleaned = clean_subdomain(match, domain)
                        if cleaned:
                            subdomains.add(cleaned)

                except Exception:
                    continue

        except Exception as e:
            print(f"[ERROR] GitHub API search failed: {e}")

    else:
        # Fallback to scraping gists
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }

        # Search GitHub gists for the domain
        url = f"https://gist.github.com/search?q={domain}"

        try:
            response = requests.get(url, headers=headers, timeout=15)
            response.raise_for_status()

            soup = BeautifulSoup(response.text, 'html.parser')

            # Find gist content
            gist_items = soup.find_all('div', class_='gist-snippet')

            for gist in gist_items:
                text = gist.get_text()
                pattern = rf'\b[a-zA-Z0-9.-]+\.{re.escape(domain)}\b'
                matches = re.findall(pattern, text)

                for match in matches:
                    cleaned = clean_subdomain(match, domain)
                    if cleaned:
                        subdomains.add(cleaned)

        except Exception as e:
            print(f"[ERROR] GitHub gist search failed: {e}")

    return list(subdomains)