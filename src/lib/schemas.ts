import { z } from 'zod';

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

const PayerPhoneSchema = z
  .union([
    z
      .string()
      .trim()
      .min(8)
      .max(32)
      .regex(/^[0-9+().\s-]+$/),
    z.literal(''),
  ])
  .optional();

export const CreateOrderSchema = z.object({
  project: z.string().optional(),
  amount: z.union([z.string(), z.number()]),
  name: z.string().trim().max(120).optional(),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.email(),
  phone: PayerPhoneSchema,
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
  // v01.02.00: integration quality recommendation —
  // `additional_info.payer.last_purchase`. Optional ISO-8601 timestamp
  // forwarded to MP fraud analysis when the caller actually knows a
  // prior purchase date for the payer. Empty string is treated as
  // absent. Frontends that do not surface the field can simply omit
  // it; the API contract stays compatible.
  payerLastPurchase: z
    .string()
    .trim()
    .refine((value) => value === '' || !Number.isNaN(Date.parse(value)), 'Invalid payer last_purchase date.')
    .optional()
    .or(z.literal('')),
});

export type CreateOrderInput = z.infer<typeof CreateOrderSchema>;

// v01.02.00: refund and cancel request bodies for the operator-only
// admin endpoints. Refund is full unless `transactions` is provided
// (then it is a per-transaction partial). Cancel takes no body.
const RefundTransactionSchema = z.object({
  id: z.string().trim().min(1).max(64).optional(),
  amount: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, 'amount must be a positive decimal with up to 2 places')
    .optional(),
});

export const RefundOrderSchema = z
  .object({
    transactions: z.array(RefundTransactionSchema).min(1).max(8).optional(),
  })
  .optional();

export type RefundOrderInput = z.infer<typeof RefundOrderSchema>;
