# Event Booking API - Complete Documentation

A comprehensive RESTful API for managing events, bookings, and user authentication. This API uses NATS messaging for microservice communication and provides endpoints for user registration, event management, and booking operations.

This API provides a complete event booking platform with:
- JWT-based authentication system
- Role-based access control (user/admin)
- Event creation and management
- Booking system with payment tracking
- Search and filtering capabilities
- Comprehensive admin statistics

## 🚀 Base URLs

- **Development**: `http://localhost:3000`
- **Production**: `http://135.235.247.214:3000`

All endpoints should be prefixed with the base URL.

## 🔐 Authentication

### Security Scheme
- **Type**: HTTP Bearer Token (JWT)
- **Format**: JWT
- **Header**: `Authorization: Bearer <token>`

### Token Types
- **Access Token**: Short-lived (15 minutes) - for API requests
- **Refresh Token**: Long-lived (7 days) - for obtaining new access tokens

### Roles
- **user**: Regular user with booking capabilities
- **admin**: Administrator with full system access

---

## 🏥 Health Check

### GET /health
Check the current health status of the API and connected services.

**Authentication**: Not required

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2024-01-15T10:30:00.000Z",
    "services": {
      "nats": true,
      "redis": true
    }
  }
}
```

**Example**:
```bash
curl -X GET http://135.235.247.214:3000/health
```

---

## 🔑 Authentication Endpoints

### POST /api/auth/register
Register a new user account with email verification.

**Authentication**: Not required

**Request Body**:
```json
{
  "email": "user@example.com",
  "password": "password123",
  "name": "John Doe",
  "role": "user"
}
```

**Required Fields**:
- `email` (string, email format)
- `password` (string, min 8 characters)
- `name` (string, 2-100 characters)
- `role` (string, enum: ["user", "admin"])

**Response (201)**:
```json
{
  "success": true,
  "data": {
    "user": {
      "_id": "507f1f77bcf86cd799439011",
      "email": "user@example.com",
      "name": "John Doe",
      "role": "user",
      "isActive": true,
      "lastLogin": "2024-01-15T10:30:00.000Z",
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    },
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
  },
  "message": "User registered successfully"
}
```

**Error (400)**:
```json
{
  "success": false,
  "error": "Validation failed or user already exists",
  "data": []
}
```

**Example**:
```bash
curl -X POST http://135.235.247.214:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123",
    "name": "John Doe",
    "role": "user"
  }'
```

### POST /api/auth/login
Authenticate user credentials and return access tokens.

**Authentication**: Not required

**Request Body**:
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Required Fields**:
- `email` (string, email format)
- `password` (string)

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "user": {
      "_id": "507f1f77bcf86cd799439011",
      "email": "user@example.com",
      "name": "John Doe",
      "role": "user",
      "isActive": true,
      "lastLogin": "2024-01-15T10:30:00.000Z",
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    },
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
  },
  "message": "User registered successfully"
}
```

**Error (401)**:
```json
{
  "success": false,
  "error": "Invalid credentials",
  "data": []
}
```

**Example**:
```bash
curl -X POST http://135.235.247.214:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123"
  }'
```

### POST /api/auth/refresh
Generate new access token using refresh token.

**Authentication**: Not required

**Request Body**:
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Required Fields**:
- `refreshToken` (string)

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
  },
  "message": "Token refreshed successfully"
}
```

**Error (401)**:
```json
{
  "success": false,
  "error": "Invalid refresh token",
  "data": []
}
```

**Example**:
```bash
curl -X POST http://135.235.247.214:3000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "your_refresh_token_here"
  }'
```

### POST /api/auth/logout
Invalidate the refresh token.

**Authentication**: Not required

**Request Body**:
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Required Fields**:
- `refreshToken` (string)

**Response (200)**:
```json
{
  "success": true,
  "message": "Operation completed successfully"
}
```

**Error (400)**:
```json
{
  "success": false,
  "error": "Invalid refresh token",
  "data": []
}
```

**Example**:
```bash
curl -X POST http://135.235.247.214:3000/api/auth/logout \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "your_refresh_token_here"
  }'
