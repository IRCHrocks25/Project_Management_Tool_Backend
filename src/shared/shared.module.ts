import { Module } from '@nestjs/common';
import { IcebergService } from './iceberg.service';

@Module({
  providers: [IcebergService],
  exports: [IcebergService],
})
export class SharedModule {}
