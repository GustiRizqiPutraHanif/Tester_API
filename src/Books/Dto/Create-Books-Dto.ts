import { IsNotEmpty } from 'class-validator';

export class CreateBookDto {
    @IsNotEmpty({ message: 'Title Harus Diisi' })
    readonly title: string;

    @IsNotEmpty({ message: 'Author Harus Diisi' })
    readonly author: string;

    @IsNotEmpty({ message: 'ISBN Harus Diisi' })
    readonly isbn: string;


    readonly publishedYear: number;
    
}