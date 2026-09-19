import { z } from 'zod';

export const SUPPLY_RENEWAL_MS = 20 * 60 * 1000;
export const renewalSchema = z
  .array(
    z.object({
      id: z.string().max(128),
      kind: z.enum(['enemy', 'forage']),
      readyAt: z.number().finite().nonnegative(),
      cycle: z.number().int().min(0).max(1000000),
    }),
  )
  .max(1500)
  .catch([]);
export type SupplyRenewal = z.infer<typeof renewalSchema>[number];
export const cycleLootSource = (id: string, cycle: number) => (cycle ? `${id}:cycle:${cycle}` : id);
