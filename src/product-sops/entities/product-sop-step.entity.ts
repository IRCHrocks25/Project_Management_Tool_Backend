import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { ProductSop } from './product-sop.entity';

export type SopStepLinkKind = 'url' | 'tab' | 'credential' | 'file';

export interface SopStepLink {
  kind: SopStepLinkKind;
  ref: string;
  label: string;
}

@Entity('product_sop_steps')
export class ProductSopStep {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ProductSop, (sop) => sop.steps, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sopId' })
  sop: ProductSop;

  @Column('uuid')
  sopId: string;

  @Column({ type: 'int' })
  position: number;

  @Column('text')
  text: string;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  links: SopStepLink[];
}
