//@ts-nocheck

import { getNatsClient } from '../nats/client.js';
import {
  NATS_SUBJECTS,
  type BookingCreateRequest,
  type BookingCancelRequest,
  type BookingGetRequest,
  type BookingListRequest,
  type BookingListResponse,
  type BookingValidateRequest,
  type BookingValidateResponse,
  type ApiResponse,
} from '../types/message.types.js';

import { BookingService } from '../services/booking.service.js';
import { logger } from '../utils/logger.js';
import mongoose from 'mongoose';
import { Event } from '../models/event.model.js';
import type { IBookingDocument } from '../models/booking.model.js';

export const setupBookingNatsHandlers = async (bookingService: BookingService) => {
  const natsClient = getNatsClient();

  natsClient.subscribe<BookingCreateRequest>(
    NATS_SUBJECTS.BOOKING_CREATE,
    async (requestData, subject, replyTo) => {
      try {
        logger.info(`Processing booking create request for event: ${requestData.eventId}`, {
          messageId: requestData.messageId,
        });

        if (!requestData.eventId || !requestData.userId || !requestData.ticketQuantity || !requestData.totalAmount) {
          throw new Error('Missing required fields: eventId, userId, ticketQuantity, or totalAmount');
        }

        const result = await bookingService.createBooking({
          eventId: requestData.eventId as string ,
          userId: requestData.userId as string ,
          ticketQuantity: requestData.ticketQuantity as number ,
          totalAmount: requestData.totalAmount as number,
          paymentMethod: requestData.paymentMethod as string ,
        });

        logger.info(`Booking created successfully: ${result.id}`, {
          messageId: requestData.messageId,
        });

        if (replyTo) {
          const response: ApiResponse = {
            success: true,
            data: result,
            message: "Booking created successfully"
          };
          natsClient.publish(replyTo, response);
          console.log('Booking create response sent to:', replyTo);
        } else {
          console.log('No reply subject available for booking create');
        }

      } catch (error) {
        logger.error('Booking create handler error:', {
          error: error instanceof Error ? error.message : 'Unknown error',
          messageId: requestData?.messageId,
        });

        if (replyTo) {
          const response: ApiResponse = {
            success: false,
            error: error instanceof Error ? error.message : 'Booking creation failed'
          };
          natsClient.publish(replyTo, response);
          console.log('Booking create error response sent to:', replyTo);
        }
      }
    }
  );
  natsClient.subscribe<BookingCancelRequest>(
    NATS_SUBJECTS.BOOKING_CANCEL,
    async (requestData, subject, replyTo) => {
      try {
        logger.info(`Processing booking cancellation request: ${requestData.bookingId}`, {
          messageId: requestData.messageId,
        });

        if (!requestData.bookingId || !requestData.userId) {
          throw new Error('Missing required fields: bookingId or userId');
        }

        const result = await bookingService.cancelBooking(
          requestData.bookingId,
          requestData.userId,
          requestData.reason
        );

        logger.info(`Booking cancelled successfully: ${requestData.bookingId}`, {
          messageId: requestData.messageId,
        });

        if (replyTo) {
          const response: ApiResponse = {
            success: true,
            data: result,
            message: "Booking cancelled successfully"
          };
          natsClient.publish(replyTo, response);
          console.log('Booking cancel response sent to:', replyTo);
        } else {
          console.log('No reply subject available for booking cancel');
        }

      } catch (error) {
        logger.error('Booking cancel handler error:', {
          error: error instanceof Error ? error.message : 'Unknown error',
          messageId: requestData?.messageId,
        });

        if (replyTo) {
          const response: ApiResponse = {
            success: false,
            error: error instanceof Error ? error.message : 'Booking cancellation failed'
          };
          natsClient.publish(replyTo, response);
          console.log('Booking cancel error response sent to:', replyTo);
        }
      }
    }
  );
  natsClient.subscribe<BookingGetRequest>(
    NATS_SUBJECTS.BOOKING_GET,
    async (requestData, subject, replyTo) => {
      try {
        logger.info(`Processing get booking request: ${requestData.bookingId}`, {
          messageId: requestData.messageId,
        });

        if (!requestData.bookingId) {
          throw new Error('Missing required field: bookingId');
        }
        const booking = await bookingService.getBookingById(
          requestData.bookingId,
          requestData.userId
        );

        logger.info(`Booking fetched successfully: ${requestData.bookingId}`, {
          messageId: requestData.messageId,
        });

        if (replyTo) {
          const response: ApiResponse = {
            success: true,
            data: booking,
            message: "Booking fetched successfully"
          };
          natsClient.publish(replyTo, response);
          console.log('Get booking response sent to:', replyTo);
        }

      } catch (error) {
        logger.error('Get booking handler error:', {
          error: error instanceof Error ? error.message : 'Unknown error',
          messageId: requestData?.messageId,
        });

        if (replyTo) {
          const response: ApiResponse = {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch booking'
          };
          natsClient.publish(replyTo, response);
          console.log('Get booking error response sent to:', replyTo);
        }
      }
    }
  );
natsClient.subscribe<BookingListRequest>(
  NATS_SUBJECTS.BOOKING_LIST,
  async (requestData, subject, replyTo) => {
    try {
      logger.info('Processing booking list request', {
        messageId: requestData.messageId,
        userId: requestData.userId,
        eventId: requestData.eventId,
      });

      let result;

      if (requestData.userId) {
        result = await bookingService.getBookingsByUser(requestData.userId, {
          page: requestData.page,
          limit: requestData.limit,
          status: requestData.status,
        });
      } else if (requestData.eventId) {
        result = await bookingService.getBookingsByEvent(requestData.eventId, {
          page: requestData.page,
          limit: requestData.limit,
          status: requestData.status,
        });
      } else {
        throw new Error('Either userId or eventId must be provided');
      }
const transformedBookings = (result.bookings as IBookingDocument[]).map(booking => ({
  _id: booking._id.toString(),
  eventId: booking.eventId,
  userId: booking.userId,
  ticketQuantity: booking.ticketQuantity,
  totalAmount: booking.totalAmount,
  status: booking.status,
  bookingDate: booking.bookingDate,
  paymentStatus: booking.paymentStatus,
  paymentMethod: booking.paymentMethod,
  createdAt: booking.createdAt,
  updatedAt: booking.updatedAt,
}));
      if (replyTo) {
        const response: BookingListResponse = {
          success: true,
          bookings: transformedBookings,
          pagination: {
            page: result.page,
            limit: requestData.limit || 10,
            total: result.total,
            pages: result.pages,
          },
          message: "Bookings fetched successfully"
        };
        natsClient.publish(replyTo, response);
      }

    } catch (error) {
      logger.error('Booking list handler error:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        messageId: requestData?.messageId,
      });

      if (replyTo) {
        const response: BookingListResponse = {
          success: false,
          bookings: [],
          error: error instanceof Error ? error.message : 'Failed to fetch bookings'
        };
        natsClient.publish(replyTo, response);
      }
    }
  }
);

  natsClient.subscribe<BookingValidateRequest>(
    NATS_SUBJECTS.BOOKING_VALIDATE,
    async (requestData, subject, replyTo) => {
      try {
        logger.info(`Processing booking validation request: ${requestData.bookingId}`, {
          messageId: requestData.messageId,
        });

        if (!requestData.bookingId || !requestData.eventId) {
          throw new Error('Missing required fields: bookingId or eventId');
        }

        const result = await bookingService.validateBooking(
          requestData.bookingId,
          requestData.eventId
        );

        logger.info(`Booking validation completed: ${requestData.bookingId}`, {
          messageId: requestData.messageId,
          valid: result.valid,
        });

        if (replyTo) {
          const response: BookingValidateResponse = {
            success: true,
            valid: result.valid,
            booking: result.booking,
            messageId: requestData.messageId,
            timestamp: new Date()
          };
          natsClient.publish(replyTo, response);
          console.log('Booking validation response sent to:', replyTo);
        }

      } catch (error) {
        logger.error('Booking validation handler error:', {
          error: error instanceof Error ? error.message : 'Unknown error',
          messageId: requestData?.messageId,
        });

        if (replyTo) {
          const response: BookingValidateResponse = {
            success: false,
            valid: false,
            error: error instanceof Error ? error.message : 'Booking validation failed',
            messageId: requestData.messageId,
            timestamp: new Date()
          };
          natsClient.publish(replyTo, response);
          console.log('Booking validation error response sent to:', replyTo);
        }
      }
    }
  );

  natsClient.subscribe<{ bookingId: string; paymentTransactionId: string; messageId: string; timestamp: Date }>(
    'booking.confirm-payment',
    async (requestData, subject, replyTo) => {
      try {
        logger.info(`Processing payment confirmation: ${requestData.bookingId}`, {
          messageId: requestData.messageId,
        });

        if (!requestData.bookingId || !requestData.paymentTransactionId) {
          throw new Error('Missing required fields: bookingId or paymentTransactionId');
        }

        const result = await bookingService.confirmPayment(
          requestData.bookingId,
          requestData.paymentTransactionId
        );

        logger.info(`Payment confirmed successfully: ${requestData.bookingId}`, {
          messageId: requestData.messageId,
        });

        if (replyTo) {
          const response: ApiResponse = {
            success: true,
            data: result,
            message: "Payment confirmed successfully"
          };
          natsClient.publish(replyTo, response);
        }

      } catch (error) {
        logger.error('Payment confirmation handler error:', {
          error: error instanceof Error ? error.message : 'Unknown error',
          messageId: requestData?.messageId,
        });

        if (replyTo) {
          const response: ApiResponse = {
            success: false,
            error: error instanceof Error ? error.message : 'Payment confirmation failed'
          };
          natsClient.publish(replyTo, response);
        }
      }
    }
  );

  natsClient.subscribe<{ messageId: string; timestamp: Date }>(
    'booking.stats',
    async (requestData, subject, replyTo) => {
      try {
        logger.info('Processing booking statistics request', {
          messageId: requestData.messageId,
        });

        const stats = await bookingService.getBookingStats();

        logger.info('Booking statistics fetched successfully', {
          messageId: requestData.messageId,
        });

        if (replyTo) {
          const response: ApiResponse = {
            success: true,
            data: stats,
            message: "Booking statistics fetched successfully"
          };
          natsClient.publish(replyTo, response);
        }

      } catch (error) {
        logger.error('Booking statistics handler error:', {
          error: error instanceof Error ? error.message : 'Unknown error',
          messageId: requestData?.messageId,
        });

        if (replyTo) {
          const response: ApiResponse = {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch booking statistics'
          };
          natsClient.publish(replyTo, response);
        }
      }
    }
  );

