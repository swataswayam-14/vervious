import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IBooking {
  eventId: Types.ObjectId; 
  userId: Types.ObjectId;  
  ticketQuantity: number;
  totalAmount: number;
  status: 'confirmed' | 'cancelled' | 'pending';
  bookingDate: Date;
  paymentStatus: 'paid' | 'pending' | 'failed' | 'refunded';
  paymentMethod?: 'credit_card' | 'debit_card' | 'paypal' | 'stripe' | 'cash';
  paymentTransactionId?: string;
  cancellationReason?: string;
  cancelledAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IBookingDocument extends IBooking, Document<Types.ObjectId> {}

const bookingSchema = new Schema<IBookingDocument>(
  {
    eventId: { 
      type: Schema.Types.ObjectId, 
      required: true, 
      ref: 'Event',
      index: true
    },
    userId: { 
      type: Schema.Types.ObjectId, 
      required: true, 
      ref: 'User',
      index: true
    },
    ticketQuantity: { 
      type: Number, 
      required: true, 
      min: 1 
    },
    totalAmount: { 
      type: Number, 
      required: true, 
      min: 0 
    },
    status: { 
      type: String, 
      enum: ['confirmed', 'cancelled', 'pending'], 
      default: 'pending',
      required: true,
      index: true
    },
    bookingDate: { 
      type: Date, 
      required: true, 
      default: Date.now 
    },
    paymentStatus: { 
      type: String, 
      enum: ['paid', 'pending', 'failed', 'refunded'], 
      default: 'pending',
      required: true,
      index: true
    },
    paymentMethod: { 
      type: String,
      enum: ['credit_card', 'debit_card', 'paypal', 'stripe', 'cash']
    },
    paymentTransactionId: { 
      type: String,
      sparse: true
    },
    cancellationReason: { 
      type: String 
    },
    cancelledAt: { 
      type: Date 
    }
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

bookingSchema.index({ eventId: 1, status: 1 });
bookingSchema.index({ userId: 1, status: 1 });
bookingSchema.index({ bookingDate: -1 });
bookingSchema.index({ status: 1, paymentStatus: 1 });

bookingSchema.index(
  { userId: 1, eventId: 1 },
  { unique: true, partialFilterExpression: { status: { $ne: 'cancelled' } } }
);

export const Booking =
  mongoose.models.Booking || mongoose.model<IBookingDocument>('Booking', bookingSchema);
