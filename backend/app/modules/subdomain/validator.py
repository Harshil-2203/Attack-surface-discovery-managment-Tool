import asyncio
import socket


async def resolve_subdomain(subdomain: str):
    try:
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, socket.gethostbyname, subdomain)
        return subdomain
    except Exception:
        return None


async def validate_subdomains(subdomains: list, concurrency: int = 50):
    semaphore = asyncio.Semaphore(concurrency)

    async def sem_task(sub):
        async with semaphore:
            return await resolve_subdomain(sub)

    tasks = [sem_task(sub) for sub in subdomains]
    results = await asyncio.gather(*tasks)

    # Remove None values
    return [r for r in results if r]