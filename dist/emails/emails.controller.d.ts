import { EmailsService } from './emails.service';
import { CreateEmailDto } from './dto/create-email.dto';
export declare class EmailsController {
    private readonly emailsService;
    constructor(emailsService: EmailsService);
    create(createEmailDto: CreateEmailDto, req: any): Promise<import("./entities/email.entity").Email>;
    findAll(projectId: string): Promise<import("./entities/email.entity").Email[]>;
}
