import { z } from 'zod';

const DependencyStatus = z.enum(['up', 'down']);

export const HealthSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  db: DependencyStatus,
  redis: DependencyStatus,
});
export type Health = z.infer<typeof HealthSchema>;
