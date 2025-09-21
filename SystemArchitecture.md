# Overall System Architecture

```mermaid
sequenceDiagram
    participant Client
    participant Gateway as API Gateway
    participant Redis
    participant NATS
    participant AuthSvc as Auth Service
    participant EventSvc as Event Service
    participant BookingSvc as Booking Service
    participant MongoDB

    Client->>Gateway: HTTP Request /api/auth/login
    Gateway->>Redis: Rate limit check
    Gateway->>NATS: Request to auth.login
    NATS->>AuthSvc: Forward request
    AuthSvc->>MongoDB: User lookup/validation
    AuthSvc->>NATS: Response with JWT
    NATS->>Gateway: Forward response
    Gateway->>Client: HTTP Response

    Client->>Gateway: HTTP Request /api/bookings (with JWT)
    Gateway->>Gateway: Auth middleware validates JWT
    Gateway->>NATS: Request to booking.create
    NATS->>BookingSvc: Forward request
    BookingSvc->>MongoDB: Create booking
    BookingSvc->>NATS: Response
    Gateway->>Client: HTTP Response
```

-------------------------------------------------------------


# Nats Communication Flow

```mermaid
sequenceDiagram
    participant Gateway as API Gateway
    participant NatsClient as NATS Client
    participant NatsBroker as NATS Broker
    participant Service as Microservice

    Gateway->>NatsClient: connectNats()
    NatsClient->>NatsBroker: connect() with reconnect config
    NatsBroker->>NatsClient: connection established
    NatsClient->>Gateway: client ready

    Gateway->>NatsClient: request('auth.login', userData)
    NatsClient->>NatsClient: add messageId + timestamp
    NatsClient->>NatsBroker: publish with timeout
    NatsBroker->>Service: forward request
    Service->>NatsBroker: response
    NatsBroker->>NatsClient: response received
    NatsClient->>Gateway: decoded response

    Note over NatsClient,NatsBroker: Auto-reconnection on failure
    NatsBroker--xNatsClient: connection lost
    NatsClient->>NatsClient: retry connection
    NatsClient->>NatsBroker: reconnect attempt
```

--------------------------------------------------------------------

# Auth Middleware Flow

