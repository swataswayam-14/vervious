export interface BaseMessage {
  messageId: string;
  timestamp: Date;
  correlationId?: string;
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


export interface BookingCreateRequest extends BaseMessage {
  eventId: string;
  userId: string;
  ticketQuantity: number;
  totalAmount: number;
  paymentMethod?: string;
}

export interface BookingCreateResponse extends BaseMessage {
  success: boolean;
  booking?: {
    _id: string;
    eventId: string;
    userId: string;
    ticketQuantity: number;
    totalAmount: number;
    status: string;
    bookingDate: Date;
    paymentStatus: string;
    paymentMethod?: string;
  };
  error?: string;
}

export interface BookingCancelRequest extends BaseMessage {
  bookingId: string;
  userId: string;
  reason?: string;
}

export interface BookingGetRequest extends BaseMessage {
  bookingId: string;
  userId?: string;
}

export interface BookingListRequest extends BaseMessage {
  userId?: string;
  eventId?: string;
  status?: 'confirmed' | 'cancelled' | 'pending';
  page?: number;
  limit?: number;
}

export interface BookingListResponse extends ApiResponse {
  bookings: Array<{
    _id: string;
    eventId: string;
    userId: string;
    ticketQuantity: number;
    totalAmount: number;
    status: string;
    bookingDate: Date;
    paymentStatus: string;
    paymentMethod?: string;
    event?: {
      name: string;
      venue: string;
      dateTime: Date;
    };
    user?: {
      name: string;
      email: string;
    };
    createdAt: Date;
    updatedAt: Date;
  }>;
}

export interface BookingValidateRequest extends BaseMessage {
  bookingId: string;
  eventId: string;
}

export interface BookingValidateResponse extends BaseMessage {
  success: boolean;
  valid: boolean;
  booking?: {
    _id: string;
    status: string;
    ticketQuantity: number;
    eventId: string;
    userId: string;
  };
  error?: string;
}


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
  EVENT_WAITLIST_PROCESSED: 'event.waitlist.processed',
  BOOKING_CONFIRM_PAYMENT: 'booking.confirm-payment',
  BOOKING_STATS: 'booking.stats',
} as const;