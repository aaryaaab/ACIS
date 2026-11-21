"""
Stops password guessing: after N wrong passwords for the same email (from the same address) within a
time window, further login attempts are refused until the window passes.

Kept in memory, so it is per server process and resets when the server restarts. For several servers
behind a load balancer, move it to Redis. This is a documented limitation.
"""
import time
from collections import deque


class FailureLimiter:
    def __init__(self, max_failures: int, window_seconds: int, clock=time.monotonic, max_keys: int = 10_000):
        self.max, self.window, self.clock, self.max_keys = max_failures, window_seconds, clock, max_keys
        self.failures: dict[str, deque] = {}

    def _prune(self, key: str) -> deque:
        q = self.failures.setdefault(key, deque())
        cutoff = self.clock() - self.window
        while q and q[0] <= cutoff:
            q.popleft()
        if not q:
            self.failures.pop(key, None)
            return deque()
        return q

    def retry_after(self, key: str) -> int:
        """Seconds to wait, or 0 if the attempt is allowed."""
        q = self._prune(key)
        if len(q) < self.max:
            return 0
        return max(1, int(q[0] + self.window - self.clock()) + 1)

    def record_failure(self, key: str) -> None:
        self._prune(key)
        self.failures.setdefault(key, deque()).append(self.clock())
        if len(self.failures) > self.max_keys:
            # Memory is capped. Forget expired entries first, then the oldest ones. (Someone flooding with made-up
            # emails can therefore push real counters out. That is the price of a hard memory limit.)
            for k in list(self.failures):
                self._prune(k)
            overflow = len(self.failures) - self.max_keys
            for k in list(self.failures)[:max(0, overflow) + self.max_keys // 10]:
                self.failures.pop(k, None)

    def reset(self, key: str) -> None:
        self.failures.pop(key, None)