```mermaid
sequenceDiagram
    participant Client
    participant Gateway as Auth Middleware
    participant JWT as JWT Utils
    participant Redis as Redis Cache
    participant SessionDB as Session Database
    participant UserDB as User Database
    participant Handler as Route Handler

    Note over Client,Handler: Successful Authentication Flow
    Client->>Gateway: Request with Authorization: Bearer <access_token>
    Gateway->>Gateway: Extract token from header
    
    Gateway->>JWT: JWTUtils.verifyToken(token)
    JWT->>Gateway: decoded payload {userId, email, sessionId, type}
    
    Gateway->>Gateway: Validate token.type === 'access'
    
    Gateway->>SessionDB: Session.findOne({sessionId, userId, isRevoked: false})
    SessionDB->>Gateway: Session document
    
    Gateway->>Gateway: Check session.expiresAt > now()
    
    Gateway->>Redis: get(`user:${userId}`)
    alt Cache Hit
        Redis->>Gateway: Cached user data
    else Cache Miss
        Redis->>Gateway: null
        Gateway->>UserDB: User.findById(userId)
        UserDB->>Gateway: User document
        Gateway->>Gateway: Check user.isActive
        Gateway->>Redis: set(`user:${userId}`, userData, 3600)
    end
    
    Gateway->>SessionDB: Update session activity (optional)
    Gateway->>Gateway: Populate req.user & req.sessionId
    Gateway->>Handler: next() - proceed to route

    Note over Client,Handler: Failed Authentication Flows
    
    rect rgb(255, 240, 240)
        Note over Gateway: No Token Provided
        Client->>Gateway: Request without Authorization header
        Gateway->>Client: 401 "No token provided"
    end
    
    rect rgb(255, 240, 240)
        Note over Gateway: Invalid JWT Token
        Client->>Gateway: Request with malformed/expired JWT
        Gateway->>JWT: JWTUtils.verifyToken(token)
        JWT-->>Gateway: throws error
        Gateway->>Client: 401 "Invalid or expired token"
    end
    
    rect rgb(255, 240, 240)
        Note over Gateway: Wrong Token Type
        Client->>Gateway: Request with refresh token as access token
        Gateway->>JWT: JWTUtils.verifyToken(token)
        JWT->>Gateway: decoded payload {type: 'refresh'}
        Gateway->>Gateway: Check token.type !== 'access'
        Gateway->>Client: 401 "Invalid token type"
    end
    
    rect rgb(255, 240, 240)
        Note over Gateway: Session Revoked/Invalid
        Client->>Gateway: Request with valid JWT but revoked session
        Gateway->>SessionDB: Session.findOne({sessionId, isRevoked: false})
        SessionDB->>Gateway: null (session revoked/not found)
        Gateway->>Client: 401 "Session invalid or expired"
    end
    
    rect rgb(255, 240, 240)
        Note over Gateway: Session Expired
        Client->>Gateway: Request with expired session
        Gateway->>SessionDB: Session.findOne(...)
        SessionDB->>Gateway: Session with expiresAt < now()
        Gateway->>SessionDB: Session.deleteOne() - cleanup
        Gateway->>Client: 401 "Session expired"
    end
    
    rect rgb(255, 240, 240)
        Note over Gateway: User Inactive/Deleted
        Client->>Gateway: Request for deactivated user
        Gateway->>Redis: get(`user:${userId}`)
        Redis->>Gateway: null (cache miss)
        Gateway->>UserDB: User.findById(userId)
        UserDB->>Gateway: null OR user.isActive = false
        Gateway->>Client: 401 "User not found or inactive"
    end
```
----------------------------------------------------------------
# Sequence of Refresh Token Validation, Revocation, and New Token Issuance via NATS

```mermaid
sequenceDiagram
    participant Client
    participant APIGateway as API Gateway
    participant NATS
    participant AuthService as Auth Service
    participant SessionDB as Session DB
    participant UserDB as User DB

    %% Step 1: Access token expires
    Client->>APIGateway: Access resource (expired token)
    APIGateway-->>Client: 401 Unauthorized

    %% Step 2: Client sends refresh token
    Client->>APIGateway: POST /refresh { refreshToken }
    
    %% Step 3: API Gateway sends NATS request to Auth Service
    APIGateway->>NATS: publish request NATS_SUBJECTS.AUTH_REFRESH
    NATS->>AuthService: subscribe & receive refresh request

    %% Step 4: Auth Service validates session
    AuthService->>SessionDB: Find session by refreshToken & sessionId
    SessionDB-->>AuthService: Returns session (isRevoked=false, not expired)

    %% Step 5: Validate user
    AuthService->>UserDB: Find user by userId
    UserDB-->>AuthService: Return user document

    %% Step 6: Revoke old session & generate new tokens
    AuthService->>SessionDB: Mark old session as revoked
    AuthService-->>AuthService: Generate new access & refresh tokens

    %% Step 7: Reply back via NATS
    AuthService->>NATS: publish response with new tokens
    NATS->>APIGateway: receive refresh response

    %% Step 8: API Gateway sends new tokens to client
    APIGateway-->>Client: 200 OK { accessToken, refreshToken }

    %% Step 9: Client retries request with new access token
    Client->>APIGateway: Access resource (new token)
    APIGateway-->>Client: 200 OK { requested data }
```

-----------------------------------------------------------------

# Booking Routes Flow

