//@ts-nocheck
import { Booking, type IBooking } from '../models/booking.model.js';
import { Event } from '../models/event.model.js';
import { User } from '../models/user.model.js';
import { EventCapacityLog } from '../models/eventCapacityLog.model.js';
import { logger } from '../utils/logger.js';
import { getNatsClient } from '../nats/client.js';
import { NATS_SUBJECTS } from '../types/message.types.js';
import { Types } from 'mongoose';
import { RedisClient } from '../redis/client.js';

interface CreateBookingInput {
  eventId: string;
  userId: string;
  ticketQuantity: number;
  totalAmount: number;
  paymentMethod?: string;
}

interface BookingDTO {
  id: string; 
  eventId: string;
  userId: string;
  ticketQuantity: number;
  totalAmount: number;
  status: 'confirmed' | 'pending' | 'cancelled';
  paymentStatus: 'paid' | 'pending' | 'failed' | 'refunded';
  paymentMethod?: string;
  bookingDate: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export class BookingService {
async createBooking(bookingData: CreateBookingInput): Promise<BookingDTO> {
  const redis = new RedisClient();
  await redis.connect();

  try {
    const allowed = await redis.rateLimit(
      `user:${bookingData.userId}:book`,
      5,
      10000
    );
    if (!allowed) {
      throw new Error("Too many booking attempts. Please try again later.");
    }

    return await redis.withLock(`event:${bookingData.eventId}`, async () => {
      const event = await Event.findById(bookingData.eventId);
      if (!event) throw new Error("Event not found");
      if (!event.isActive) throw new Error("Event is not active");
      if (new Date(event.dateTime) <= new Date()) throw new Error("Cannot book past events");

      const user = await User.findById(bookingData.userId);
      if (!user || !user.isActive) throw new Error("User not found or inactive");

      if (event.availableTickets < bookingData.ticketQuantity) {
        throw new Error(`Only ${event.availableTickets} tickets available`);
      }

      const expectedAmount = event.price * bookingData.ticketQuantity;
      if (Math.abs(bookingData.totalAmount - expectedAmount) > 0.01) {
        throw new Error("Invalid total amount");
      }

      const natsClient = getNatsClient();
      try {
        const capacityResponse = await natsClient.request(
          NATS_SUBJECTS.EVENT_CAPACITY_RESERVE,
          {
            eventId: bookingData.eventId,
            quantity: bookingData.ticketQuantity,
            messageId: Date.now().toString(),
            timestamp: new Date(),
          },
          5000
        );
        if (!capacityResponse.success) {
          throw new Error(capacityResponse.error || "Failed to reserve capacity");
        }
      } catch (error) {
        logger.error("Failed to reserve event capacity via NATS", { error });
        throw new Error("Failed to reserve tickets");
      }

      const booking = new Booking({
        eventId: bookingData.eventId,
        userId: bookingData.userId,
        ticketQuantity: bookingData.ticketQuantity,
        totalAmount: bookingData.totalAmount,
        status: 'pending',
        paymentStatus: 'pending',
        paymentMethod: bookingData.paymentMethod,
        bookingDate: new Date(),
      });

      const savedBooking = await booking.save();

      await Event.findByIdAndUpdate(event._id, {
        $inc: { availableTickets: -bookingData.ticketQuantity }
      });

      await EventCapacityLog.create([{
        eventId: event._id,
        operation: 'reserve',
        quantity: bookingData.ticketQuantity,
        timestamp: new Date(),
        bookingId: savedBooking._id
      }]);

      try {
        natsClient.publish(NATS_SUBJECTS.EVENT_BOOKING_CREATED, {
          bookingId: savedBooking._id.toString(),
          eventId: bookingData.eventId,
          userId: bookingData.userId,
          ticketQuantity: bookingData.ticketQuantity,
          totalAmount: bookingData.totalAmount,
          timestamp: new Date()
        });
      } catch (error) {
        logger.error("Failed to publish booking created event", { error });
      }

      logger.info("Booking created successfully", {
        bookingId: savedBooking._id.toString(),
        eventId: bookingData.eventId,
        userId: bookingData.userId
      });

      return {
        id: savedBooking._id.toString(),
        eventId: bookingData.eventId,
        userId: bookingData.userId,
        ticketQuantity: bookingData.ticketQuantity,
        totalAmount: bookingData.totalAmount,
        status: savedBooking.status,
        paymentStatus: savedBooking.paymentStatus,
        paymentMethod: savedBooking.paymentMethod,
        bookingDate: savedBooking.bookingDate,
        createdAt: savedBooking.createdAt,
        updatedAt: savedBooking.updatedAt
      };
    });

  } catch (error) {
    logger.error('Error creating booking', { error, bookingData });
    throw error;
  } finally {
    await redis.disconnect();
  }
}



async cancelBooking(
  bookingId: string,
  userId: string,
  reason?: string
): Promise<IBooking> {
  const redis = new RedisClient();
  await redis.connect();
  const allowed = await redis.rateLimit(
    `user:${userId}:cancel`,
    3,       // max 3 cancels
    30000    // per 30 seconds
  );
  if (!allowed) {
    throw new Error("Too many cancellation attempts. Please try again later.");
  }

  return redis.withLock(`booking:${bookingId}`, async () => {
    try {
      const booking = await Booking.findById(new Types.ObjectId(bookingId));
      if (!booking) {
        throw new Error("Booking not found");
      }

      if (booking.userId.toString() !== userId) {
        throw new Error("Unauthorized to cancel this booking");
      }

      if (booking.status === "cancelled") {
        throw new Error("Booking is already cancelled");
      }

      const event = await Event.findById(new Types.ObjectId(booking.eventId));
      if (!event) {
        throw new Error("Associated event not found");
      }

      const hoursUntilEvent =
        (new Date(event.dateTime).getTime() - new Date().getTime()) /
        (1000 * 60 * 60);
      if (hoursUntilEvent < 24) {
        throw new Error("Cannot cancel booking less than 24 hours before event");
      }
      try {
        const natsClient = getNatsClient();
        const capacityResponse = await natsClient.request(
          NATS_SUBJECTS.EVENT_CAPACITY_RELEASE,
          {
            eventId: booking.eventId.toString(),
            quantity: booking.ticketQuantity,
            messageId: Date.now().toString(),
            timestamp: new Date(),
          },
          5000
        );

        if (!capacityResponse.success) {
          logger.warn("Failed to release capacity via NATS", {
            error: capacityResponse.error,
          });
        }
      } catch (error) {
        logger.warn("NATS capacity release failed", { error });
      }
      const updatedBooking = await Booking.findByIdAndUpdate(
        new Types.ObjectId(bookingId),
        {
          status: "cancelled",
          paymentStatus:
            booking.paymentStatus === "paid" ? "refunded" : "failed",
          cancellationReason: reason,
          cancelledAt: new Date(),
        },
        { new: true }
      );

      if (!updatedBooking) {
        throw new Error("Failed to update booking");
      }
      await Event.findByIdAndUpdate(new Types.ObjectId(booking.eventId), {
        $inc: { availableTickets: booking.ticketQuantity },
      });
      await EventCapacityLog.create({
        eventId: new Types.ObjectId(booking.eventId),
        operation: "release",
        quantity: booking.ticketQuantity,
        timestamp: new Date(),
        bookingId: booking._id,
      });

      try {
        const natsClient = getNatsClient();
        natsClient.publish(NATS_SUBJECTS.EVENT_BOOKING_CANCELLED, {
          bookingId: bookingId,
          eventId: booking.eventId.toString(),
          userId: booking.userId.toString(),
          ticketQuantity: booking.ticketQuantity,
          reason: reason,
          timestamp: new Date(),
        });
      } catch (error) {
        logger.error("Failed to publish booking cancelled event", { error });
      }

      logger.info("Booking cancelled successfully", {
        bookingId,
        eventId: booking.eventId,
        userId: booking.userId,
      });

      return {
        ...updatedBooking.toJSON(),
        id: updatedBooking._id.toString(),
      };
    } catch (error) {
      logger.error("Error cancelling booking", { error, bookingId, userId });
      throw error;
    }
  });
}


  async getBookingById(bookingId: string, userId?: string): Promise<IBooking> {
    try {
      let query: any = { _id: new Types.ObjectId(bookingId) };
      
      if (userId) {
        query.userId = new Types.ObjectId(userId);
      }
      
      const booking = await Booking.findOne(query)
        .populate('eventId', 'name description venue dateTime capacity price category')
        .populate('userId', 'name email')
        .lean();
      
      if (!booking) {
        throw new Error('Booking not found or unauthorized');
      }
      
      return {
        ...booking,
        id: booking._id.toString()
      };
      
    } catch (error) {
      logger.error('Error fetching booking', { error, bookingId, userId });
      throw error;
    }
  }

  async getBookingsByUser(
    userId: string, 
    options: { page?: number; limit?: number; status?: string } = {}
  ): Promise<{ bookings: IBooking[]; total: number; page: number; pages: number }> {
    try {
      const page = Math.max(1, options.page || 1);
      const limit = Math.min(50, Math.max(1, options.limit || 10));
      const skip = (page - 1) * limit;
      
      let query: any = { userId: new Types.ObjectId(userId) };
      
      if (options.status) {
        query.status = options.status;
      }
      
      const [bookings, total] = await Promise.all([
        Booking.find(query)
          .populate('eventId', 'name description venue dateTime capacity price category')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Booking.countDocuments(query)
      ]);
      
      const transformedBookings = bookings.map(booking => ({
        ...booking,
        id: booking._id.toString()
      }));
      
      return {
        bookings: transformedBookings,
        total,
        page,
        pages: Math.ceil(total / limit)
      };
      
    } catch (error) {
      logger.error('Error fetching user bookings', { error, userId });
      throw error;
    }
  }

  async getBookingsByEvent(
    eventId: string,
    options: { page?: number; limit?: number; status?: string } = {}
  ): Promise<{ bookings: IBooking[]; total: number; page: number; pages: number }> {
    try {
      const page = Math.max(1, options.page || 1);
      const limit = Math.min(50, Math.max(1, options.limit || 10));
      const skip = (page - 1) * limit;
      
      let query: any = { eventId: new Types.ObjectId(eventId) };
      
      if (options.status) {
        query.status = options.status;
      }
      
      const [bookings, total] = await Promise.all([
        Booking.find(query)
          .populate('userId', 'name email')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Booking.countDocuments(query)
      ]);
      
      const transformedBookings = bookings.map(booking => ({
        ...booking,
        id: booking._id.toString()
      }));
      
      return {
        bookings: transformedBookings,
        total,
        page,
        pages: Math.ceil(total / limit)
      };
      
    } catch (error) {
      logger.error('Error fetching event bookings', { error, eventId });
      throw error;
    }
  }

  async validateBooking(bookingId: string, eventId: string): Promise<{ valid: boolean; booking?: IBooking }> {
    try {
      const booking = await Booking.findOne({
        _id: new Types.ObjectId(bookingId),
        eventId: new Types.ObjectId(eventId),
        status: 'confirmed'
      }).lean();
      
      if (!booking) {
        return { valid: false };
      }
      
      return {
        valid: true,
        booking: {
          ...booking,
          id: booking._id.toString()
        }
      };
      
    } catch (error) {
      logger.error('Error validating booking', { error, bookingId, eventId });
      throw error;
    }
  }

  async confirmPayment(bookingId: string, paymentTransactionId: string): Promise<IBooking> {
    try {
      const updatedBooking = await Booking.findByIdAndUpdate(
        new Types.ObjectId(bookingId),
        {
          status: 'confirmed',
          paymentStatus: 'paid',
          paymentTransactionId
        },
        { new: true }
      ).lean();
      
      if (!updatedBooking) {
        throw new Error('Booking not found');
      }
      
      try {
        const natsClient = getNatsClient();
        natsClient.publish(NATS_SUBJECTS.NOTIFICATION_BOOKING_CONFIRMATION, {
          bookingId: bookingId,
          userId: updatedBooking.userId.toString(),
          eventId: updatedBooking.eventId.toString(),
          timestamp: new Date()
        });
      } catch (error) {
        logger.error('Failed to send booking confirmation notification', { error });
      }
      
      logger.info('Booking payment confirmed', { bookingId, paymentTransactionId });
      
      return {
        ...updatedBooking,
        id: updatedBooking._id.toString()
      };
      
    } catch (error) {
      logger.error('Error confirming payment', { error, bookingId });
      throw error;
    }
  }

  async getBookingStats(): Promise<{
    totalBookings: number;
    confirmedBookings: number;
    cancelledBookings: number;
    pendingBookings: number;
    totalRevenue: number;
  }> {
    try {
      const [stats] = await Booking.aggregate([
        {
          $group: {
            _id: null,
            totalBookings: { $sum: 1 },
            confirmedBookings: {
              $sum: { $cond: [{ $eq: ['$status', 'confirmed'] }, 1, 0] }
            },
            cancelledBookings: {
              $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] }
            },
            pendingBookings: {
              $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
            },
            totalRevenue: {
              $sum: {
                $cond: [
                  { $eq: ['$paymentStatus', 'paid'] },
                  '$totalAmount',
                  0
                ]
              }
            }
          }
        }
      ]);
      
      return stats || {
        totalBookings: 0,
        confirmedBookings: 0,
        cancelledBookings: 0,
        pendingBookings: 0,
        totalRevenue: 0
      };
      
    } catch (error) {
      logger.error('Error fetching booking stats', { error });
      throw error;
    }
  }

  async cleanupExpiredBookings(): Promise<void> {
    try {
      const cutoffTime = new Date();
      cutoffTime.setHours(cutoffTime.getHours() - 1); 
      
      const expiredBookings = await Booking.find({
        status: 'pending',
        createdAt: { $lt: cutoffTime }
      });
      
      for (const booking of expiredBookings) {
        try {
          const redis = new RedisClient();
          await redis.connect();
          await redis.withLock(`booking:${booking._id}`, async () => {
          await this.cancelBooking(
            booking._id.toString(), 
            booking.userId.toString(), 
            'Automatic cancellation - payment timeout'
          );
        });
        } catch (error) {
          logger.error('Error auto-cancelling expired booking', { 
            bookingId: booking._id, 
            error 
          });
        }
      }
      
      logger.info(`Cleaned up ${expiredBookings.length} expired bookings`);
    } catch (error) {
      logger.error('Error during booking cleanup', { error });
      throw error;
    }
  }
}