natsClient.subscribe<{ eventId: string; quantity: number; messageId: string; timestamp: Date }>(
  NATS_SUBJECTS.EVENT_CAPACITY_RESERVE,
  async (requestData, subject, replyTo) => {
    try {
      logger.info(`Processing capacity reserve request: ${requestData.eventId}`, {
        messageId: requestData.messageId,
        quantity: requestData.quantity,
      });

      const event = await Event.findOneAndUpdate(
        {
          _id: requestData.eventId,
          availableTickets: { $gte: requestData.quantity }, 
        },
        {
          $inc: { availableTickets: -requestData.quantity }, 
        },
        { new: true }
      );

      if (!event) {
        throw new Error("Insufficient available tickets or event not found");
      }

      if (replyTo) {
        const response: ApiResponse = {
          success: true,
          message: `Reserved ${requestData.quantity} tickets successfully`,
          data: { remaining: event.availableTickets }
        };
        natsClient.publish(replyTo, response);
      }

    } catch (error) {
      logger.error("Capacity reserve handler error:", {
        error: error instanceof Error ? error.message : "Unknown error",
        messageId: requestData?.messageId,
      });

      if (replyTo) {
        const response: ApiResponse = {
          success: false,
          error: error instanceof Error ? error.message : "Failed to reserve capacity"
        };
        natsClient.publish(replyTo, response);
      }
    }
  }
);


