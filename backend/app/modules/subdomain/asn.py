import socket
import subprocess
import ipaddress


# STEP 1 — Resolve Domain to IP
def get_ip_from_domain(domain: str):
    try:
        return socket.gethostbyname(domain)
    except Exception:
        return None


# STEP 2 — Get ASN from IP using Team Cymru
def get_asn_from_ip(ip: str):
    try:
        result = subprocess.check_output(
            ["whois", "-h", "whois.cymru.com", ip],
            universal_newlines=True
        )

        lines = result.strip().split("\n")

        if len(lines) > 1:
            asn = lines[1].split("|")[0].strip()
            return asn

        return None

    except Exception:
        return None


# STEP 3 — Get IP Ranges from ASN
def get_ip_ranges_from_asn(asn: str):
    try:
        result = subprocess.check_output(
            f"whois -h whois.radb.net -- '-i origin AS{asn}'",
            shell=True,
            universal_newlines=True
        )

        ranges = []

        for line in result.splitlines():
            if line.lower().startswith("route:"):
                cidr = line.split()[1]
                ranges.append(cidr)

        return ranges

    except Exception:
        return []


# STEP 4 — Reverse DNS Lookup (limited scanning)
def reverse_dns_lookup(cidr: str, target_domain: str, max_ips=50):
    found = set()

    try:
        network = ipaddress.ip_network(cidr, strict=False)

        count = 0
        for ip in network.hosts():
            if count >= max_ips:
                break

            try:
                hostname = socket.gethostbyaddr(str(ip))[0]

                if hostname.endswith("." + target_domain):
                    found.add(hostname.lower())

            except Exception:
                pass

            count += 1

    except Exception:
        pass

    return list(found)


# MAIN ASN ENUMERATION FUNCTION
def get_subdomains_from_asn(domain: str):
    results = set()

    ip = get_ip_from_domain(domain)
    if not ip:
        return []

    asn = get_asn_from_ip(ip)
    if not asn:
        return []

    ranges = get_ip_ranges_from_asn(asn)

    # Limit to first 3 ranges to avoid heavy scan
    for cidr in ranges[:3]:
        subdomains = reverse_dns_lookup(cidr, domain)
        results.update(subdomains)

    return list(results)