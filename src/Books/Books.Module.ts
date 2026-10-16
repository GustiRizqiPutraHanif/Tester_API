import { Module } from '@nestjs/common';
import { BooksController } from './Books.Controller.js';
import { BooksService } from './Books.Service.js';

@Module({
  controllers: [BooksController],
  providers: [BooksService]
})
export class BooksModule {}
