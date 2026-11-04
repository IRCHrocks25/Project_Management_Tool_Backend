import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { ProductVaultModule } from '../product-vault/product-vault.module';
import { ProductsModule } from '../products/products.module';
import { ProjectsModule } from '../projects/projects.module';
import { TasksModule } from '../tasks/tasks.module';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';
import { AssistantConversation, AssistantFile, AssistantMemory, AssistantMessage } from './entities/assistant.entities';

@Module({
  imports: [
    TypeOrmModule.forFeature([AssistantConversation, AssistantMessage, AssistantMemory, AssistantFile]),
    AuthModule,
    ProjectsModule,
    TasksModule,
    ProductsModule,
    ProductVaultModule,
  ],
  controllers: [AssistantController],
  providers: [AssistantService],
})
export class AssistantModule {}
