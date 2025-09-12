# NATS Client Library — Low Level Design

The `client.ts` file provides a **resilient, consistent, and scalable wrapper** around the raw [NATS](https://nats.io) library.  
It ensures that all services in the event management system interact with NATS in a uniform and reliable way.

---

## 🎯 Purpose
- Centralizes **connection management** to the NATS cluster.  
- Provides **request-reply** and **pub/sub** abstractions.  
- Enforces **standardized message envelopes** (`messageId`, `timestamp`, `correlationId`).  
- Adds **resilience**: auto-reconnect, graceful shutdown, error handling.  
- Implements a **singleton client** per process (`getNatsClient`).  

---

## Key Design Choices & Intuition

### 🔗 Connection Management
- Uses **Singleton pattern** to avoid multiple conflicting connections.  
- Supports **auto-reconnect** with exponential retry (`maxReconnectAttempts`, `reconnectInterval`).  
- Inherits from `EventEmitter` → other services can listen to `connect`, `disconnect`, `error`.  

**Impact:** prevents connection storms, enables graceful recovery from broker failures.

---

### Publish & Request-Reply
- `publish` → wraps data with `messageId` + `timestamp`.  
- `request` → supports timeouts, correlation IDs, and typed responses.  

**Intuition:** request-reply pattern is critical for **API Gateway ↔ services** synchronous flows.  
Correlation IDs enable full **end-to-end tracing**.

---

### 📩 Subscription Handling
- `subscribe` → standard pub/sub.  
- `unsubscribe` → cleans up unused subjects.  

**Impact:**  
- Supports **queue groups** → scale consumers horizontally without duplicate work.  
- Centralizes subscription logic → less boilerplate, more consistency.

---

### Error Handling & Resilience
- `try/catch` wrappers prevent crashes on bad messages.  
- Standardized error response:  
  ```json
  {
    "success": false,
    "error": "Some error message",
    "messageId": "...",
    "timestamp": "..."
  }
- `gracefulShutdown` → unsubscribes & closes connections cleanly.

**Impact:** avoids dangling subscriptions & ensures **zero message leaks** during shutdowns.

---

## Scalability & Operational Impact

### Horizontal Scaling
- Multiple instances can connect safely.  
- Queue subscriptions distribute load across instances.  

### Fault Tolerance
- Auto-reconnect ensures recovery from NATS restarts.  
- Prevents manual restarts during broker failures.  

### Performance
- Lightweight `JSONCodec` for encoding/decoding.  
- Async iterators prevent consumer overload (**backpressure-aware**).  

### Observability
- Every message carries `messageId` + `correlationId`.  
- `getStats()` provides runtime metrics (subscriptions, reconnect attempts).  

---

## Why This Design Works
- **Consistency** → same message format across all services.  
- **Decoupling** → services don’t deal with raw NATS internals.  
- **Resilience** → built-in reconnect + error handling.  
- **Scalability** → queue groups for load distribution.  
