import { z } from 'zod';
export const signupSchema=z.object({fullName:z.string().trim().min(2).max(100),email:z.string().trim().email().transform(value=>value.toLowerCase()),password:z.string().min(8).max(128),termsAccepted:z.literal(true)}).strict();
export const emailSchema=z.object({email:z.string().trim().email().transform(value=>value.toLowerCase())}).strict();
