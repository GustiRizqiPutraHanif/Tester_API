import { Injectable } from '@nestjs/common';
import { Book } from './Entity/Books-Entity.js';
import { CreateBookDto } from './Dto/Create-Books-Dto.js';

@Injectable()
export class BooksService {
    findAll(): Book[] {
        throw new Error('Method not implemented.');
    }
    private books: Book[] = [
        {
            id: 1,
            title: 'Book 1',
            author: 'Author 1',
            isbn: '1234567890',
            publishedYear: 2022,
            isAvailable: true,
        },
        {
            id: 2,
            title: 'Book 2',
            author: 'Author 2',
            isbn: '1234567890',
            publishedYear: 2022,
            isAvailable: true,
        },
    ];
    
    simpanData(createBookDto: CreateBookDto): Book {
        const newBook: Book = {
            id: this.books.length + 1,
            title: createBookDto.title,
            author: createBookDto.author,
            isbn: createBookDto.isbn,
            publishedYear: createBookDto.publishedYear,
            isAvailable: true,
        };
        this.books.push(newBook);
        return newBook;
    }

    updateData(id: number, updateBookDto: CreateBookDto): Book {
        const bookIndex = this.books.findIndex((book) => book.id === id);
        if (bookIndex === -1) {
            throw new Error('Book not found');
        }
        const updatedBook: Book = {
            ...this.books[bookIndex],
            title: updateBookDto.title,
            author: updateBookDto.author,
            isbn: updateBookDto.isbn,
            publishedYear: updateBookDto.publishedYear,
        };
        this.books[bookIndex] = updatedBook;
        return updatedBook;
    }

    remove(id: number): void {
        const bookIndex = this.books.findIndex((book) => book.id === id);
        if (bookIndex === -1) {
            throw new Error('Book not found');
        }
        this.books.splice(bookIndex, 1);
    }
}

