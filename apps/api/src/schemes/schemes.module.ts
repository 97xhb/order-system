import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SchemesController } from './schemes.controller';
import { SchemesService } from './schemes.service';

@Module({
  imports: [AuthModule],
  controllers: [SchemesController],
  providers: [SchemesService],
  exports: [SchemesService],
})
export class SchemesModule {}
