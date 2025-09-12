import { Router, type Request, type Response, type NextFunction } from "express";
import { type ZodSchema, ZodError, z } from "zod";
import { getNatsClient } from "../nats/client.js";
import { authMiddleware, adminMiddleware, type AuthenticatedRequest } from "../middleware/auth.middleware.js";

import {
  NATS_SUBJECTS,
  type BookingCreateRequest,
  type BookingCancelRequest,
  type BookingListResponse,
  type BookingValidateRequest,
  type ApiResponse,
} from "../types/message.types.js";

const router = Router();

const validate =
  (schema: ZodSchema, source: "body" | "query" | "params" = "body") =>
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse(req[source]);
      if (source === "query") {
        Object.assign(req.query, parsed);
      } else if (source === "params") {
        Object.assign(req.params, parsed);
      } else {
        req.body = parsed;
      }

      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const response: ApiResponse = {
          success: false,
          error: "Validation failed",
          data: err.issues,
        };
        return res.status(400).json(response);
      }
      next(err);
    }
  };

const createBookingSchema = z.object({
  eventId: z.string().min(1),
  ticketQuantity: z.number().int().positive(),
  totalAmount: z.number().positive(),
  paymentMethod: z.string().optional(),
});

const cancelBookingSchema = z.object({
  reason: z.string().optional(),
});

const getBookingSchema = z.object({
  bookingId: z.string().min(1),
});

const validateBookingSchema = z.object({
  eventId: z.string().min(1),
});

const listBookingsQuerySchema = z.object({
  eventId: z.string().optional(),
  status: z.enum(['confirmed', 'cancelled', 'pending']).optional(),
  page: z.string().transform(Number).optional(),
  limit: z.string().transform(Number).optional(),
});

