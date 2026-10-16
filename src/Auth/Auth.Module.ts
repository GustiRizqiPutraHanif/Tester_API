import { Module } from '@nestjs/common';
import { AuthController } from './Auth.controller.js';
import { AuthService } from './Auth.Service.js';

@Module({
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
