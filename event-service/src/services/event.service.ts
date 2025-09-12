//@ts-nocheck

import { Event} from '../models/event.model.js';
import { type IEvent } from '../types/user.types.js';
import { RedisClient } from '../redis/client.js';
import { logger } from '../utils/logger.js';
import { CircuitBreaker } from '../helpers/helpers.js';
import { Types } from 'mongoose';

export interface EventResponse {
  id: string;
  name: string;
  description: string;
  venue: string;
  dateTime: string;
  capacity: number;
  availableTickets: number;
  price: number;
  category: string;
  organizerId: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateEventRequest {
  name: string;
  description: string;
  venue: string;
  dateTime: string;
  capacity: number;
  price: number;
  category: string;
  organizerId: string;
}

export interface UpdateEventRequest {
  name?: string;
  description?: string;
  venue?: string;
  dateTime?: string;
  capacity?: number;
  availableTickets?: number;
  price?: number;
  category?: string;
  isActive?: boolean;
}

export class EventService {
  private circuitBreaker: CircuitBreaker;

  constructor(private redisClient: RedisClient) {
    this.circuitBreaker = new CircuitBreaker(5, 30000, 60000);
  }

  async createEvent(eventData: CreateEventRequest): Promise<EventResponse> {
    return this.circuitBreaker.execute(async () => {
      const lockKey = `event_create:${eventData.organizerId}:${Date.now()}`;
      
      return this.redisClient.withLock(lockKey, async () => {
        const eventDate = new Date(eventData.dateTime);
        if (eventDate <= new Date()) {
          throw new Error('Event date must be in the future');
        }

        if (eventData.capacity <= 0) {
          throw new Error('Event capacity must be greater than 0');
        }

        if (eventData.price < 0) {
          throw new Error('Event price cannot be negative');
        }

        const existingEvent = await Event.findOne({
          name: eventData.name.trim(),
          venue: eventData.venue.trim(),
          dateTime: eventDate,
          organizerId: eventData.organizerId,
          isActive: true
        });

        if (existingEvent) {
          throw new Error('An event with the same name, venue, and date/time already exists');
        }

        const event = new Event({
          name: eventData.name.trim(),
          description: eventData.description.trim(),
          venue: eventData.venue.trim(),
          dateTime: eventDate,
          capacity: eventData.capacity,
          availableTickets: eventData.capacity,
          price: eventData.price,
          category: eventData.category.trim(),
          organizerId: eventData.organizerId,
          isActive: true,
        });

        await event.save();
        logger.info(`New event created: ${event.name}`, { eventId: event._id, organizerId: eventData.organizerId });

        await this.cacheEventData(event._id.toString(), event);

        return this.formatEventResponse(event);
      });
    });
  }

  async updateEvent(eventId: string, updates: UpdateEventRequest): Promise<EventResponse> {
    return this.circuitBreaker.execute(async () => {
      const lockKey = `event_update:${eventId}`;
      
      return this.redisClient.withLock(lockKey, async () => {
        const event = await Event.findById(eventId);
        
        if (!event) {
          throw new Error('Event not found');
        }

        if (updates.dateTime) {
          const eventDate = new Date(updates.dateTime);
          if (eventDate <= new Date()) {
            throw new Error('Event date must be in the future');
          }
          event.dateTime = eventDate;
        }

        if (updates.capacity !== undefined) {
          if (updates.capacity <= 0) {
            throw new Error('Event capacity must be greater than 0');
          }
          
          const ticketsSold = event.capacity - event.availableTickets;
          if (updates.capacity < ticketsSold) {
            throw new Error(`Cannot reduce capacity below ${ticketsSold} (tickets already sold)`);
          }
          
          const difference = updates.capacity - event.capacity;
          event.capacity = updates.capacity;
          event.availableTickets = Math.max(0, event.availableTickets + difference);
        }

        if (updates.availableTickets !== undefined) {
          if (updates.availableTickets < 0 || updates.availableTickets > event.capacity) {
            throw new Error('Available tickets must be between 0 and event capacity');
          }
          event.availableTickets = updates.availableTickets;
        }

        if (updates.price !== undefined) {
          if (updates.price < 0) {
            throw new Error('Event price cannot be negative');
          }
          event.price = updates.price;
        }

        if (updates.name) event.name = updates.name.trim();
        if (updates.description !== undefined) event.description = updates.description.trim();
        if (updates.venue) event.venue = updates.venue.trim();
        if (updates.category) event.category = updates.category.trim();
        if (updates.isActive !== undefined) event.isActive = updates.isActive;

        await event.save();
        logger.info(`Event updated: ${event.name}`, { eventId: event._id });

        await this.cacheEventData(event._id.toString(), event);

        return this.formatEventResponse(event);
      });
    });
  }

  async getEventById(eventId: string): Promise<EventResponse> {
    return this.circuitBreaker.execute(async () => {
      let event = await this.getCachedEventData(eventId);
      
      if (!event) {
        const eventDoc = await Event.findById(eventId);
        if (!eventDoc) {
          throw new Error('Event not found');
        }
        event = eventDoc;
        console.log("Caching event", {
  eventId,
  hasId: !!eventDoc._id,
  type: typeof eventDoc,
});

        await this.cacheEventData(eventId, eventDoc);
      }

      return this.formatEventResponse(event);
    });
  }