```

---

## 🎯 Event Management

### GET /api/events
Retrieve a list of all active events.

**Authentication**: Not required

**Response (200)**:
```json
{
  "success": true,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439012",
      "name": "Tech Conference 2024",
      "description": "Annual technology conference featuring latest innovations",
      "venue": "Convention Center, Downtown",
      "dateTime": "2024-06-15T09:00:00.000Z",
      "capacity": 500,
      "availableTickets": 450,
      "price": 99.99,
      "category": "Technology",
      "organizerId": "507f1f77bcf86cd799439011",
      "isActive": true,
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    }
  ],
  "message": "Events retrieved successfully"
}
```

**Error (400)**:
```json
{
  "success": false,
  "error": "Failed to retrieve events",
  "data": []
}
```

**Example**:
```bash
curl -X GET http://135.235.247.214:3000/api/events
```

### POST /api/events
Create a new event (Admin only).

**Authentication**: Required (Admin role)

**Request Body**:
```json
{
  "name": "Tech Conference 2024",
  "description": "Annual technology conference featuring latest innovations",
  "venue": "Convention Center, Downtown",
  "dateTime": "2024-06-15T09:00:00.000Z",
  "capacity": 500,
  "price": 99.99,
  "category": "Technology"
}
```

**Required Fields**:
- `name` (string, min 1 character)
- `description` (string)
- `venue` (string)
- `dateTime` (string, ISO 8601 format)
- `capacity` (integer, min 1)
- `price` (number, min 0)
- `category` (string)

**Response (201)**:
```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439012",
    "name": "Tech Conference 2024",
    "description": "Annual technology conference featuring latest innovations",
    "venue": "Convention Center, Downtown",
    "dateTime": "2024-06-15T09:00:00.000Z",
    "capacity": 500,
    "availableTickets": 450,
    "price": 99.99,
    "category": "Technology",
    "organizerId": "507f1f77bcf86cd799439011",
    "isActive": true,
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  },
  "message": "Event retrieved successfully"
}
```

**Errors**:
- **400**: Validation failed
- **401**: Unauthorized
- **403**: Forbidden - Admin access required

**Example**:
```bash
curl -X POST http://135.235.247.214:3000/api/events \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_admin_token" \
  -d '{
    "name": "Tech Conference 2024",
    "description": "Annual technology conference",
    "venue": "Convention Center",
    "dateTime": "2024-06-15T09:00:00.000Z",
    "capacity": 500,
    "price": 99.99,
    "category": "Technology"
  }'
```

### GET /api/events/{eventId}
Retrieve detailed information about a specific event.

**Authentication**: Not required

**Path Parameters**:
- `eventId` (string, required): The event ID

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439012",
    "name": "Tech Conference 2024",
    "description": "Annual technology conference featuring latest innovations",
    "venue": "Convention Center, Downtown",
    "dateTime": "2024-06-15T09:00:00.000Z",
    "capacity": 500,
    "availableTickets": 450,
    "price": 99.99,
    "category": "Technology",
    "organizerId": "507f1f77bcf86cd799439011",
    "isActive": true,
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  },
  "message": "Event retrieved successfully"
}
```

**Errors**:
- **400**: Invalid event ID
- **404**: Event not found

**Example**:
```bash
curl -X GET http://135.235.247.214:3000/api/events/507f1f77bcf86cd799439012
```

### PUT /api/events/{eventId}
Update an existing event (Admin only).

**Authentication**: Required (Admin role)

**Path Parameters**:
- `eventId` (string, required): The event ID

**Request Body**:
```json
{
  "updates": {
    "name": "Updated Event Name",
    "description": "Updated description",
    "venue": "New Venue Location",
    "dateTime": "2024-06-15T09:00:00.000Z",
    "capacity": 600,
    "availableTickets": 450,
    "price": 89.99,
    "category": "Technology",
    "isActive": true
  }
}
```

