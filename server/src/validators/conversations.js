import { z } from 'zod';

export const messageCreateSchema = z.object({
  body: z.string().trim().min(1, 'Write a message before sending.').max(4000),
}).strict();
