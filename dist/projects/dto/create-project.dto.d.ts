import { ClientType, PackageType, Priority } from '../entities/project.entity';
export declare class CreateProjectDto {
    clientName: string;
    clientType: ClientType;
    package: PackageType;
    customDeliverables?: string[];
    priority: Priority;
    pmId: string;
    targetCloseMonth: string;
    clientStartDate?: string;
    notes?: string;
}
