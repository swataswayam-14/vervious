# Auth Service — Redis Usage

This document explains how **Redis** is leveraged in the Auth Service to provide **rate limiting**, **distributed locking**, and **caching**, ensuring security, consistency, and performance.

---

## `register` — Distributed Locking on Email

### What happens

```ts
const lockKey = `register:${email}`;
return this.redisClient.withLock(lockKey, async () => {
  // registration logic
});
```

- Uses a Redis lock on `register:{email}`.
- Ensures two users cannot register with the same email simultaneously.

### Why it's useful

- Prevents duplicate account creation under high concurrency.
- Eliminates race conditions when multiple registration requests hit at once.


## `login` — Rate Limiting & Locking

### What happens

**Locking on email**
```ts
const lockKey = `login:${email}`;
return this.redisClient.withLock(lockKey, async () => {
  // login logic
});
```
- Prevents concurrent conflicting login operations for the same account.

**Rate limiting login attempts**
```ts
const isAllowed = await this.redisClient.rateLimit(
  `login_attempts:${email}`,
  5,
  300000
);
```
- Limits login attempts to 5 per 5 minutes per email.

### Why it's useful

- Stops brute-force password guessing.
- Prevents duplicate conflicting login states.
- Protects accounts by enforcing cooldowns on repeated failures.

## `refreshTokens` — Cached User Data

### What happens

Tries to fetch user profile from Redis:
```ts
let user = await this.getCachedUserData(payload.userId);
```

If not found, loads from DB and caches it:
```ts
await this.cacheUserData(payload.userId, userDoc);
```

### Why it's useful

- Speeds up token refresh flow by avoiding repeated DB lookups.
- Reduces load on MongoDB by serving cached user profiles.
- Still validates tokens and sessions against DB for correctness.


## Why This Design Matters

- **Security** → Rate limiting thwarts brute-force attacks.
- **Consistency** → Locks prevent duplicate accounts or conflicting sessions.
- **Performance** → Caching reduces DB hits during frequent token refresh.
- **Scalability** → Redis ensures these guarantees hold across multiple service instances.