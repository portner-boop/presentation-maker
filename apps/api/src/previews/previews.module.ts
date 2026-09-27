import { Global, Module } from '@nestjs/common';
import { PreviewService } from './preview.service.js';

@Global()
@Module({
  providers: [PreviewService],
  exports: [PreviewService],
})
export class PreviewsModule {}