**Optional Fields in updates**:
- `name` (string)
- `description` (string)
- `venue` (string)
- `dateTime` (string, ISO 8601 format)
- `capacity` (integer, min 1)
- `availableTickets` (integer, min 0)
- `price` (number, min 0)
- `category` (string)
- `isActive` (boolean)

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439012",
    "name": "Updated Event Name",
    "description": "Updated description",
    "venue": "New Venue Location",
    "dateTime": "2024-06-15T09:00:00.000Z",
    "capacity": 600,
    "availableTickets": 450,
    "price": 89.99,
    "category": "Technology",
    "organizerId": "507f1f77bcf86cd799439011",
    "isActive": true,
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  },
  "message": "Event retrieved successfully"
}
```

**Errors**:
- **400**: Validation failed
- **401**: Unauthorized
- **403**: Forbidden - Admin access required

**Example**:
```bash
curl -X PUT http://135.235.247.214:3000/api/events/507f1f77bcf86cd799439012 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_admin_token" \
  -d '{
    "updates": {
      "name": "Updated Conference Name",
      "price": 89.99
    }
  }'
```

### DELETE /api/events/{eventId}
Delete an existing event (Admin only).

**Authentication**: Required (Admin role)

**Path Parameters**:
- `eventId` (string, required): The event ID

**Response (200)**:
```json
{
  "success": true,
  "message": "Operation completed successfully"
}
```

**Errors**:
- **400**: Failed to delete event
- **401**: Unauthorized
- **403**: Forbidden - Admin access required

**Example**:
```bash
curl -X DELETE http://135.235.247.214:3000/api/events/507f1f77bcf86cd799439012 \
  -H "Authorization: Bearer your_admin_token"
```

### GET /api/events/search/{searchTerm}
Search events by name, description, or category.

**Authentication**: Not required

**Path Parameters**:
- `searchTerm` (string, required): Search term

**Response (200)**:
```json
{
  "success": true,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439012",
      "name": "Tech Conference 2024",
      "description": "Annual technology conference featuring latest innovations",
      "venue": "Convention Center, Downtown",
      "dateTime": "2024-06-15T09:00:00.000Z",
      "capacity": 500,
      "availableTickets": 450,
      "price": 99.99,
      "category": "Technology",
      "organizerId": "507f1f77bcf86cd799439011",
      "isActive": true,
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    }
  ],
  "message": "Events retrieved successfully"
}
```

**Error (400)**:
```json
{
  "success": false,
  "error": "Invalid search term",
  "data": []
}
```

**Example**:
```bash
curl -X GET http://135.235.247.214:3000/api/events/search/technology
```

### GET /api/events/organizer/{organizerId}
Retrieve all events created by a specific organizer.

**Authentication**: Required

**Path Parameters**:
- `organizerId` (string, required): The organizer ID

**Response (200)**:
```json
{
  "success": true,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439012",
      "name": "Tech Conference 2024",
      "description": "Annual technology conference featuring latest innovations",
      "venue": "Convention Center, Downtown",
      "dateTime": "2024-06-15T09:00:00.000Z",
      "capacity": 500,
      "availableTickets": 450,
      "price": 99.99,
      "category": "Technology",
      "organizerId": "507f1f77bcf86cd799439011",
      "isActive": true,
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    }
  ],
  "message": "Events retrieved successfully"
}
```

**Errors**:
- **400**: Invalid organizer ID
- **401**: Unauthorized

**Example**:
```bash
curl -X GET http://135.235.247.214:3000/api/events/organizer/507f1f77bcf86cd799439011 \
  -H "Authorization: Bearer your_token"
