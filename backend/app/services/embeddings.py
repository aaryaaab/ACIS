"""
Embedding service. Default is a small, free, local "hashing" embedding so semantic search works
with no API key. It is crude (word overlap, not true meaning). Set EMBEDDING_PROVIDER=api and
EMBEDDING_API_KEY to use a real embedding model later.
"""
import hashlib
import math
import re

from app.models import EMBEDDING_DIM


def embed(text: str) -> list[float]:
    vec = [0.0] * EMBEDDING_DIM
    for word in re.findall(r"[a-z0-9]+", text.lower()):
        h = int(hashlib.md5(word.encode(), usedforsecurity=False).hexdigest(), 16)
        vec[h % EMBEDDING_DIM] += 1.0 if (h >> 8) % 2 == 0 else -1.0
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]