```mermaid
sequenceDiagram
    participant Client
    participant BookingRoutes as Booking Routes
    participant AuthMW as Auth Middleware
    participant Validator as Zod Validator
    participant NATS
    participant BookingService as Booking Service

    Client->>BookingRoutes: POST /api/bookings
    BookingRoutes->>AuthMW: Check authentication
    AuthMW->>BookingRoutes: req.user populated
    BookingRoutes->>Validator: Validate request body
    Validator->>BookingRoutes: Parsed data
    BookingRoutes->>BookingRoutes: Add userId, messageId, timestamp
    BookingRoutes->>NATS: request(BOOKING_CREATE, data, 15s timeout)
    NATS->>BookingService: Forward request
    BookingService->>NATS: Response with booking data
    NATS->>BookingRoutes: Service response
    BookingRoutes->>Client: HTTP 201 + booking data

    Client->>BookingRoutes: GET /api/bookings (admin)
    BookingRoutes->>AuthMW: Check authentication
    BookingRoutes->>AuthMW: Check admin role
    BookingRoutes->>NATS: request(BOOKING_LIST, query)
    BookingService->>BookingRoutes: All bookings + pagination
    BookingRoutes->>Client: Admin booking list
```

------------------------------------------------------------------------
# Event Routes Flow

```mermaid
sequenceDiagram
    participant Client
    participant EventRoutes as Event Routes
    participant AuthMW as Auth Middleware
    participant AdminMW as Admin Middleware
    participant Validator as Zod Validator
    participant NATS
    participant EventService as Event Service

    Note over Client,EventService: POST /api/events - Create Event (Admin Only)
    Client->>EventRoutes: POST /api/events
    EventRoutes->>AuthMW: Verify JWT token
    AuthMW->>EventRoutes: req.user populated
    EventRoutes->>AdminMW: Check admin role
    AdminMW->>EventRoutes: Admin verified
    EventRoutes->>Validator: validate(createEventSchema)
    Validator->>EventRoutes: Request validated
    EventRoutes->>EventRoutes: Add organizerId from req.user._id
    EventRoutes->>NATS: request(EVENT_CREATE, 10s timeout)
    NATS->>EventService: Forward request
    EventService->>NATS: Event created response
    EventRoutes->>Client: HTTP 201 + event data

    Note over Client,EventService: GET /api/events - List All Events (Public)
    Client->>EventRoutes: GET /api/events
    EventRoutes->>NATS: request(EVENT_LIST, 10s timeout)
    NATS->>EventService: Forward request
    EventService->>NATS: Events array response
    EventRoutes->>Client: HTTP 200 + events list

    Note over Client,EventService: GET /api/events/:eventId - Get Single Event (Public)
    Client->>EventRoutes: GET /api/events/:eventId
    EventRoutes->>Validator: validate(getEventSchema) on params
    Validator->>EventRoutes: eventId validated
    EventRoutes->>NATS: request(EVENT_GET, 10s timeout)
    NATS->>EventService: Forward request
    EventService->>NATS: Event data response
    EventRoutes->>Client: HTTP 200 + event data

    Note over Client,EventService: PUT /api/events/:eventId - Update Event (Admin Only)
    Client->>EventRoutes: PUT /api/events/:eventId
    EventRoutes->>AuthMW: Verify JWT token
    EventRoutes->>AdminMW: Check admin role
    EventRoutes->>Validator: validate(updateEventSchema) on body
    Validator->>EventRoutes: Updates object validated
    EventRoutes->>NATS: request(EVENT_UPDATE, 10s timeout)
    NATS->>EventService: Forward request
    EventService->>NATS: Updated event response
    EventRoutes->>Client: HTTP 200 + updated event

    Note over Client,EventService: DELETE /api/events/:eventId - Delete Event (Admin Only)
    Client->>EventRoutes: DELETE /api/events/:eventId
    EventRoutes->>AuthMW: Verify JWT token
    EventRoutes->>AdminMW: Check admin role
    EventRoutes->>Validator: validate(deleteEventSchema) on params
    EventRoutes->>NATS: request(EVENT_DELETE, 10s timeout)
    NATS->>EventService: Forward request
    EventService->>NATS: Deletion confirmation
    EventRoutes->>Client: HTTP 200 + success message

    Note over Client,EventService: GET /api/events/search/:searchTerm - Search Events (Public)
    Client->>EventRoutes: GET /api/events/search/:term
    EventRoutes->>Validator: validate(searchEventSchema) on params
    EventRoutes->>NATS: request(EVENT_SEARCH, 10s timeout)
    NATS->>EventService: Forward search request
    EventService->>NATS: Search results response
    EventRoutes->>Client: HTTP 200 + search results

    Note over Client,EventService: GET /api/events/organizer/:organizerId - Get Organizer Events (Auth Required)
    Client->>EventRoutes: GET /api/events/organizer/:id
    EventRoutes->>AuthMW: Verify JWT token
    EventRoutes->>NATS: request("event.organizer", 10s timeout)
    NATS->>EventService: Forward organizer request
    EventService->>NATS: Organizer events response
    EventRoutes->>Client: HTTP 200 + organizer events
```