```

---

## 🎫 Booking Management

### GET /api/bookings
Get all bookings with optional filtering (Admin only).

**Authentication**: Required (Admin role)

**Query Parameters**:
- `eventId` (string, optional): Filter by event ID
- `status` (string, optional): Filter by booking status ["confirmed", "cancelled", "pending"]
- `page` (integer, optional, default: 1, min: 1): Page number for pagination
- `limit` (integer, optional, default: 10, min: 1, max: 100): Number of items per page

**Response (200)**:
```json
{
  "success": true,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439013",
      "eventId": "507f1f77bcf86cd799439012",
      "userId": "507f1f77bcf86cd799439011",
      "ticketQuantity": 2,
      "totalAmount": 199.98,
      "status": "confirmed",
      "bookingDate": "2024-01-15T10:30:00.000Z",
      "paymentStatus": "completed",
      "paymentMethod": "credit_card",
      "event": {
        "name": "Tech Conference 2024",
        "venue": "Convention Center, Downtown",
        "dateTime": "2024-06-15T09:00:00.000Z"
      },
      "user": {
        "name": "John Doe",
        "email": "john@example.com"
      },
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 100,
    "pages": 10
  },
  "message": "Bookings retrieved successfully"
}
```

**Errors**:
- **401**: Unauthorized
- **403**: Forbidden - Admin access required

**Example**:
```bash
curl -X GET "http://135.235.247.214:3000/api/bookings?status=confirmed&page=1&limit=20" \
  -H "Authorization: Bearer your_admin_token"
```

### POST /api/bookings
Create a new booking for an event.

**Authentication**: Required

**Request Body**:
```json
{
  "eventId": "507f1f77bcf86cd799439012",
  "ticketQuantity": 2,
  "totalAmount": 199.98,
  "paymentMethod": "credit_card"
}
```

**Required Fields**:
- `eventId` (string)
- `ticketQuantity` (integer, min 1)
- `totalAmount` (number, min 0.01)

**Optional Fields**:
- `paymentMethod` (string)

**Response (201)**:
```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439013",
    "eventId": "507f1f77bcf86cd799439012",
    "userId": "507f1f77bcf86cd799439011",
    "ticketQuantity": 2,
    "totalAmount": 199.98,
    "status": "confirmed",
    "bookingDate": "2024-01-15T10:30:00.000Z",
    "paymentStatus": "completed",
    "paymentMethod": "credit_card",
    "event": {
      "name": "Tech Conference 2024",
      "venue": "Convention Center, Downtown",
      "dateTime": "2024-06-15T09:00:00.000Z"
    },
    "user": {
      "name": "John Doe",
      "email": "john@example.com"
    },
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  },
  "message": "Booking retrieved successfully"
}
```

**Errors**:
- **400**: Validation failed or insufficient capacity
- **401**: Unauthorized

**Example**:
```bash
curl -X POST http://135.235.247.214:3000/api/bookings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_token" \
  -d '{
    "eventId": "507f1f77bcf86cd799439012",
    "ticketQuantity": 2,
    "totalAmount": 199.98,
    "paymentMethod": "credit_card"
  }'
```

### GET /api/bookings/my-bookings
Get current user's bookings.

**Authentication**: Required

**Query Parameters**:
- `eventId` (string, optional): Filter by event ID
- `status` (string, optional): Filter by booking status ["confirmed", "cancelled", "pending"]
- `page` (integer, optional, default: 1, min: 1): Page number for pagination
- `limit` (integer, optional, default: 10, min: 1, max: 100): Number of items per page

**Response (200)**:
```json
{
  "success": true,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439013",
      "eventId": "507f1f77bcf86cd799439012",
      "userId": "507f1f77bcf86cd799439011",
      "ticketQuantity": 2,
      "totalAmount": 199.98,
      "status": "confirmed",
      "bookingDate": "2024-01-15T10:30:00.000Z",
      "paymentStatus": "completed",
      "paymentMethod": "credit_card",
      "event": {
        "name": "Tech Conference 2024",
        "venue": "Convention Center, Downtown",
        "dateTime": "2024-06-15T09:00:00.000Z"
      },
      "user": {
        "name": "John Doe",
        "email": "john@example.com"
      },
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 100,
    "pages": 10
  },
  "message": "Bookings retrieved successfully"
}
```

**Error (401)**:
```json
{
  "success": false,
  "error": "Unauthorized",
  "data": []
}
```

**Example**:
```bash
curl -X GET "http://135.235.247.214:3000/api/bookings/my-bookings?status=confirmed" \
  -H "Authorization: Bearer your_token"
