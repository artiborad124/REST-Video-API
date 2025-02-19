import { IsNumber, IsString } from 'class-validator';

export class UploadVideoDto {
  @IsString()
  filename: string;

  @IsNumber()
  size: number;

  @IsNumber()
  duration: number;
}