-----------------------------------------------------------------------
# Auth Routes Flow

```mermaid
sequenceDiagram
    participant Client
    participant AuthRoutes as Auth Routes
    participant Validator as Zod Validator
    participant NATS
    participant AuthService as Auth Service

    Note over Client,AuthService: POST /api/auth/register - User Registration
    Client->>AuthRoutes: POST /api/auth/register
    AuthRoutes->>Validator: validate(userSchema)
    Validator->>AuthRoutes: {email, password, name, role} validated
    AuthRoutes->>AuthRoutes: Create AuthRegisterRequest with messageId/timestamp
    AuthRoutes->>NATS: request(AUTH_REGISTER, 10s timeout)
    NATS->>AuthService: Forward registration request
    AuthService->>AuthService: Password validation + hashing
    AuthService->>AuthService: Check duplicate email
    AuthService->>AuthService: Create user + generate JWT tokens
    AuthService->>NATS: {user, tokens} response
    NATS->>AuthRoutes: Registration response
    alt Registration successful
        AuthRoutes->>Client: HTTP 201 + {user, tokens}
    else Registration failed
        AuthRoutes->>Client: HTTP 400 + error message
    end

    Note over Client,AuthService: POST /api/auth/login - User Authentication
    Client->>AuthRoutes: POST /api/auth/login
    AuthRoutes->>Validator: validate(email + password only)
    Validator->>AuthRoutes: Login credentials validated
    AuthRoutes->>AuthRoutes: Create AuthLoginRequest with messageId/timestamp
    AuthRoutes->>NATS: request(AUTH_LOGIN, 10s timeout)
    NATS->>AuthService: Forward login request
    AuthService->>AuthService: Rate limiting + password validation
    AuthService->>AuthService: Account lockout check
    AuthService->>AuthService: Generate session + tokens
    AuthService->>NATS: {user, tokens} response
    NATS->>AuthRoutes: Login response
    alt Login successful
        AuthRoutes->>Client: HTTP 200 + {user, tokens}
    else Login failed
        AuthRoutes->>Client: HTTP 401 + error message
    end

    Note over Client,AuthService: POST /api/auth/refresh - Token Refresh
    Client->>AuthRoutes: POST /api/auth/refresh
    AuthRoutes->>Validator: validate(email + refreshToken)
    Validator->>AuthRoutes: Refresh token validated
    AuthRoutes->>AuthRoutes: Create refresh request with messageId/timestamp
    AuthRoutes->>NATS: request(AUTH_REFRESH, 10s timeout)
    NATS->>AuthService: Forward refresh request
    AuthService->>AuthService: Verify refresh token + session
    AuthService->>AuthService: Revoke old session + generate new tokens
    AuthService->>NATS: {tokens} response
    NATS->>AuthRoutes: Refresh response
    alt Token refresh successful
        AuthRoutes->>Client: HTTP 200 + {tokens}
    else Token refresh failed
        AuthRoutes->>Client: HTTP 401 + error message
    end

    Note over Client,AuthService: POST /api/auth/logout - User Logout
    Client->>AuthRoutes: POST /api/auth/logout
    AuthRoutes->>Validator: validate(refreshToken required)
    Validator->>AuthRoutes: Refresh token validated
    AuthRoutes->>AuthRoutes: Create logout request with messageId/timestamp
    AuthRoutes->>NATS: request(AUTH_LOGOUT, 5s timeout)
    NATS->>AuthService: Forward logout request
    AuthService->>AuthService: Find session + revoke
    AuthService->>AuthService: Clear user cache
    AuthService->>NATS: Success response
    NATS->>AuthRoutes: Logout response
    alt Logout successful
        AuthRoutes->>Client: HTTP 200 + success message
    else Logout failed
        AuthRoutes->>Client: HTTP 400 + error message
    end
```