```

### GET /api/bookings/{bookingId}
Retrieve detailed information about a specific booking.

**Authentication**: Required

**Path Parameters**:
- `bookingId` (string, required): The booking ID

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439013",
    "eventId": "507f1f77bcf86cd799439012",
    "userId": "507f1f77bcf86cd799439011",
    "ticketQuantity": 2,
    "totalAmount": 199.98,
    "status": "confirmed",
    "bookingDate": "2024-01-15T10:30:00.000Z",
    "paymentStatus": "completed",
    "paymentMethod": "credit_card",
    "event": {
      "name": "Tech Conference 2024",
      "venue": "Convention Center, Downtown",
      "dateTime": "2024-06-15T09:00:00.000Z"
    },
    "user": {
      "name": "John Doe",
      "email": "john@example.com"
    },
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  },
  "message": "Booking retrieved successfully"
}
```

**Errors**:
- **400**: Invalid booking ID
- **401**: Unauthorized
- **404**: Booking not found

**Example**:
```bash
curl -X GET http://135.235.247.214:3000/api/bookings/507f1f77bcf86cd799439013 \
  -H "Authorization: Bearer your_token"
```

### PUT /api/bookings/{bookingId}/cancel
Cancel an existing booking.

**Authentication**: Required

**Path Parameters**:
- `bookingId` (string, required): The booking ID

**Request Body**:
```json
{
  "reason": "Change in plans"
}
```

**Optional Fields**:
- `reason` (string): Reason for cancellation

**Response (200)**:
```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439013",
    "eventId": "507f1f77bcf86cd799439012",
    "userId": "507f1f77bcf86cd799439011",
    "ticketQuantity": 2,
    "totalAmount": 199.98,
    "status": "cancelled",
    "bookingDate": "2024-01-15T10:30:00.000Z",
    "paymentStatus": "completed",
    "paymentMethod": "credit_card",
    "event": {
      "name": "Tech Conference 2024",
      "venue": "Convention Center, Downtown",
      "dateTime": "2024-06-15T09:00:00.000Z"
    },
    "user": {
      "name": "John Doe",
      "email": "john@example.com"
    },
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  },
  "message": "Booking retrieved successfully"
}
```

**Errors**:
- **400**: Failed to cancel booking
- **401**: Unauthorized

**Example**:
```bash
curl -X PUT http://135.235.247.214:3000/api/bookings/507f1f77bcf86cd799439013/cancel \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_token" \
  -d '{
    "reason": "Unable to attend"
  }'
```

### POST /api/bookings/{bookingId}/validate

Validate a booking for event entry (Admin only).

**Authentication**: Required (Admin role)

**Path Parameters**:

* `bookingId` (string, required): The booking ID

**Request Body**:

```json
{
  "eventId": "507f1f77bcf86cd799439012"
}
```

**Required Fields**:

* `eventId` (string)

**Response (200)**:

```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439013",
    "eventId": "507f1f77bcf86cd799439012",
    "userId": "507f1f77bcf86cd799439011",
    "ticketQuantity": 2,
    "totalAmount": 199.98,
    "status": "confirmed",
    "bookingDate": "2024-01-15T10:30:00.000Z",
    "paymentStatus": "completed",
    "paymentMethod": "credit_card",
    "event": {
      "name": "Tech Conference 2024",
      "venue": "Convention Center, Downtown",
      "dateTime": "2024-06-15T09:00:00.000Z"
    },
    "user": {
      "name": "John Doe",
      "email": "john@example.com"
    },
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  },
  "message": "Booking validation completed"
}
```

**Response (400)**:

```json
{
  "success": false,
  "error": "Validation failed",
  "data": []
}
```

**Response (401)**:

```json
{
  "success": false,
  "error": "Unauthorized",
  "data": []
}
```

**Response (403)**:

```json
{
  "success": false,
  "error": "Forbidden - Admin access required",
  "data": []
}
```

**Example**:
```bash
curl -X POST http://135.235.247.214:3000/api/bookings/507f1f77bcf86cd799439013/validate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_admin_token" \
  -d '{
    "eventId": "507f1f77bcf86cd799439012"
  }'
```

---

