# Evently Microservices Architecture

## Overview

Evently is a **scalable, event-driven microservices platform** for event management and ticketing. The architecture leverages **NATS** as a message broker for decoupled communication between services, with **MongoDB** for persistence and **Redis** for caching and distributed locking.

---

## Architecture

```mermaid
graph TB
    AGW[API Gateway Service<br/>Express.js + NATS]
    NATS[NATS Message Broker<br/>Event-Driven Communication Layer]
    
    AUTH[Auth Service]
    EVENT[Event Service]
    BOOKING[Booking Service]
    
    AUTH_DB[MongoDB + Redis]
    EVENT_DB[MongoDB + Redis]
    BOOKING_DB[MongoDB + Redis]
    
    AGW -- NATS Message Bus --> NATS
    
    NATS -- Event Messages --> AUTH
    NATS -- Event Messages --> EVENT
    NATS -- Event Messages --> BOOKING
    
    AUTH -- Database Access --> AUTH_DB
    EVENT -- Database Access --> EVENT_DB
    BOOKING -- Database Access --> BOOKING_DB

    style AGW fill:#0288d1,stroke:#01579b,stroke-width:2px,color:#ffffff
    style NATS fill:#6a1b9a,stroke:#4a148c,stroke-width:2px,color:#ffffff
    style AUTH fill:#d32f2f,stroke:#b71c1c,stroke-width:2px,color:#ffffff
    style EVENT fill:#388e3c,stroke:#1b5e20,stroke-width:2px,color:#ffffff
    style BOOKING fill:#f57c00,stroke:#e65100,stroke-width:2px,color:#ffffff
    style AUTH_DB fill:#616161,stroke:#212121,stroke-width:2px,color:#ffffff
    style EVENT_DB fill:#616161,stroke:#212121,stroke-width:2px,color:#ffffff
    style BOOKING_DB fill:#616161,stroke:#212121,stroke-width:2px,color:#ffffff
```


## Request Flow

```mermaid
sequenceDiagram
    participant Client
    participant Gateway as API Gateway
    participant Broker as NATS Broker
    participant Auth as Auth Service
    participant Event as Event Service
    participant Booking as Booking Service
    participant DB as MongoDB/Redis

    Client->>Gateway: HTTP Request (e.g., Create Booking)
    Gateway->>Broker: Publish request (NATS Message)
    Broker->>Booking: Forward message to Booking Service
    Booking->>DB: Query/Update booking data
    DB-->>Booking: Response with booking status
    Booking->>Broker: Publish reply
    Broker->>Gateway: Deliver response message
    Gateway-->>Client: HTTP Response (JSON)
```

# Key Components

## 1. **API Gateway**
* Exposes REST APIs (`/auth`, `/events`, `/bookings`).
* Validates requests (Zod).
* Converts HTTP → NATS messages (request/reply).
* Handles timeouts & response forwarding.

## 2. **Auth Service**
* User registration, login, refresh, logout.
* JWT token management.
* Circuit breaker ensures DB failures don't cascade.

## 3. **Event Service**
* Event CRUD (create, update, delete, deactivate).
* Search events, list upcoming events.
* Redis caching for frequently accessed data.
* Cleanup of expired events.

## 4. **Booking Service**
* Ticket reservations, cancellations.
* Capacity enforcement with Redis locks.
* Expired booking cleanup jobs.
* Idempotent booking operations.

## 5. **NATS Message Broker**
* Pub/Sub for domain events (e.g., `EventCreated`, `BookingConfirmed`).
* Request/Reply for synchronous API calls.
* Queue groups for load balancing across replicas.

## Resilience & Reliability

* **Circuit Breaker** - Each service wraps DB/Redis calls with a circuit breaker.
   * Avoids hammering unavailable dependencies.
   * Allows quick failover + recovery.

* **Redis Distributed Locks**
   * Prevents race conditions (e.g., two users booking the last ticket simultaneously).
   * Ensures atomic operations on capacity-sensitive workflows.

* **Caching**
   * Event & booking data cached in Redis.
   * TTL ensures cache freshness (30 mins default).

* **Graceful Shutdowns**
   * Services unsubscribe from NATS before exit.
   * Prevents dangling consumers and message loss.


# Running Locally with Docker Compose

## Prerequisites
- [Docker](https://docs.docker.com/get-docker/) installed  
- [Docker Compose](https://docs.docker.com/compose/install/) installed  

---

## Setup Instructions

**Steps:**

1. Clone the repository

```bash
git clone https://github.com/swataswayam-14/vervious.git
cd vervious
```

2. Copy environment variables
   Create a `.env` file in each service with the following:

```
MONGO_URI=mongodb://mongo:27017/evently
REDIS_URL=redis://redis:6379
NATS_URL=nats://nats:4222
JWT_SECRET=your_jwt_secret
```

3. Build and start all services

```bash
docker compose up --build
```

4. Access the platform

> **Note:** Swagger UI is only visible when running locally at `http://localhost:3000/docs`. It does not show in production due to CORS restrictions. Run it locally using `docker compose up` to explore all API routes.

For complete API route details and documentation, see [API\_DOCUMENTATION.md](./API_DOCUMENTATION.md) in the root directory.

5. Stop everything

```bash
docker compose down
```

---