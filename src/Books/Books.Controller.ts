import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { get } from 'http';
import { BooksService } from './Books.Service.js';
import { Book } from './Entity/Books-Entity.js';
import { CreateBookDto} from './Dto/Create-Books-Dto.js';

@Controller('books')
export class BooksController {

    constructor(private readonly booksService: BooksService) { }

    @Get()
    findAll() {
        return this.booksService.findAll();
    }

    @Post()
    simpanData(@Body() createBookDto: CreateBookDto) {
        return this.booksService.simpanData(createBookDto);
    }

    @Put(':id')
    updateData(@Param('id') id: string, @Body() updateBookDto: CreateBookDto) {
        return this.booksService.updateData(Number(id), updateBookDto);
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.booksService.remove(Number(id));
    }
}