### GET /api/bookings/event/{eventId}

Retrieve all bookings for a specific event (Admin only).

**Authentication**: Required (Admin role)

**Path Parameters**:

* `eventId` (string, required): The event ID

**Query Parameters**:

* `status` (string, optional): Filter by booking status. Allowed values: `confirmed`, `cancelled`, `pending`
* `page` (integer, optional): Page number for pagination (default: 1)
* `limit` (integer, optional): Number of items per page (default: 10, max: 100)

**Response (200)**:

```json
{
  "success": true,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439013",
      "eventId": "507f1f77bcf86cd799439012",
      "userId": "507f1f77bcf86cd799439011",
      "ticketQuantity": 2,
      "totalAmount": 199.98,
      "status": "confirmed",
      "bookingDate": "2024-01-15T10:30:00.000Z",
      "paymentStatus": "completed",
      "paymentMethod": "credit_card",
      "event": {"name": "Tech Conference 2024", "venue": "Convention Center, Downtown", "dateTime": "2024-06-15T09:00:00.000Z"},
      "user": {"name": "John Doe", "email": "john@example.com"},
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    }
  ],
  "pagination": {"page": 1, "limit": 10, "total": 100, "pages": 10},
  "message": "Bookings retrieved successfully"
}
```

**Response (400)**:

```json
{
  "success": false,
  "error": "Invalid event ID",
  "data": []
}
```

**Response (401)**:

```json
{
  "success": false,
  "error": "Unauthorized",
  "data": []
}
```

**Response (403)**:

```json
{
  "success": false,
  "error": "Forbidden - Admin access required",
  "data": []
}
```

**Example**:
```bash
curl -X GET "http://135.235.247.214:3000/api/bookings/event/507f1f77bcf86cd799439012?status=confirmed" \
  -H "Authorization: Bearer your_admin_token"
```

---

### POST /api/bookings/{bookingId}/confirm-payment

Confirm booking payment (Admin only).

**Authentication**: Required (Admin role)

**Path Parameters**:

* `bookingId` (string, required): The booking ID

**Request Body**:

```json
{
  "paymentTransactionId": "txn_1234567890"
}
```

**Response (200)**:

```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439013",
    "status": "confirmed",
    "paymentStatus": "completed"
  },
  "message": "Payment confirmed successfully"
}
```

**Response (400)**:

```json
{
  "success": false,
  "error": "Invalid payment information",
  "data": []
}
```

**Response (401)**:

```json
{
  "success": false,
  "error": "Unauthorized",
  "data": []
}
```

**Response (403)**:

```json
{
  "success": false,
  "error": "Forbidden - Admin access required",
  "data": []
}
```

**Example**:
```bash
curl -X POST http://135.235.247.214:3000/api/bookings/507f1f77bcf86cd799439013/confirm-payment \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_admin_token" \
  -d '{
    "paymentTransactionId": "txn_1234567890"
  }'
```

---

### GET /api/bookings/admin/stats

Get booking statistics (Admin only).

**Authentication**: Required (Admin role)

**Response (200)**:

```json
{
  "success": true,
  "data": {
    "totalBookings": 1500,
    "confirmedBookings": 1200,
    "cancelledBookings": 200,
    "pendingBookings": 100,
    "totalRevenue": 150000.00,
    "averageBookingValue": 125.50,
    "topEvents": [
      {"eventId": "507f1f77bcf86cd799439012", "eventName": "Tech Conference 2024", "bookingCount": 250, "revenue": 24975.00}
    ],
    "monthlyTrends": [
      {"month": "2024-01", "bookings": 120, "revenue": 12000.00}
    ]
  },
  "message": "Booking statistics retrieved successfully"
}
```

**Response (401)**:

```json
{
  "success": false,
  "error": "Unauthorized",
  "data": []
}
```

**Response (403)**:

```json
{
  "success": false,
  "error": "Forbidden - Admin access required",
  "data": []
}
```

**Example**:
```bash
curl -X GET http://135.235.247.214:3000/api/bookings/admin/stats \
  -H "Authorization: Bearer your_admin_token"
```