  async getAllEvents(filters?: {
    category?: string;
    organizerId?: string;
    isActive?: boolean;
    dateFrom?: Date;
    dateTo?: Date;
  }): Promise<EventResponse[]> {
    return this.circuitBreaker.execute(async () => {
      const query: any = {};

      if (filters) {
        if (filters.category) query.category = filters.category;
        if (filters.organizerId) query.organizerId = filters.organizerId;
        if (filters.isActive !== undefined) query.isActive = filters.isActive;
        
        if (filters.dateFrom || filters.dateTo) {
          query.dateTime = {};
          if (filters.dateFrom) query.dateTime.$gte = filters.dateFrom;
          if (filters.dateTo) query.dateTime.$lte = filters.dateTo;
        }
      }

      const events = await Event.find(query)
        .sort({ dateTime: 1 }) 
        .limit(100); 

      logger.info(`Fetched ${events.length} events`, { filters });

      return events.map(event => this.formatEventResponse(event));
    });
  }

  async deleteEvent(eventId: string): Promise<void> {
    return this.circuitBreaker.execute(async () => {
      const lockKey = `event_delete:${eventId}`;
      
      return this.redisClient.withLock(lockKey, async () => {
        const event = await Event.findById(eventId);
        
        if (!event) {
          throw new Error('Event not found');
        }

        const ticketsSold = event.capacity - event.availableTickets;
        if (ticketsSold > 0) {
          throw new Error('Cannot delete event with sold tickets. Consider deactivating instead.');
        }

        await Event.deleteOne({ _id: eventId });
        
        await this.redisClient.del(`event:${eventId}`);

        logger.info(`Event deleted: ${event.name}`, { eventId });
      });
    });
  }

  async deactivateEvent(eventId: string): Promise<EventResponse> {
    return this.updateEvent(eventId, { isActive: false });
  }

  async getEventsByOrganizer(organizerId: string): Promise<EventResponse[]> {
    return this.getAllEvents({ organizerId });
  }

  async getUpcomingEvents(limit: number = 10): Promise<EventResponse[]> {
    return this.circuitBreaker.execute(async () => {
      const events = await Event.find({
        dateTime: { $gt: new Date() },
        isActive: true
      })
        .sort({ dateTime: 1 })
        .limit(limit);

      return events.map(event => this.formatEventResponse(event));
    });
  }

  async searchEvents(searchTerm: string): Promise<EventResponse[]> {
    return this.circuitBreaker.execute(async () => {
      const events = await Event.find({
        $and: [
          { isActive: true },
          {
            $or: [
              { name: { $regex: searchTerm, $options: 'i' } },
              { description: { $regex: searchTerm, $options: 'i' } },
              { venue: { $regex: searchTerm, $options: 'i' } },
              { category: { $regex: searchTerm, $options: 'i' } }
            ]
          }
        ]
      })
        .sort({ dateTime: 1 })
        .limit(50);

      logger.info(`Search found ${events.length} events for term: ${searchTerm}`);

      return events.map(event => this.formatEventResponse(event));
    });
  }

  async updateTicketAvailability(eventId: string, ticketsSold: number): Promise<void> {
    return this.circuitBreaker.execute(async () => {
      const event = await Event.findById(eventId);
      
      if (!event) {
        throw new Error('Event not found');
      }

      if (event.availableTickets < ticketsSold) {
        throw new Error('Not enough tickets available');
      }

      event.availableTickets -= ticketsSold;
      await event.save();

      await this.cacheEventData(eventId, event);

      logger.info(`Updated ticket availability for event ${eventId}`, {
        ticketsSold,
        availableTickets: event.availableTickets
      });
    });
  }

  private async cacheEventData(eventId: string, event: IEvent): Promise<void> {
    try {
      await this.redisClient.set(`event:${eventId}`, this.formatEventResponse(event), 1800); // Cache for 30 minutes
    } catch (error) {
      logger.error('Cache event data error:', error);
    }
  }

private async getCachedEventData(eventId: string): Promise<IEvent | null> {
  try {
    const cached = await this.redisClient.get(`event:${eventId}`);
    console.log("cached", cached);
    logger.info("Cached event data: ", cached);
    if (!cached) return null;

    const event: IEvent = JSON.parse(cached);

    if (event.dateTime) {
      event.dateTime = new Date(event.dateTime);
    }
    if (event.createdAt) {
      event.createdAt = new Date(event.createdAt);
    }
    if (event.updatedAt) {
      event.updatedAt = new Date(event.updatedAt);
    }

    return event;
  } catch (error) {
    logger.error('Get cached event data error:', error);
    return null;
  }
}


  private formatEventResponse(event: IEvent): EventResponse {
    return {
      id: event._id ? event._id.toString() : undefined,
      name: event.name,
      description: event.description,
      venue: event.venue,
      dateTime: event.dateTime.toISOString(),
      capacity: event.capacity,
      availableTickets: event.availableTickets,
      price: event.price,
      category: event.category,
      organizerId: event.organizerId,
      isActive: event.isActive,
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
    };
  }

  async cleanupExpiredEvents(): Promise<void> {
    try {
      const expiredEvents = await Event.find({
        dateTime: { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000) }, 
        $expr: { $eq: ['$availableTickets', '$capacity'] } 
      });

      if (expiredEvents.length > 0) {
        const eventIds = expiredEvents.map(event => event._id);
        
        await Event.deleteMany({ _id: { $in: eventIds } });

        for (const event of expiredEvents) {
          await this.redisClient.del(`event:${event._id}`);
        }

        logger.info(`Cleaned up ${expiredEvents.length} expired events with no ticket sales`);
      }

      const result = await Event.updateMany(
        {
          dateTime: { $lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }, 
          isActive: true
        },
        { isActive: false }
      );

      if (result.modifiedCount > 0) {
        logger.info(`Deactivated ${result.modifiedCount} old events`);
      }
    } catch (error) {
      logger.error('Event cleanup error:', error);
    }
  }
}