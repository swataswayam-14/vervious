# Booking Service Redis Usage — Explanation

## createBooking — Rate limiting & distributed locking

### What happens here?

**Rate Limiting:**
```javascript
const allowed = await redis.rateLimit(
  `user:${bookingData.userId}:book`,
  5,
  10000
);
```
- Each user can only attempt up to 5 bookings within 10 seconds.

**Locking:**
```javascript
return await redis.withLock(`event:${bookingData.eventId}`, async () => {
  // critical section
});
```
- Only one process at a time can modify ticket counts for the same event.

### Why is this useful?

**Rate limiting** prevents a malicious or buggy client from hammering the booking API, which could otherwise:
- Overload your database.
- Cause denial of service for genuine users.
- Inflate NATS traffic.

**Distributed lock** prevents a classic "overselling tickets" problem:
- Without a lock, if two users book the last seat at the same millisecond, both would succeed.
- With a lock, only one succeeds, the other gets a "sold out" error.



## cancelBooking — Rate limiting & locking for cancellations

### What happens here?

**Rate limiting:**
```javascript
const allowed = await redis.rateLimit(
  `user:${userId}:cancel`,
  3, // max 3 cancels
  30000 // per 30 seconds
);
```
- A user cannot spam cancellation requests more than 3 times per 30 seconds.

**Locking:**
```javascript
return redis.withLock(`booking:${bookingId}`, async () => {
  // cancellation logic
});
```
- Only one process can cancel a booking at a time.

### Why is this useful?

**Rate limiting** prevents abuse:
- Without this, a bot could spam cancellations, potentially triggering constant capacity release/rebook loops.
- This protects your NATS message broker and DB from being overloaded.

**Locking** ensures no double cancellations:
- If cancellation is already in progress, another process can't touch it until it's done.
- Prevents inconsistent states like one thread setting status=cancelled while another issues a refund simultaneously.


## cleanupExpiredBookings — Automatic cancellation of pending bookings

### What happens here?

The system checks for "stale bookings" (pending > 1 hour).

For each, it acquires a lock before attempting cancellation:
```javascript
await redis.withLock(`booking:${booking._id}`, async () => {
  await this.cancelBooking(...);
});
```

### Why is this useful?

**Prevents dangling reservations:**
- If a user started booking but never paid, those tickets remain "blocked".
- The cleanup job automatically frees them after 1 hour.
- The lock ensures that if multiple cleanup jobs (on different service instances) try to cancel the same booking, only one actually succeeds.


## Summary — Why this design matters

- **Fairness** → No user can abuse the system with excessive booking/cancel requests.
- **Consistency** → Tickets can't be oversold or refunded twice.
- **Reliability** → Expired reservations are cleaned up automatically, freeing capacity.
- **Scalability** → Locks + rate limits work across multiple instances of booking service (distributed environment).
- **Real-world trust** → Users see reliable booking counts (no "phantom tickets" or "ghost cancellations").