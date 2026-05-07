import { z } from 'zod';

export const CreatePreferenceSchema = z.object({
  project: z.string().optional(),
  amount: z.union([z.string(), z.number()]),
  name: z.string().trim().max(120).optional(),
  email: z.email().optional().or(z.literal('')),
});

export type CreatePreferenceInput = z.infer<typeof CreatePreferenceSchema>;