natsClient.subscribe<{ eventId: string; quantity: number; messageId: string; timestamp: Date }>(
  NATS_SUBJECTS.EVENT_CAPACITY_RELEASE,
  async (requestData, subject, replyTo) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      logger.info(`Processing capacity release request: ${requestData.eventId}`, {
        messageId: requestData.messageId,
        quantity: requestData.quantity,
      });

      const event = await Event.findById(requestData.eventId).session(session);
      if (!event) {
        throw new Error("Event not found");
      }

      event.capacity += requestData.quantity;
      await event.save({ session });

      await session.commitTransaction();
      session.endSession();

      if (replyTo) {
        const response: ApiResponse = {
          success: true,
          message: `Released ${requestData.quantity} seats successfully`
        };
        natsClient.publish(replyTo, response);
      }

    } catch (error) {
      await session.abortTransaction();
      session.endSession();

      logger.error("Capacity release handler error:", {
        error: error instanceof Error ? error.message : "Unknown error",
        messageId: requestData?.messageId,
      });

      if (replyTo) {
        const response: ApiResponse = {
          success: false,
          error: error instanceof Error ? error.message : "Failed to release capacity"
        };
        natsClient.publish(replyTo, response);
      }
    }
  }
);

  setInterval(async () => {
    try {
      await bookingService.cleanupExpiredBookings();
      logger.info('Expired bookings cleaned up via service');
    } catch (error) {
      logger.error('Error cleaning up expired bookings via service:', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }, 30 * 60 * 1000); // Run every 30 minutes

  logger.info('Booking NATS handlers registered successfully');
};