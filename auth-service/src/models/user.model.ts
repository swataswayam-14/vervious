import mongoose, { Document, Schema } from 'mongoose';

export interface IUser extends Document {
  _id: string;
  email: string;
  password?: string | undefined;
  name: string;
  role: 'user' | 'admin'; 
  isActive: boolean;
  lastLoginAt?: Date | undefined;
  failedLoginAttempts: number;
  lockedUntil?: Date | undefined;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 8,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user', 
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLoginAt: {
      type: Date,
    },
    failedLoginAttempts: {
      type: Number,
      default: 0,
    },
    lockedUntil: {
      type: Date,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        delete ret.password;
        //@ts-ignore
        delete ret.failedLoginAttempts;
        delete ret.lockedUntil;
        //@ts-ignore
        delete ret.__v;
        return ret;
      },
    },
  }
);

userSchema.index({ email: 1, isActive: 1 });
userSchema.index({ lockedUntil: 1 }, { expireAfterSeconds: 0 });

userSchema.virtual('isLocked').get(function () {
  return !!(this.lockedUntil && this.lockedUntil > new Date());
});

export const User = mongoose.model<IUser>('User', userSchema);
