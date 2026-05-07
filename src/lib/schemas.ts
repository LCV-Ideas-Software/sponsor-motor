import { z } from 'zod';

export const CreatePreferenceSchema = z.object({
  project: z.string().optional(),
  amount: z.union([z.string(), z.number()]),
  name: z.string().trim().max(120).optional(),
  email: z.email().optional().or(z.literal('')),
});

export type CreatePreferenceInput = z.infer<typeof CreatePreferenceSchema>;

const PayerIdentificationSchema = z.object({
  type: z.string().trim().min(1).max(16),
  number: z
    .string()
    .trim()
    .min(3)
    .max(32)
    .regex(/^[A-Za-z0-9.-]+$/),
});

export const CreateOrderSchema = z.object({
  project: z.string().optional(),
  amount: z.union([z.string(), z.number()]),
  name: z.string().trim().max(120).optional(),
  email: z.email(),
  token: z.string().trim().min(8).max(256),
  paymentMethodId: z.string().trim().min(1).max(80),
  paymentType: z.enum(['credit_card', 'debit_card']).default('credit_card'),
  installments: z.coerce.number().int().min(1).max(24),
  identification: PayerIdentificationSchema.optional(),
});

export type CreateOrderInput = z.infer<typeof CreateOrderSchema>;
