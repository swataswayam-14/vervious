import { Router, type Request, type Response, type NextFunction } from "express";
import { type ZodSchema, ZodError, z } from "zod";
import { getNatsClient } from "../nats/client.js";
import { authMiddleware, adminMiddleware, type AuthenticatedRequest } from "../middleware/auth.middleware.js";

import {
  NATS_SUBJECTS,
  type EventCreateRequest,
  type EventUpdateRequest,
  type EventListResponse,
  type ApiResponse,
} from "../types/message.types.js";

const router = Router();

const validate =
  (schema: ZodSchema, source: "body" | "query" | "params" = "body") =>
  (req: Request, res: Response, next: NextFunction) => {
    try {
      req[source] = schema.parse(req[source]);
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

const createEventSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  venue: z.string(),
  dateTime: z.string(),
  capacity: z.number().int().positive(),
  price: z.number().nonnegative(),
  category: z.string(),
});

const updateEventSchema = z.object({
  updates: z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    venue: z.string().optional(),
    dateTime: z.string().optional(),
    capacity: z.number().int().positive().optional(),
    availableTickets: z.number().int().nonnegative().optional(),
    price: z.number().nonnegative().optional(),
    category: z.string().optional(),
    isActive: z.boolean().optional(),
  }),
});

const getEventSchema = z.object({
  eventId: z.string().min(1),
});

const deleteEventSchema = z.object({
  eventId: z.string().min(1),
});

const searchEventSchema = z.object({
  searchTerm: z.string().min(1),
});

router.post(
  "/",
  authMiddleware,
  adminMiddleware,
  validate(createEventSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const natsClient = getNatsClient();

      const request: EventCreateRequest = {
        ...req.body,
        organizerId: req.user!._id,
        messageId: Date.now().toString(),
        timestamp: new Date(),
      };

      const response = await natsClient.request<EventCreateRequest, ApiResponse>(
        NATS_SUBJECTS.EVENT_CREATE,
        request,
        10000
      );

      if (!response.success) return res.status(400).json(response);

      res.status(201).json({
        success: true,
        data: response.data,
        message: "Event created successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const natsClient = getNatsClient();

    const response = await natsClient.request<any, EventListResponse>(
      NATS_SUBJECTS.EVENT_LIST,
      { messageId: Date.now().toString(), timestamp: new Date() },
      10000
    );

    if (!response.success) return res.status(400).json(response);

    res.json({
      success: true,
      data: response.events,
      message: "Events fetched successfully",
    });
  } catch (error) {
    next(error);
  }
});

router.get(
  "/:eventId",
  validate(getEventSchema, "params"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const natsClient = getNatsClient();
      const { eventId } = req.params;

      if (!eventId) return res.status(400).json({ success: false, error: "eventId is required" });

      const response = await natsClient.request<{ eventId: string; messageId: string; timestamp: Date }, ApiResponse>(
        NATS_SUBJECTS.EVENT_GET,
        { eventId, messageId: Date.now().toString(), timestamp: new Date() },
        10000
      );

      if (!response.success) return res.status(400).json(response);

      res.json({
        success: true,
        data: response.data,
        message: "Event fetched successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);

router.put(
  "/:eventId",
  authMiddleware,
  adminMiddleware,
  validate(updateEventSchema, "body"),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if(!req.params.eventId) {
        throw new Error("Param must be provided");
      }
      const natsClient = getNatsClient();

      const request: EventUpdateRequest = {
        eventId: req.params.eventId,
        updates: req.body.updates,
        messageId: Date.now().toString(),
        timestamp: new Date(),
      };

      const response = await natsClient.request<EventUpdateRequest, ApiResponse>(
        NATS_SUBJECTS.EVENT_UPDATE,
        request,
        10000
      );

      if (!response.success) return res.status(400).json(response);

      res.json({
        success: true,
        data: response.data,
        message: "Event updated successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);

router.delete(
  "/:eventId",
  authMiddleware,
  adminMiddleware,
  validate(deleteEventSchema, "params"),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const natsClient = getNatsClient();
      const { eventId } = req.params;
      if (!eventId) return res.status(400).json({ success: false, error: "eventId is required" });

      const response = await natsClient.request<{ eventId: string; messageId: string; timestamp: Date }, ApiResponse>(
        NATS_SUBJECTS.EVENT_DELETE,
        { eventId, messageId: Date.now().toString(), timestamp: new Date() },
        10000
      );

      if (!response.success) return res.status(400).json(response);

      res.json({
        success: true,
        message: "Event deleted successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  "/search/:searchTerm",
  validate(searchEventSchema, "params"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const natsClient = getNatsClient();
      const { searchTerm } = req.params;
      if (!searchTerm) return res.status(400).json({ success: false, error: "search term is required" });

      const response = await natsClient.request<{ searchTerm: string; messageId: string; timestamp: Date }, ApiResponse>(
        NATS_SUBJECTS.EVENT_SEARCH,
        { searchTerm, messageId: Date.now().toString(), timestamp: new Date() },
        10000
      );

      if (!response.success) return res.status(400).json(response);

      res.json({
        success: true,
        data: response.data,
        message: "Search completed successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  "/organizer/:organizerId",
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const natsClient = getNatsClient();
      const { organizerId } = req.params;
      if (!organizerId) return res.status(400).json({ success: false, error: "organizer id is required" });

      const response = await natsClient.request<{ organizerId: string; messageId: string; timestamp: Date }, ApiResponse>(
        "event.organizer",
        { organizerId, messageId: Date.now().toString(), timestamp: new Date() },
        10000
      );

      if (!response.success) return res.status(400).json(response);

      res.json({
        success: true,
        data: response.data,
        message: "Organizer events fetched successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);

export { router as eventRoutes };
