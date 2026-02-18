import { Repository } from 'typeorm';
import { Email } from './entities/email.entity';
import { ProjectsService } from '../projects/projects.service';
import { CreateEmailDto } from './dto/create-email.dto';
import { NotificationsService } from '../notifications/notifications.service';
export declare class EmailsService {
    private emailsRepository;
    private projectsService;
    private notificationsService;
    constructor(emailsRepository: Repository<Email>, projectsService: ProjectsService, notificationsService: NotificationsService);
    create(createEmailDto: CreateEmailDto, userId: string): Promise<Email>;
    findAll(projectId: string): Promise<Email[]>;
}
