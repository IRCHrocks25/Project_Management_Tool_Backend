import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Product } from '../products/entities/product.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import { ProductDemoAccount } from './entities/product-demo-account.entity';
import { CredentialEnvironment, ProductCredential } from './entities/product-credential.entity';
import { CreateDemoAccountDto, UpdateDemoAccountDto } from './dto/demo-account.dto';
import { ProductVaultService, VaultActor } from './product-vault.service';
import { VaultCryptoService } from './vault-crypto.service';
import { safeUser } from './vault-access';

@Injectable()
export class DemoAccountsService {
  constructor(
    @InjectRepository(ProductDemoAccount) private readonly demoRepo: Repository<ProductDemoAccount>,
    @InjectRepository(ProductCredential) private readonly credentialsRepo: Repository<ProductCredential>,
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly vault: ProductVaultService,
    private readonly crypto: VaultCryptoService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private async findUser(id: string) {
    return this.usersRepo.findOne({
      where: { id },
      select: { id: true, name: true, avatarUrl: true, role: true },
    });
  }

  private async assertOwnerExists(ownerId: string) {
    if (!(await this.findUser(ownerId))) {
      throw new BadRequestException('That owner was not found. Pick someone from the team list.');
    }
  }

  private async assertCredentialOnProduct(productId: string, credentialId: string) {
    const exists = await this.credentialsRepo.exists({ where: { id: credentialId, productId } });
    if (!exists) {
      throw new BadRequestException('That vault item does not belong to this product.');
    }
  }

  private async loadOne(id: string) {
    const d = await this.demoRepo
      .createQueryBuilder('d')
      .leftJoin('d.owner', 'o')
      .addSelect(['o.id', 'o.name', 'o.avatarUrl', 'o.role'])
      .leftJoin('d.credential', 'c')
      .addSelect(['c.id', 'c.label'])
      .where('d.id = :id', { id })
      .getOne();
    if (!d) throw new NotFoundException('Demo account not found.');
    return this.toResponse(d);
  }

  private toResponse(d: ProductDemoAccount) {
    return {
      id: d.id,
      productId: d.productId,
      clientName: d.clientName,
      loginEmail: d.loginEmail,
      purpose: d.purpose,
      avatarStatus: d.avatarStatus,
      transcriptStatus: d.transcriptStatus,
      ownerId: d.ownerId,
      owner: safeUser(d.owner),
      credentialId: d.credentialId,
      credential: d.credential ? { id: d.credential.id, label: d.credential.label } : null,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    };
  }

  private async notifyOwner(product: Product, demo: { clientName: string; ownerId: string | null }, actorId: string) {
    if (!demo.ownerId || demo.ownerId === actorId) return;
    try {
      const actor = await this.findUser(actorId);
      const actorName = actor?.name || 'Someone';
      await this.notificationsService.create({
        type: NotificationType.PRODUCT_ASSIGNED,
        title: `${actorName} made you owner of the ${demo.clientName} demo account`,
        message: `You own the ${product.name} demo account for ${demo.clientName}.`,
        userId: demo.ownerId,
        productId: product.id,
        link: `/products/${product.slug}/demo-accounts`,
      });
    } catch (err) {
      console.error('[DemoAccountsService] Failed to notify demo account owner:', (err as Error)?.message);
    }
  }

  async list(productId: string) {
    await this.vault.getProduct(productId);
    const rows = await this.demoRepo
      .createQueryBuilder('d')
      .leftJoin('d.owner', 'o')
      .addSelect(['o.id', 'o.name', 'o.avatarUrl', 'o.role'])
      .leftJoin('d.credential', 'c')
      .addSelect(['c.id', 'c.label'])
      .where('d.productId = :productId', { productId })
      .orderBy('d.createdAt', 'DESC')
      .getMany();
    return rows.map((d) => this.toResponse(d));
  }

  async create(productId: string, dto: CreateDemoAccountDto, actor: VaultActor) {
    const product = await this.vault.getProduct(productId);
    await this.assertOwnerExists(dto.ownerId);

    const saveNewPassword = !!dto.savePassword && !!dto.password;
    if (dto.savePassword && !dto.password) {
      throw new BadRequestException('Enter the demo password to save it to the vault.');
    }
    if (saveNewPassword && dto.credentialId) {
      throw new BadRequestException(
        'Either save a new password or link an existing vault item, not both.',
      );
    }
    if (dto.credentialId) await this.assertCredentialOnProduct(product.id, dto.credentialId);
    if (saveNewPassword) this.crypto.assertReady();

    const clientName = dto.clientName.trim();
    const loginEmail = dto.loginEmail.trim();
    const saved = await this.dataSource.transaction(async (m) => {
      let credentialId: string | null = dto.credentialId ?? null;
      if (saveNewPassword) {
        const cred = await this.vault.insertCredential(
          m,
          product.id,
          actor.userId,
          {
            label: `Demo login · ${clientName}`,
            environment: CredentialEnvironment.DEMO,
            loginUrl: null,
            username: loginEmail,
            secret: dto.password as string,
            shareable: true,
          },
          `Saved with the ${clientName} demo account`,
        );
        credentialId = cred.id;
      }
      const repo = m.getRepository(ProductDemoAccount);
      return repo.save(
        repo.create({
          productId: product.id,
          clientName,
          loginEmail,
          purpose: dto.purpose?.trim() || null,
          ownerId: dto.ownerId,
          avatarStatus: dto.avatarStatus,
          transcriptStatus: dto.transcriptStatus,
          credentialId,
        }),
      );
    });

    await this.notifyOwner(product, saved, actor.userId);
    return this.loadOne(saved.id);
  }

  async update(productId: string, demoId: string, dto: UpdateDemoAccountDto, actor: VaultActor) {
    const product = await this.vault.getProduct(productId);
    const demo = await this.demoRepo.findOne({ where: { id: demoId, productId } });
    if (!demo) throw new NotFoundException('Demo account not found.');

    const patch: Partial<ProductDemoAccount> = {};
    if (dto.clientName !== undefined) patch.clientName = dto.clientName.trim();
    if (dto.loginEmail !== undefined) patch.loginEmail = dto.loginEmail.trim();
    if (dto.purpose !== undefined) patch.purpose = dto.purpose?.trim() || null;
    if (dto.avatarStatus !== undefined) patch.avatarStatus = dto.avatarStatus;
    if (dto.transcriptStatus !== undefined) patch.transcriptStatus = dto.transcriptStatus;
    if (dto.ownerId !== undefined && dto.ownerId !== demo.ownerId) {
      await this.assertOwnerExists(dto.ownerId);
      patch.ownerId = dto.ownerId;
    }
    if (dto.credentialId !== undefined) {
      if (dto.credentialId !== null) await this.assertCredentialOnProduct(product.id, dto.credentialId);
      patch.credentialId = dto.credentialId;
    }

    if (Object.keys(patch).length) {
      await this.demoRepo.update({ id: demo.id }, patch);
    }
    if (patch.ownerId) {
      await this.notifyOwner(
        product,
        { clientName: patch.clientName ?? demo.clientName, ownerId: patch.ownerId },
        actor.userId,
      );
    }
    return this.loadOne(demo.id);
  }

  async remove(productId: string, demoId: string) {
    await this.vault.getProduct(productId);
    const demo = await this.demoRepo.findOne({ where: { id: demoId, productId } });
    if (!demo) throw new NotFoundException('Demo account not found.');
    // The linked vault item (if any) stays in the vault.
    await this.demoRepo.delete({ id: demo.id });
    return { success: true };
  }
}
