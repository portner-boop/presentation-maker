import { InjectQueue } from '@nestjs/bullmq';
import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { type Health, HealthSchema } from '@pm/shared';
import type { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service.js';
import { TEMPLATE_ANALYSIS_QUEUE } from '../queues/queues.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(TEMPLATE_ANALYSIS_QUEUE) private readonly queue: Queue,
  ) {}

  @Get()
  @ApiOkResponse({ standardSchema: HealthSchema })
  async check(): Promise<Health> {
    const [db, redis] = await Promise.all([
      probe(() => this.prisma.$queryRaw`SELECT 1`),
      probe(() => this.queue.getJobCounts()),
    ]);
    return { status: db === 'up' && redis === 'up' ? 'ok' : 'degraded', db, redis };
  }
}

const PROBE_TIMEOUT_MS = 2_000;

async function probe(fn: () => Promise<unknown>): Promise<'up' | 'down'> {
  try {
    // без таймаута клиенты ждут переподключения и health зависает
    await Promise.race([
      fn(),
      new Promise((_, reject) => setTimeout(reject, PROBE_TIMEOUT_MS).unref()),
    ]);
    return 'up';
  } catch {
    return 'down';
  }
}
