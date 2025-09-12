import mongoose, { Document, Schema } from 'mongoose';
import { type IEvent } from '../types/user.types.js';

export interface IEventDocument extends IEvent, Document {}

const eventSchema = new Schema<IEventDocument>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    venue: { type: String, required: true },
    dateTime: { type: Date, required: true },
    capacity: { type: Number, required: true },
    availableTickets: { type: Number, required: true },
    price: { type: Number, required: true },
    category: { type: String, required: true },
    organizerId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        const r = ret as any;
        delete r.__v;
        return r;
      },
    },
  }
);

eventSchema.index({ isActive: 1, category: 1, dateTime: 1 });
eventSchema.index({ organizerId: 1 });

export const Event =
  mongoose.models.Event || mongoose.model<IEventDocument>('Event', eventSchema);
