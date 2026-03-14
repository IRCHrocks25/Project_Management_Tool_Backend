import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ticket, TicketStatus } from './entities/ticket.entity';

@Injectable()
export class TicketsService {
  constructor(
    @InjectRepository(Ticket)
    private ticketsRepository: Repository<Ticket>,
  ) {}

  async create(data: { title: string; description?: string; type: string; submittedById: string }) {
    const ticket = this.ticketsRepository.create({
      title: data.title,
      description: data.description || '',
      type: data.type as any,
      status: TicketStatus.OPEN,
      submittedById: data.submittedById,
    });
    return this.ticketsRepository.save(ticket);
  }

  async findAll() {
    return this.ticketsRepository.find({
      relations: ['submittedBy'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string) {
    const ticket = await this.ticketsRepository.findOne({
      where: { id },
      relations: ['submittedBy'],
    });
    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }
    return ticket;
  }

  async updateStatus(id: string, status: string) {
    const ticket = await this.findOne(id);
    ticket.status = status as TicketStatus;
    return this.ticketsRepository.save(ticket);
  }
}
