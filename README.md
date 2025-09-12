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