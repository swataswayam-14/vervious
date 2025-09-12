import { ObjectId } from "mongodb";

export interface IUser {
    _id: ObjectId;
    email: string;
    password: string;
    name: string;
    role: 'user' | 'admin';
    isActive: boolean;
    lastLogin?: Date;
    createdAt: Date;
    updatedAt: Date;
}

export interface IRefreshToken {
    _id: ObjectId;
    userId: ObjectId;
    token: string;
    expiresAt: Date;
    createdAt: Date;
}

export interface IEvent {
    _id: ObjectId;
    name: string;
    description: string;
    venue: string;
    dateTime: Date;
    capacity: number;
    availableTickets: number;
    price: number;
    category: string;
    organizerId: ObjectId;
    isActive: boolean;
    __v: number;
    createdAt: Date;
    updatedAt: Date;
}

export interface IEventCapacityLog {
    _id: ObjectId;
    eventId: ObjectId;
    operation: 'reserve' | 'release';
    quantity: number;
    timestamp: Date;
    bookingId?: ObjectId;
}