-----------------------------------------------------------------------
# Booking Service Flow

```mermaid
sequenceDiagram
    participant Gateway
    participant BookingController as NATS Handlers
    participant BookingService as Business Logic
    participant Redis as Distributed Locks
    participant MongoDB as Database
    participant EventService as Event Service (via NATS)

    Gateway->>BookingController: NATS request(BOOKING_CREATE)
    BookingController->>BookingService: createBooking()
    BookingService->>Redis: withLock(event:ID)
    BookingService->>MongoDB: Find event & user
    BookingService->>EventService: NATS request(EVENT_CAPACITY_RESERVE)
    EventService->>BookingService: Capacity reserved
    BookingService->>MongoDB: Save booking + Update event
    BookingService->>EventService: Publish BOOKING_CREATED event
    BookingService->>Redis: Release lock
    BookingController->>Gateway: NATS reply with booking data

    Note over BookingController,MongoDB: Cleanup Process (Every 30min)
    BookingController->>BookingService: cleanupExpiredBookings()
    BookingService->>MongoDB: Find expired pending bookings
    BookingService->>BookingService: Auto-cancel expired bookings

```

-----------------------------------------------------------------------
# Event Service Flow

```mermaid
sequenceDiagram
    participant Gateway
    participant EventController as NATS Handlers
    participant EventService as Business Logic
    participant Redis as Cache/Locks
    participant MongoDB as Database
    participant CircuitBreaker as Circuit Breaker

    Gateway->>EventController: NATS request(EVENT_CREATE)
    EventController->>EventService: createEvent()
    EventService->>CircuitBreaker: execute(operation)
    CircuitBreaker->>EventService: allow execution
    EventService->>Redis: withLock(event_create)
    EventService->>MongoDB: Check duplicate & save event
    EventService->>Redis: cacheEventData()
    EventService->>EventController: Return event response
    EventController->>Gateway: NATS reply with event data

    Note over EventController,MongoDB: Cleanup Process (Every hour)
    EventController->>EventService: cleanupExpiredEvents()
    EventService->>MongoDB: Find expired events with no sales
    EventService->>MongoDB: Delete expired events
    EventService->>Redis: Clear cached data
```

------------------------------------------------------------------------
# Auth Service Flow

```mermaid
sequenceDiagram
    participant Gateway
    participant AuthController as NATS Handlers
    participant AuthService as Business Logic
    participant Redis as Cache/Locks
    participant MongoDB as Database
    participant JWT as JWT Utils

    Gateway->>AuthController: NATS request(AUTH_LOGIN)
    AuthController->>AuthService: login(email, password, deviceInfo)
    AuthService->>Redis: withLock(login:email)
    AuthService->>Redis: rateLimit(login_attempts)
    AuthService->>MongoDB: Find user + validate password
    AuthService->>AuthService: cleanupOldSessions()
    AuthService->>JWT: generateTokensWithSession()
    AuthService->>MongoDB: Save new session
    AuthService->>Redis: cacheUserData()
    AuthService->>AuthController: Return user + tokens
    AuthController->>Gateway: NATS reply with auth data

    Note over AuthController,MongoDB: Token Refresh Flow
    Gateway->>AuthController: NATS request(AUTH_REFRESH)
    AuthService->>JWT: verifyToken(refreshToken)
    AuthService->>MongoDB: Find session + validate
    AuthService->>MongoDB: Revoke old session + create new
    AuthController->>Gateway: Return new tokens
```
