# Event Booking System - Entity Relationship Diagram

```mermaid
erDiagram
    User {
        ObjectId _id PK
        string email UK "unique, lowercase"
        string password "min 8 chars"
        string name
        enum role "user|admin"
        boolean isActive "default: true"
        Date lastLoginAt
        number failedLoginAttempts "default: 0"
        Date lockedUntil
        Date createdAt
        Date updatedAt
        boolean isLocked "virtual field"
    }

    Session {
        ObjectId _id PK
        ObjectId userId FK
        string sessionId UK "unique"
        string refreshToken UK "unique"
        object deviceInfo "userAgent, ip, deviceId"
        Date expiresAt
        boolean isRevoked "default: false"
        Date createdAt
        Date updatedAt
    }

    Event {
        ObjectId _id PK
        string name
        string description
        string venue
        Date dateTime
        number capacity
        number availableTickets
        number price
        string category
        ObjectId organizerId FK
        boolean isActive "default: true"
        Date createdAt
        Date updatedAt
    }

    Booking {
        ObjectId _id PK
        ObjectId eventId FK
        ObjectId userId FK
        number ticketQuantity "min: 1"
        number totalAmount "min: 0"
        enum status "confirmed|cancelled|pending"
        Date bookingDate "default: now"
        enum paymentStatus "paid|pending|failed|refunded"
        enum paymentMethod "credit_card|debit_card|paypal|stripe|cash"
        string paymentTransactionId
        string cancellationReason
        Date cancelledAt
        Date createdAt
        Date updatedAt
    }

    EventCapacityLog {
        ObjectId _id PK
        ObjectId eventId FK
        enum operation "reserve|release"
        number quantity
        Date timestamp "default: now"
        ObjectId bookingId FK "optional"
    }

    %% Relationships
    User ||--o{ Session : "has many sessions"
    User ||--o{ Event : "organizes (organizerId)"
    User ||--o{ Booking : "makes bookings"
    Event ||--o{ Booking : "receives bookings"
    Event ||--o{ EventCapacityLog : "tracks capacity changes"
    Booking ||--o| EventCapacityLog : "may log capacity changes"

    %% Indexes and Constraints
    User {
        index email_isActive "email + isActive"
        index lockedUntil_ttl "TTL index"
    }

    Session {
        index userId_isRevoked "userId + isRevoked"
        index sessionId "sessionId"
        index refreshToken "refreshToken"
        index expiresAt_ttl "TTL index"
    }

    Event {
        index isActive_category_dateTime "isActive + category + dateTime"
        index organizerId "organizerId"
    }

    Booking {
        index eventId_status "eventId + status"
        index userId_status "userId + status"
        index bookingDate "bookingDate desc"
        index status_paymentStatus "status + paymentStatus"
        unique_constraint userId_eventId "unique per active booking"
    }

    EventCapacityLog {
        index eventId_timestamp "eventId + timestamp desc"
    }
```

## Key Relationships & Business Rules

### **User Management**
- **Users** can have multiple **Sessions** for device management
- **Users** can organize multiple **Events** (via `organizerId`)
- **Users** can make multiple **Bookings**
- Account locking mechanism with `failedLoginAttempts` and `lockedUntil`

### **Event Management**
- **Events** are created by **Users** (organizers)
- **Events** track available tickets through `availableTickets` field
- **Events** can have multiple **Bookings**
- **EventCapacityLog** maintains audit trail of ticket reservations/releases

### **Booking System**
- **Bookings** link **Users** to **Events**
- Unique constraint: One active booking per user per event
- Payment tracking with status and transaction ID
- Cancellation support with reason and timestamp

### **Capacity Management**
- **EventCapacityLog** tracks all capacity changes
- Links to **Bookings** when capacity changes are booking-related
- Supports both "reserve" and "release" operations

## Database Indexes

### **Performance Optimizations**
- **User**: Email + Active status for authentication
- **Session**: User-based lookups and cleanup
- **Event**: Active events by category and date
- **Booking**: Event and user-based queries, payment status filtering
- **EventCapacityLog**: Event-based capacity tracking

### **TTL (Time To Live) Indexes**
- **User**: Auto-cleanup of expired locks
- **Session**: Auto-cleanup of expired sessions
- **EventCapacityLog**: Automatic cleanup based on timestamp

## Security Features

### **Authentication & Authorization**
- Secure session management with refresh tokens
- Device tracking for security monitoring
- Account locking after failed attempts
- Role-based access control (user/admin)

### **Data Protection**
- Password fields excluded from JSON serialization
- Sensitive fields hidden in API responses
- Audit trail for capacity changes