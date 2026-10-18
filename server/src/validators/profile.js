import { z } from 'zod';
export const profileUpdateSchema=z.object({full_name:z.string().trim().min(2).max(100).optional(),student_id:z.string().trim().max(80).nullable().optional()}).strict().refine(value=>Object.keys(value).length>0,{message:'Provide at least one profile field.'});
