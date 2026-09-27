import { Module } from '@nestjs/common';
import { QueuesModule } from '../queues/queues.js';
import { HealthController } from './health.controller.js';

@Module({
  imports: [QueuesModule],
  controllers: [HealthController],
})
export class HealthModule {}
