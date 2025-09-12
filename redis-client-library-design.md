# Redis Client Library — Low Level Design

The `RedisClient` class provides a **resilient, multi-purpose abstraction** over [ioredis](https://github.com/luin/ioredis).  
It centralizes Redis usage for caching, distributed locking, and rate-limiting across the platform.

---

## Purpose
- Manages **Redis connections** with auto-reconnect and event tracking.  
- Implements **distributed locking** (`acquireLock`, `releaseLock`, `withLock`).  
- Provides **rate limiting** using sorted sets.  
- Wraps **get/set/del/exists** operations with JSON serialization.  
- Simplifies Redis access → one client across all services.  

---

## Key Design Choices & Intuition

### Connection Management
- Uses `lazyConnect: true` → connect only when needed, avoids unnecessary open sockets.  
- Handles `connect`, `error`, and `close` events → improves observability.  
- Tracks `isConnected` state → ensures reliable connect/disconnect logic.  

**Impact:** reliable connection lifecycle; prevents service crashes from Redis errors.

---

### Distributed Locking
- `acquireLock` → uses Redis `SET key value PX ttl NX` for atomic lock acquisition.  
- Retries with random jitter → reduces race conditions (thundering herd problem).  
- `releaseLock` → uses a Lua script to ensure **only the lock owner can release**.  
- `withLock` → higher-level abstraction to wrap critical operations safely.  

**Impact:**  
- Prevents race conditions in **booking, payment, inventory updates**.  
- Guarantees **atomic execution** across distributed service instances.

---

### Rate Limiting
- Uses **sorted sets (`ZADD`, `ZREMRANGEBYSCORE`, `ZCARD`)** for sliding window counters.  
- Expiry automatically cleans up old keys.  
- Ensures fair usage by tracking requests in rolling time windows.  

**Impact:**  
- Protects services from abuse (API Gateway throttling).  
- Provides **predictable system load** under high traffic.

---

### Caching & KV Operations
- `set` / `get` with JSON serialization → supports structured data caching.  
- `del` and `exists` → basic key lifecycle management.  

**Impact:**  
- Reduces DB load with data caching.  
- Improves **response times** for frequently accessed queries.

---

## Scalability & Operational Impact

### Horizontal Scaling
- All instances share the same Redis cluster.  
- Locks and rate-limits remain consistent across services.  

### Fault Tolerance
- ioredis handles automatic reconnections.  
- Lua script ensures **atomic unlocks**, even under failures.  

### Performance
- Pipeline support reduces round-trips in rate limiting.  
- Sorted sets scale well for sliding-window throttling.  

### Observability
- Connection events (`connect`, `error`, `close`) improve monitoring.  
- Lock failures and rate-limit rejections can be logged for tracing.  

---

## Why This Design Works
- **Consistency** → single abstraction for caching, locks, and rate limiting.  
- **Safety** → distributed lock implementation avoids race conditions.  
- **Scalability** → centralized Redis enables cross-instance coordination.  
- **Performance** → pipelining and JSON serialization keep it lightweight.  
