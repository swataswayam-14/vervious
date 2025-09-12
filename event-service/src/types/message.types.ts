import type { IUser } from "./user.types.js";

export const NATS_SUBJECTS = {
  AUTH_REGISTER: 'auth.register',
  AUTH_LOGIN: 'auth.login',
  AUTH_LOGOUT: 'auth.logout',
  AUTH_VALIDATE: 'auth.validate',
  AUTH_REFRESH: 'auth.refresh-token',

  EVENT_CREATE: 'event.create',
  EVENT_UPDATE: 'event.update',
  EVENT_DELETE: 'event.delete',
  EVENT_GET: 'event.get',
  EVENT_LIST: 'event.list',
  EVENT_SEARCH: 'event.search',
  EVENT_CAPACITY_RESERVE: 'event.capacity.reserve',
  EVENT_CAPACITY_RELEASE: 'event.capacity.release',

  BOOKING_CREATE: 'booking.create',
  BOOKING_CANCEL: 'booking.cancel',
  BOOKING_GET: 'booking.get',
  BOOKING_LIST: 'booking.list',
  BOOKING_VALIDATE: 'booking.validate',

  WAITLIST_JOIN: 'waitlist.join',
  WAITLIST_PROCESS: 'waitlist.process',
  WAITLIST_NOTIFY: 'waitlist.notify',

  ANALYTICS_DASHBOARD: 'analytics.dashboard',
  ANALYTICS_EVENT_STATS: 'analytics.event-stats',
  ANALYTICS_BOOKING_TRENDS: 'analytics.booking-trends',
  ANALYTICS_REVENUE: 'analytics.revenue',

  NOTIFICATION_SEND_EMAIL: 'notification.send-email',
  NOTIFICATION_SEND_PUSH: 'notification.send-push',
  NOTIFICATION_BOOKING_CONFIRMATION: 'notification.booking-confirmation',
  NOTIFICATION_BOOKING_CANCELLATION: 'notification.booking-cancellation',
  NOTIFICATION_WAITLIST_UPDATE: 'notification.waitlist-update',

  EVENT_USER_REGISTERED: 'event.user.registered',
  EVENT_BOOKING_CREATED: 'event.booking.created',
  EVENT_BOOKING_CANCELLED: 'event.booking.cancelled',
  EVENT_EVENT_CREATED: 'event.event.created',
  EVENT_EVENT_UPDATED: 'event.event.updated',
  EVENT_CAPACITY_CHANGED: 'event.capacity.changed',
  EVENT_WAITLIST_PROCESSED: 'event.waitlist.processed'
} as const;


export interface AuthLoginRequest extends BaseMessage {
  email: string;
  password: string;
  [key: string]: any;
}

export interface AuthLoginResponse extends BaseMessage {
  success: boolean;
  user?: Omit<IUser, 'password'>;
  tokens?: {
    accessToken: string;
    refreshToken: string;
  };
  error?: string;
}

export interface AuthRegisterRequest extends BaseMessage {
  email: string;
  password: string;
  name: string;
  role: string;
  [key: string]: any;
}

export interface AuthValidateRequest extends BaseMessage {
  token: string;
}

export interface AuthUserDTO {
  _id: string;
  email: string;
  name: string;
  role: string;
}

export interface BaseMessage {
  messageId: string;
  timestamp: Date;
  correlationId?: string;
}


export interface AuthValidateResponse extends BaseMessage {
  success: boolean;
  user?: AuthUserDTO;
  error?: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}


export interface EventCreateRequest {
  name: string;
  description: string;
  venue: string;
  dateTime: string;
  capacity: number;
  availableTickets?: number;
  price: number;
  category: string;
  organizerId: string;
  messageId: string;
  timestamp: Date;
}

export interface EventListResponse extends ApiResponse {
  events: Array<{
    _id: string;
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
  }>;
}

export interface EventGetRequest {
  eventId: string;
  messageId: string;
}

export interface EventUpdateRequest {
  eventId: string; 
  updates: Partial<{
    name: string;
    description: string;
    venue: string;
    dateTime: string; 
    capacity: number;
    availableTickets: number;
    price: number;
    category: string;
    isActive: boolean;
  }>;
  messageId: string;
  timestamp: Date;
}


export interface EventListRequest extends BaseMessage {
  category?: string;
  organizerId?: string;
  dateFrom?: string; 
  dateTo?: string;   
  isActive?: boolean;
  page?: number;
  limit?: number;
}
