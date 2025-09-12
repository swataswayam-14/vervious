import { getNatsClient } from '../nats/client.js';
import {
  NATS_SUBJECTS,
  type EventCreateRequest,
  type EventUpdateRequest,
  type EventListResponse,
  type EventListRequest,
  type ApiResponse,
} from '../types/message.types.js';

import { EventService } from '../services/event.service.js';
import { logger } from '../utils/logger.js';

interface EventDeleteRequest {
  eventId: string;
  messageId: string;
  timestamp: Date;
}

interface EventGetRequest {
  eventId: string;
  messageId: string;
  timestamp: Date;
}

export const setupNatsHandlers = async (eventService: EventService) => {
  const natsClient = getNatsClient();

  natsClient.subscribe<EventCreateRequest>(
    NATS_SUBJECTS.EVENT_CREATE,
    async (requestData, subject, replyTo) => {
      try {
        logger.info(`Processing event create request: ${requestData.name}`, {
          messageId: requestData.messageId,
        });

        if (!requestData.name || !requestData.venue || !requestData.dateTime || !requestData.organizerId) {
          throw new Error('Missing required fields: name, venue, dateTime, or organizerId');
        }

        const result = await eventService.createEvent(requestData);

        logger.info(`Event created successfully: ${result.id}`, {
          messageId: requestData.messageId,
        });

        if (replyTo) {
          const response: ApiResponse = {
            success: true,
            data: result,
            message: "Event created successfully"
          };
          natsClient.publish(replyTo, response);
          console.log('Event create response sent to:', replyTo);
        } else {
          console.log('No reply subject available for event create');
        }

      } catch (error) {
        logger.error('Event create handler error:', {
          error: error instanceof Error ? error.message : 'Unknown error',
          messageId: requestData?.messageId,
        });

        if (replyTo) {
          const response: ApiResponse = {
            success: false,
            error: error instanceof Error ? error.message : 'Event creation failed'
          };
          natsClient.publish(replyTo, response);
          console.log('Event create error response sent to:', replyTo);
        }
      }
    }
  );

  natsClient.subscribe<EventUpdateRequest>(
    NATS_SUBJECTS.EVENT_UPDATE,
    async (requestData, subject, replyTo) => {
      try {
        logger.info(`Processing event update request: ${requestData.eventId}`, {
          messageId: requestData.messageId,
        });

        if (!requestData.eventId || !requestData.updates) {
          throw new Error('Missing required fields: eventId or updates');
        }

        const result = await eventService.updateEvent(requestData.eventId, requestData.updates);

        logger.info(`Event updated successfully: ${requestData.eventId}`, {
          messageId: requestData.messageId,
        });

        if (replyTo) {
          const response: ApiResponse = {
            success: true,
            data: result,
            message: "Event updated successfully"
          };
          natsClient.publish(replyTo, response);
          console.log('Event update response sent to:', replyTo);
        } else {
          console.log('No reply subject available for event update');
        }

      } catch (error) {
        logger.error('Event update handler error:', {
          error: error instanceof Error ? error.message : 'Unknown error',
          messageId: requestData?.messageId,
        });

        if (replyTo) {
          const response: ApiResponse = {
            success: false,
            error: error instanceof Error ? error.message : 'Event update failed'
          };
          natsClient.publish(replyTo, response);
          console.log('Event update error response sent to:', replyTo);
        }
      }
    }
  );

  natsClient.subscribe<EventListRequest>(
    NATS_SUBJECTS.EVENT_LIST,
    async (requestData, subject, replyTo) => {
      try {
        logger.info('Processing event list request', {
          messageId: requestData.messageId,
        });

        const events = await eventService.getAllEvents();

        const transformedEvents = events.map(event => ({
          _id: event.id,
          name: event.name,
          description: event.description,
          venue: event.venue,
          dateTime: event.dateTime,
          capacity: event.capacity,
          availableTickets: event.availableTickets,
          price: event.price,
          category: event.category,
          organizerId: event.organizerId,
          isActive: event.isActive,
          createdAt: event.createdAt,
          updatedAt: event.updatedAt,
        }));

        logger.info(`Fetched ${events.length} events successfully`, {
          messageId: requestData.messageId,
        });

        if (replyTo) {
          const response: EventListResponse = {
            success: true,
            events: transformedEvents,
            message: "Events fetched successfully"
          };
          natsClient.publish(replyTo, response);
          console.log('Event list response sent to:', replyTo);
        } else {
          console.log('No reply subject available for event list');
        }

      } catch (error) {
        logger.error('Event list handler error:', {
          error: error instanceof Error ? error.message : 'Unknown error',
          messageId: requestData?.messageId,
        });

        if (replyTo) {
          const response: EventListResponse = {
            success: false,
            events: [], // Provide empty array for error case
            error: error instanceof Error ? error.message : 'Failed to fetch events'
          };
          natsClient.publish(replyTo, response);
          console.log('Event list error response sent to:', replyTo);
        }
      }
    }
  );

  natsClient.subscribe<EventGetRequest>(
    NATS_SUBJECTS.EVENT_GET || 'event.get',
    async (requestData, subject, replyTo) => {
      try {
        logger.info(`Processing get event request: ${requestData.eventId}`, {
          messageId: requestData.messageId,
        });

        if (!requestData.eventId) {
          throw new Error('Missing required field: eventId');
        }

        const event = await eventService.getEventById(requestData.eventId);

        logger.info(`Event fetched successfully: ${requestData.eventId}`, {
          messageId: requestData.messageId,
        });

        if (replyTo) {
          const response: ApiResponse = {
            success: true,
            data: event,
            message: "Event fetched successfully"
          };
          natsClient.publish(replyTo, response);
          console.log('Get event response sent to:', replyTo);
        }

      } catch (error) {
        logger.error('Get event handler error:', {
          error: error instanceof Error ? error.message : 'Unknown error',
          messageId: requestData?.messageId,
        });

        if (replyTo) {
          const response: ApiResponse = {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch event'
          };
          natsClient.publish(replyTo, response);
          console.log('Get event error response sent to:', replyTo);
        }
      }
    }
  );

  natsClient.subscribe<EventDeleteRequest>(
    NATS_SUBJECTS.EVENT_DELETE || 'event.delete',
    async (requestData, subject, replyTo) => {
      try {
        logger.info(`Processing event delete request: ${requestData.eventId}`, {
          messageId: requestData.messageId,
        });

        if (!requestData.eventId) {
          throw new Error('Missing required field: eventId');
        }

        await eventService.deleteEvent(requestData.eventId);

        logger.info(`Event deleted successfully: ${requestData.eventId}`, {
          messageId: requestData.messageId,
        });

        if (replyTo) {
          const response: ApiResponse = {
            success: true,
            message: "Event deleted successfully"
          };
          natsClient.publish(replyTo, response);
          console.log('Event delete response sent to:', replyTo);
        }

      } catch (error) {
        logger.error('Event delete handler error:', {
          error: error instanceof Error ? error.message : 'Unknown error',
          messageId: requestData?.messageId,
        });

        if (replyTo) {
          const response: ApiResponse = {
            success: false,
            error: error instanceof Error ? error.message : 'Event deletion failed'
          };
          natsClient.publish(replyTo, response);
          console.log('Event delete error response sent to:', replyTo);
        }
      }
    }
  );

  natsClient.subscribe<{ searchTerm: string; messageId: string; timestamp: Date }>(
    'event.search',
    async (requestData, subject, replyTo) => {
      try {
        logger.info(`Processing event search request: ${requestData.searchTerm}`, {
          messageId: requestData.messageId,
        });

        if (!requestData.searchTerm) {
          throw new Error('Missing required field: searchTerm');
        }

        const events = await eventService.searchEvents(requestData.searchTerm);

        logger.info(`Search returned ${events.length} events`, {
          messageId: requestData.messageId,
        });

        if (replyTo) {
          const response: ApiResponse = {
            success: true,
            data: events,
            message: "Search completed successfully"
          };
          natsClient.publish(replyTo, response);
        }

      } catch (error) {
        logger.error('Event search handler error:', {
          error: error instanceof Error ? error.message : 'Unknown error',
          messageId: requestData?.messageId,
        });

        if (replyTo) {
          const response: ApiResponse = {
            success: false,
            error: error instanceof Error ? error.message : 'Search failed'
          };
          natsClient.publish(replyTo, response);
        }
      }
    }
  );

  natsClient.subscribe<{ organizerId: string; messageId: string; timestamp: Date }>(
    'event.organizer',
    async (requestData, subject, replyTo) => {
      try {
        logger.info(`Processing get events by organizer request: ${requestData.organizerId}`, {
          messageId: requestData.messageId,
        });

        if (!requestData.organizerId) {
          throw new Error('Missing required field: organizerId');
        }

        const events = await eventService.getEventsByOrganizer(requestData.organizerId);

        logger.info(`Found ${events.length} events for organizer`, {
          messageId: requestData.messageId,
        });

        if (replyTo) {
          const response: ApiResponse = {
            success: true,
            data: events,
            message: "Organizer events fetched successfully"
          };
          natsClient.publish(replyTo, response);
        }

      } catch (error) {
        logger.error('Get organizer events handler error:', {
          error: error instanceof Error ? error.message : 'Unknown error',
          messageId: requestData?.messageId,
        });

        if (replyTo) {
          const response: ApiResponse = {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch organizer events'
          };
          natsClient.publish(replyTo, response);
        }
      }
    }
  );

  natsClient.subscribe<{ limit?: number; messageId: string; timestamp: Date }>(
    'event.upcoming',
    async (requestData, subject, replyTo) => {
      try {
        logger.info('Processing upcoming events request', {
          messageId: requestData.messageId,
        });

        const events = await eventService.getUpcomingEvents(requestData.limit);

        logger.info(`Found ${events.length} upcoming events`, {
          messageId: requestData.messageId,
        });

        if (replyTo) {
          const response: ApiResponse = {
            success: true,
            data: events,
            message: "Upcoming events fetched successfully"
          };
          natsClient.publish(replyTo, response);
        }

      } catch (error) {
        logger.error('Get upcoming events handler error:', {
          error: error instanceof Error ? error.message : 'Unknown error',
          messageId: requestData?.messageId,
        });

        if (replyTo) {
          const response: ApiResponse = {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch upcoming events'
          };
          natsClient.publish(replyTo, response);
        }
      }
    }
  );

  natsClient.subscribe<{ eventId: string; ticketsSold: number; messageId: string; timestamp: Date }>(
    'event.tickets.update',
    async (requestData, subject, replyTo) => {
      try {
        logger.info(`Processing ticket availability update: ${requestData.eventId}`, {
          messageId: requestData.messageId,
        });

        if (!requestData.eventId || requestData.ticketsSold === undefined) {
          throw new Error('Missing required fields: eventId or ticketsSold');
        }

        await eventService.updateTicketAvailability(requestData.eventId, requestData.ticketsSold);

        logger.info(`Ticket availability updated for event: ${requestData.eventId}`, {
          messageId: requestData.messageId,
        });

        if (replyTo) {
          const response: ApiResponse = {
            success: true,
            message: "Ticket availability updated successfully"
          };
          natsClient.publish(replyTo, response);
        }

      } catch (error) {
        logger.error('Update ticket availability handler error:', {
          error: error instanceof Error ? error.message : 'Unknown error',
          messageId: requestData?.messageId,
        });

        if (replyTo) {
          const response: ApiResponse = {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to update ticket availability'
          };
          natsClient.publish(replyTo, response);
        }
      }
    }
  );

  setInterval(async () => {
    try {
      await eventService.cleanupExpiredEvents();
      logger.info('Expired events cleaned up via service');
    } catch (error) {
      logger.error('Error cleaning up expired events via service:', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }, 60 * 60 * 1000); // Run every hour

  logger.info('Event NATS handlers registered successfully');
};