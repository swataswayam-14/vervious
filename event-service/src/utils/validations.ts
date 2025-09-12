import z from 'zod';

export const userSchema = z.object({
  email: z.email({ message: "Valid email is required" }),
  password: z.string().min(8, { message: "Password must be at least 8 characters" }),
  name: z.string().min(2).max(100, { message: "Name must be 2-100 characters" }),
  role: z.string(),
});