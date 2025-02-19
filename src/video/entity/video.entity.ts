import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity()
export class Video {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  filename: string;

  @Column({ nullable: true })
  filepath: string;

  @Column({ type: 'integer' })
  size: number;

  @Column({ type: 'float' })
  duration: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  shareableLink?: string;

  @Column({ nullable: true })
  shareToken?: string;

  @Column({ type: 'datetime', nullable: true })
  shareExpiry?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}