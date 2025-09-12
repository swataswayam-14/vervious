# Low-Level Design (LLD) of Event-Driven Microservices with NATS

## 1. Core Building Blocks

### API Gateway (Express.js + NATS Client)
- Accepts REST requests from clients.
- Validates input (using Zod).
- Converts request → NATS messages.
- Waits for service responses (request/reply pattern).
- Returns results back to clients in JSON.

### Microservices (e.g., EventService, AuthService, BookingService)
- Each service has its own `nats.handler.ts`.
- Subscribes to NATS subjects relevant to that domain.
- Uses Circuit Breaker + Redis Distributed Locks to ensure resilience and consistency.
- Executes business logic (CRUD, validation, cache sync).
- Responds back via NATS reply channels.

### NATS Message Broker
Acts as the communication backbone.

Provides:
- **Pub/Sub** → broadcast style events (e.g., "BookingCreated").
- **Request/Reply** → RPC-like synchronous calls with timeouts.
- **Queue Groups** → load balancing across service replicas.
- Auto-reconnect & backpressure handling.

## 2. Communication Protocols

### NATS Protocol (over TCP, optionally with TLS/QUIC)
- Binary protocol, much lighter than HTTP/1.1.
- Low-latency (microseconds) & small memory footprint.
- Built-in request/reply with correlation IDs.
- Streaming + JetStream support for persistence, replay, and at-least-once delivery.

### Why not plain HTTP?

HTTP/1.1 REST is:
- Request/Response only (no native async pub/sub).
- Heavier (headers, TLS handshake, TCP connection overhead).
- Harder to scale event-driven patterns.

### NATS vs HTTP Benefits:
- **Performance**: NATS can handle millions of messages/sec with minimal CPU/memory.
- **Bi-Directional**: Supports async pub/sub & request/reply seamlessly.
- **Scalability**: Queue groups distribute load without external load balancers.
- **Resilience**: Auto-reconnect + backpressure-aware consumers.
- **Decoupling**: Services don't need to know each other's IP/ports (just subjects).

## 3. Resilience & Reliability

### Circuit Breaker (per service)
- Protects against cascading failures.
- **Example**: If MongoDB is down, prevents flooding it with requests → opens circuit → fast-fails until recovery.

### Redis Locks
- Prevent race conditions (e.g., two services creating same event simultaneously).
- Ensures strong consistency for critical paths (e.g., `createEvent`, `updateEvent`).

### Idempotency & Validation
- Input validated via Zod at the API Gateway level.
- Duplicate operations prevented via locks + uniqueness checks in DB.

### Graceful Shutdowns
- Every service unsubscribes from NATS to avoid dangling consumers.
- Ensures zero message leaks.

## 4. Data Flow Example (User Registration)

### Client → API Gateway
- `POST /register` with `{email, password, role}`.
- Gateway validates via Zod.

### API Gateway → NATS
- Publishes a `AUTH_REGISTER` request with `correlationId` & `messageId`.

### AuthService (nats.handler.ts)
- Subscribed to `AUTH_REGISTER`.
- Acquires Redis lock (to avoid duplicate registration).
- Validates user data.
- Creates user in DB.
- Responds back via NATS reply.

### API Gateway → Client
- Returns `201 Created` with tokens + user profile.

## 5. Design Principles

### Consistency
- Same message schema across all services (`messageId`, `timestamp`, `correlationId`).
- JSONCodec ensures a standard encoding.

### Decoupling
- Services do not talk directly (no service discovery needed).
- Communication happens only via NATS subjects.

### Resilience
- Circuit breaker + retries + Redis locks.
- Auto-reconnect to broker.

### Scalability
- Horizontal scaling via queue groups.
- Each instance gets part of the load automatically.

### Developer Experience
- Clear API layer (`publish`, `request`, `subscribeRequestReply`).
- API Gateway hides NATS complexity from clients.

## 6. Why This Design Works

**Impact** → Prevents message leaks, dangling subscriptions, duplicate writes.  
**Scalable** → Add more instances, NATS distributes load automatically.  
**Fault-Tolerant** → Broker restarts don't require service restarts.  
**Better than HTTP** → Lower latency, async, built-in resilience.  
**Observable** → Every message tagged with IDs + metrics via `getStats()`.