router.post(
  "/",
  authMiddleware,
  validate(createBookingSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const natsClient = getNatsClient();

      const request: BookingCreateRequest = {
        ...req.body,
        userId: req.user!._id,
        messageId: Date.now().toString(),
        timestamp: new Date(),
      };

      const response = await natsClient.request<BookingCreateRequest, ApiResponse>(
        NATS_SUBJECTS.BOOKING_CREATE,
        request,
        15000 
      );

      if (!response.success) {
        return res.status(400).json(response);
      }

      res.status(201).json({
        success: true,
        data: response.data,
        message: "Booking created successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);
router.get(
  "/my-bookings",
  authMiddleware,
  validate(listBookingsQuerySchema, "query"),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const natsClient = getNatsClient();
      const rawQuery = req.query as Record<string, any>;

      const query = {
        eventId: rawQuery.eventId,
        status: rawQuery.status,
        page: rawQuery.page ? Number(rawQuery.page) : undefined,
        limit: rawQuery.limit ? Number(rawQuery.limit) : undefined,
      };

      const response = await natsClient.request<any, BookingListResponse>(
        NATS_SUBJECTS.BOOKING_LIST,
        {
          userId: req.user!._id,
          ...query,
          messageId: Date.now().toString(),
          timestamp: new Date(),
        },
        10000
      );

      if (!response.success) {
        return res.status(400).json(response);
      }

      res.json({
        success: true,
        data: response.bookings,
        pagination: response.pagination,
        message: "User bookings fetched successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);


router.get(
  "/",
  authMiddleware,
  adminMiddleware,
  validate(listBookingsQuerySchema, "query"),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const natsClient = getNatsClient();
      const query = req.query as any;

      const response = await natsClient.request<any, BookingListResponse>(
        NATS_SUBJECTS.BOOKING_LIST,
        {
          ...query,
          messageId: Date.now().toString(),
          timestamp: new Date(),
        },
        10000
      );

      if (!response.success) {
        return res.status(400).json(response);
      }

      res.json({
        success: true,
        data: response.bookings,
        pagination: response.pagination,
        message: "All bookings fetched successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  "/:bookingId",
  authMiddleware,
  validate(getBookingSchema, "params"),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const natsClient = getNatsClient();
      const { bookingId } = req.params;

      if (!bookingId) {
        return res.status(400).json({ 
          success: false, 
          error: "bookingId is required" 
        });
      }

      const response = await natsClient.request<any, ApiResponse>(
        NATS_SUBJECTS.BOOKING_GET,
        { 
          bookingId, 
          userId: req.user!._id,
          messageId: Date.now().toString(), 
          timestamp: new Date() 
        },
        10000
      );

      if (!response.success) {
        return res.status(404).json(response);
      }

      res.json({
        success: true,
        data: response.data,
        message: "Booking fetched successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);

router.put(
  "/:bookingId/cancel",
  authMiddleware,
  validate(getBookingSchema, "params"),
  validate(cancelBookingSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const natsClient = getNatsClient();
      const { bookingId } = req.params;

      if (!bookingId) {
        return res.status(400).json({ 
          success: false, 
          error: "bookingId is required" 
        });
      }

      const request: BookingCancelRequest = {
        bookingId,
        userId: req.user!._id,
        reason: req.body.reason,
        messageId: Date.now().toString(),
        timestamp: new Date(),
      };

      const response = await natsClient.request<BookingCancelRequest, ApiResponse>(
        NATS_SUBJECTS.BOOKING_CANCEL,
        request,
        15000
      );

      if (!response.success) {
        return res.status(400).json(response);
      }

      res.json({
        success: true,
        data: response.data,
        message: "Booking cancelled successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  "/:bookingId/validate",
  authMiddleware,
  adminMiddleware,
  validate(getBookingSchema, "params"),
  validate(validateBookingSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const natsClient = getNatsClient();
      const { bookingId } = req.params;

      if (!bookingId) {
        return res.status(400).json({ 
          success: false, 
          error: "bookingId is required" 
        });
      }

      const request: BookingValidateRequest = {
        bookingId,
        eventId: req.body.eventId,
        messageId: Date.now().toString(),
        timestamp: new Date(),
      };

      const response = await natsClient.request<BookingValidateRequest, ApiResponse>(
        NATS_SUBJECTS.BOOKING_VALIDATE,
        request,
        10000
      );

      if (!response.success) {
        return res.status(400).json(response);
      }

      res.json({
        success: true,
        data: response.data,
        message: "Booking validation completed",
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  "/event/:eventId",
  authMiddleware,
  adminMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const natsClient = getNatsClient();
      const { eventId } = req.params;
      const query = req.query as any;

      if (!eventId) {
        return res.status(400).json({ 
          success: false, 
          error: "eventId is required" 
        });
      }

      const response = await natsClient.request<any, BookingListResponse>(
        NATS_SUBJECTS.BOOKING_LIST,
        {
          eventId,
          ...query,
          messageId: Date.now().toString(),
          timestamp: new Date(),
        },
        10000
      );

      if (!response.success) {
        return res.status(400).json(response);
      }

      res.json({
        success: true,
        data: response.bookings,
        pagination: response.pagination,
        message: "Event bookings fetched successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  "/:bookingId/confirm-payment",
  authMiddleware,
  adminMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const natsClient = getNatsClient();
      const { bookingId } = req.params;
      const { paymentTransactionId } = req.body;

      if (!bookingId || !paymentTransactionId) {
        return res.status(400).json({ 
          success: false, 
          error: "bookingId and paymentTransactionId are required" 
        });
      }

      const response = await natsClient.request<any, ApiResponse>(
        "booking.confirm-payment", 
        {
          bookingId,
          paymentTransactionId,
          messageId: Date.now().toString(),
          timestamp: new Date(),
        },
        10000
      );

      if (!response.success) {
        return res.status(400).json(response);
      }

      res.json({
        success: true,
        data: response.data,
        message: "Payment confirmed successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  "/admin/stats",
  authMiddleware,
  adminMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const natsClient = getNatsClient();

      const response = await natsClient.request<any, ApiResponse>(
        "booking.stats", 
        {
          messageId: Date.now().toString(),
          timestamp: new Date(),
        },
        10000
      );

      if (!response.success) {
        return res.status(400).json(response);
      }

      res.json({
        success: true,
        data: response.data,
        message: "Booking statistics fetched successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);

export { router as bookingRoutes };