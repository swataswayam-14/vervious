import mongoose, { Document, Schema } from 'mongoose';
import {type IEventCapacityLog } from '../types/user.types.js';

export interface IEventCapacityLogDocument extends IEventCapacityLog, Document {}

const eventCapacityLogSchema = new Schema<IEventCapacityLogDocument>(
  {
    eventId: { type: Schema.Types.ObjectId, required: true, ref: 'Event' },
    operation: { type: String, enum: ['reserve', 'release'], required: true },
    quantity: { type: Number, required: true },
    timestamp: { type: Date, required: true, default: Date.now },
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking' },
  },
  { timestamps: false }
);

eventCapacityLogSchema.index({ eventId: 1, timestamp: -1 });

export const EventCapacityLog =
  mongoose.models.EventCapacityLog ||
  mongoose.model<IEventCapacityLogDocument>('EventCapacityLog', eventCapacityLogSchema);
