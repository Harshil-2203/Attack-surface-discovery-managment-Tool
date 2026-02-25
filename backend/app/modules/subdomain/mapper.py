import re
from typing import Dict, List, Any
from collections import defaultdict

# Optional sklearn imports; fall back gracefully if not installed
try:
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.cluster import KMeans
    _SKLEARN_AVAILABLE = True
except Exception:
    _SKLEARN_AVAILABLE = False

import math


def build_domain_tree(subdomains: List[str], root_domain: str) -> Dict[str, Any]:
    """
    Build a hierarchical tree structure from subdomains
    """
    # Clean and sort subdomains
    cleaned = []
    for sub in subdomains:
        sub = sub.lower().strip()
        if sub.endswith('.' + root_domain) or sub == root_domain:
            cleaned.append(sub)

    # Remove duplicates and sort
    cleaned = list(set(cleaned))
    cleaned.sort()

    # Build tree structure
    tree = {
        'name': root_domain,
        'children': [],
        'level': 0,
        'type': 'root'
    }

    # Helper to find or create node path
    def find_or_create(path_parts: List[str], level: int):
        node = tree
        # Walk from root toward leaf
        for i in range(len(path_parts) - 1, -1, -1):
            name = '.'.join(path_parts[i:])
            # try to find
            found = None
            for child in node['children']:
                if child.get('name') == name:
                    found = child
                    break
            if not found:
                found = {
                    'name': name,
                    'children': [],
                    'level': len(path_parts) - i,
                    'type': 'subdomain' if name != root_domain else 'root',
                    'full_name': name
                }
                node['children'].append(found)
            node = found
        return node

    for sub in cleaned:
        parts = sub.split('.')
        domain_parts = root_domain.split('.')
        if parts[-len(domain_parts):] != domain_parts:
            continue
        # Add nodes for each level
        for i in range(len(parts) - len(domain_parts)):
            path = parts[i:]
            find_or_create(path, i + 1)

    return tree


def suggest_clusters(subdomains: List[str], max_clusters: int = 8) -> Dict[int, List[str]]:
    """
    Simple ML-based clustering using TF-IDF on subdomain tokens and KMeans.
    Returns a mapping of cluster_id -> list[subdomains]
    """
    n = len(subdomains)
    if n == 0:
        return {}
    # Prepare text data: use subdomain without root TLD parts
    docs = [s.replace('.', ' ') for s in subdomains]

    # Use sklearn if available
    if _SKLEARN_AVAILABLE:
        try:
            vectorizer = TfidfVectorizer(analyzer='char_wb', ngram_range=(3, 6))
            X = vectorizer.fit_transform(docs)

            # Choose number of clusters heuristically
            k = min(max(2, int(math.sqrt(n))), max_clusters)
            kmeans = KMeans(n_clusters=k, random_state=42, n_init=10)
            labels = kmeans.fit_predict(X)

            clusters = defaultdict(list)
            for lbl, sd in zip(labels, subdomains):
                clusters[int(lbl)].append(sd)

            # Convert to normal dict
            return {int(k): v for k, v in clusters.items()}
        except Exception:
            return {}

    # Fallback simple grouping by left-most label
    clusters = defaultdict(list)
    for sd in subdomains:
        left = sd.split('.')[0]
        clusters[left].append(sd)

    # If too many clusters, keep top `max_clusters` by size and merge rest into "other"
    if len(clusters) <= max_clusters:
        return {i: v for i, v in enumerate(clusters.values())}

    sorted_groups = sorted(clusters.items(), key=lambda kv: len(kv[1]), reverse=True)
    result = {}
    for i, (k, v) in enumerate(sorted_groups[:max_clusters - 1]):
        result[i] = v
    # merge rest
    other = []
    for _, v in sorted_groups[max_clusters - 1:]:
        other.extend(v)
    result[max_clusters - 1] = other
    return result


def analyze_relationships(subdomains: List[str], root_domain: str) -> Dict[str, Any]:
    """
    Analyze relationships and suggest groupings using simple heuristics + ML clustering
    """
    tree = build_domain_tree(subdomains, root_domain)

    # Analyze simple lexical patterns
    patterns = defaultdict(list)
    keywords = ['api', 'dev', 'staging', 'test', 'admin', 'mail', 'ftp', 'www', 'cdn', 'static']
    for sub in subdomains:
        parts = sub.lower().split('.')
        for kw in keywords:
            if kw in parts:
                patterns[kw].append(sub)

    # ML-based cluster suggestions
    clusters = suggest_clusters(subdomains)

    return {
        'tree': tree,
        'patterns': {k: list(set(v)) for k, v in patterns.items()},
        'clusters': clusters,
        'total_subdomains': len(subdomains),
        'unique_patterns': len([p for p in patterns.values() if p])
    }


def update_mapping(tree: Dict, updates: List[Dict]) -> Dict[str, Any]:
    """
    Manually update the mapping structure
    updates format: [{'action': 'move|rename|delete', 'node': 'subdomain', 'target': 'new_parent', ...}]
    For now this is a placeholder that returns the updated tree (no-op).
    """
    return tree