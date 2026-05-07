import { z } from 'zod';

export const CreatePreferenceSchema = z.object({
  project: z.string().optional(),
  amount: z.union([z.string(), z.number()]),
  name: z.string().trim().max(120).optional(),
  email: z.email().optional().or(z.literal('')),
  walletOnly: z.boolean().optional(),
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

const PayerAddressSchema = z.object({
  zipCode: z
    .string()
    .trim()
    .min(5)
    .max(16)
    .regex(/^[0-9.-]+$/),
  streetName: z.string().trim().min(2).max(120),
  streetNumber: z.string().trim().min(1).max(24),
  neighborhood: z.string().trim().min(2).max(80),
  city: z.string().trim().min(2).max(80),
  state: z
    .string()
    .trim()
    .min(2)
    .max(2)
    .regex(/^[A-Za-z]{2}$/),
  complement: z.string().trim().max(80).optional().or(z.literal('')),
});

export const CreateOrderSchema = z.object({
  project: z.string().optional(),
  amount: z.union([z.string(), z.number()]),
  name: z.string().trim().max(120).optional(),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.email(),
  token: z.string().trim().min(8).max(256),
  paymentMethodId: z.string().trim().min(1).max(80),
  paymentType: z.enum(['credit_card', 'debit_card']).default('credit_card'),
  installments: z.coerce.number().int().min(1).max(24),
  identification: PayerIdentificationSchema.optional(),
  address: PayerAddressSchema,
  payerRegistrationDate: z
    .string()
    .trim()
    .refine((value) => !Number.isNaN(Date.parse(value)), 'Invalid payer registration date.'),
  firstPurchaseOnline: z.boolean(),
});

export type CreateOrderInput = z.infer<typeof CreateOrderSchema>;
