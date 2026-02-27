import asyncio
from typing import List, Dict, Any
import httpx
from bs4 import BeautifulSoup


async def _fetch_one(client: httpx.AsyncClient, url: str) -> Dict[str, Any]:
    try:
        resp = await client.get(url, timeout=10.0)
        content_type = resp.headers.get("content-type", "")
        title = None
        if "html" in content_type.lower():
            try:
                soup = BeautifulSoup(resp.text, "html.parser")
                title_tag = soup.find("title")
                if title_tag:
                    title = title_tag.get_text(strip=True)
            except Exception:
                title = None

        return {
            "url": url,
            "status_code": resp.status_code,
            "final_url": str(resp.url),
            "title": title,
            "content_type": content_type,
        }
    except Exception as e:
        return {"url": url, "error": str(e)}


async def fetch_meta_for_subdomains(subdomains: List[str]) -> Dict[str, Dict[str, Any]]:
    """Fetch basic HTTP metadata for a list of subdomains.

    Tries HTTPS first, then HTTP if HTTPS fails. Returns a mapping of
    subdomain -> metadata.
    """
    results: Dict[str, Dict[str, Any]] = {}
    semaphore = asyncio.Semaphore(20)

    async def _fetch_with_schemes(sub: str):
        async with semaphore:
            async with httpx.AsyncClient(follow_redirects=True) as client:
                # try https then http
                for scheme in ("https://", "http://"):
                    url = f"{scheme}{sub}"
                    res = await _fetch_one(client, url)
                    if res.get("status_code"):
                        results[sub] = res
                        return
                # if neither returned status, store last error
                results[sub] = res

    await asyncio.gather(*[_fetch_with_schemes(s) for s in subdomains])
    return results
