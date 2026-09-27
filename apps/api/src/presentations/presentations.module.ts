import { Module } from '@nestjs/common';
import { QueuesModule } from '../queues/queues.js';
import { TemplatesModule } from '../templates/templates.module.js';
import { PresentationsController } from './presentations.controller.js';
import { PresentationsService } from './presentations.service.js';

@Module({
  imports: [QueuesModule, TemplatesModule],
  controllers: [PresentationsController],
  providers: [PresentationsService],
  exports: [PresentationsService],
})
export class PresentationsModule {}
