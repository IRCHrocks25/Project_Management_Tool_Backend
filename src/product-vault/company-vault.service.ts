import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { isUUID } from 'class-validator';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { NotificationType } from '../notifications/entities/notification.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { HubUsersService, SafeUser } from '../products/hub-users.service';
import { User } from '../users/entities/user.entity';
import {
  Access,
  NO_ACCESS,
  VaultItemAccessInfo,
  canManageVaultItem,
  canSeeVaultItem,
  sameAccess,
} from '../workspace/workspace-access';
import { CreateVaultItemDto, UpdateVaultItemDto } from './dto/company-vault.dto';
import { CredentialEventAction } from './entities/product-credential-event.entity';
import { ProductCredentialShare } from './entities/product-credential-share.entity';
import { ProductCredentialVersion } from './entities/product-credential-version.entity';
import { CredentialScope, ProductCredential } from './entities/product-credential.entity';
import { ProductVaultService, VaultActor } from './product-vault.service';
import { VaultCryptoService } from './vault-crypto.service';
import { SHARE_DURATIONS_MS, generateShareToken, hashShareToken } from './vault-access';

const VERSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ITEM_SCOPES = [CredentialScope.COMPANY, CredentialScope.PERSONAL];
const NOT_FOUND_MESSAGE = 'Vault item not found.';
const MANAGE_FORBIDDEN_MESSAGE = 'Only the owner or an admin can change who has access or delete this login.';
const VERSION_NOT_FOUND_MESSAGE = 'That earlier password is no longer available.';

const FIELD_LABELS: Record<string, string> = {
  label: 'name',
  loginUrl: 'login URL',
  username: 'username',
  secret: 'password',
  notes: 'notes',
  access: 'who has access',
};

const accessOf = (c: ProductCredential): Access => ({
  everyone: !!c.accessEveryone,
  departments: c.accessDepartments ?? [],
  userIds: c.accessUserIds ?? [],
});

const accessInfo = (c: ProductCredential): VaultItemAccessInfo => ({
  scope: c.scope,
  ownerId: c.ownerId,
  access: accessOf(c),
});

const normalizeAccess = (access: Access): Access => ({
  everyone: !!access.everyone,
  departments: [...new Set(access.departments)],
  userIds: [...new Set(access.userIds.map((id) => id.toLowerCase()))],
});

const emptyToNull = (value: string | null | undefined): string | null => {
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? null : trimmed;
};

@Injectable()
export class CompanyVaultService {
  private readonly logger = new Logger(CompanyVaultService.name);

  constructor(
    @InjectRepository(ProductCredential) private readonly itemsRepo: Repository<ProductCredential>,
    @InjectRepository(ProductCredentialVersion) private readonly versionsRepo: Repository<ProductCredentialVersion>,
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly vault: ProductVaultService,
    private readonly crypto: VaultCryptoService,
    private readonly hubUsers: HubUsersService,
    private readonly notifications: NotificationsService,
  ) {}

  // ---------------------------------------------------------------- helpers

  /** The item, or 404 for anyone without access, so its existence isn't leaked. */
  private async getVisible(id: string, actor: VaultActor): Promise<ProductCredential> {
    const item = await this.itemsRepo.findOne({ where: { id, scope: In(ITEM_SCOPES) } });
    if (!item || !canSeeVaultItem(actor, accessInfo(item))) throw new NotFoundException(NOT_FOUND_MESSAGE);
    return item;
  }

  /** Ciphertext for an item, read and locked inside the transaction so overlapping writes can't lose a version. */
  private async lockSecret(m: EntityManager, id: string): Promise<string> {
    const rows = await m.query(`SELECT "secretEncrypted" FROM product_credentials WHERE id = $1 FOR UPDATE`, [id]);
    if (!rows.length) throw new NotFoundException(NOT_FOUND_MESSAGE);
    return rows[0].secretEncrypted;
  }

  /** Keeps the outgoing ciphertext for 30 days. There is no scheduler, so expired ones go now. */
  private async saveVersion(m: EntityManager, credentialId: string, secretEncrypted: string, changedById: string) {
    const repo = m.getRepository(ProductCredentialVersion);
    await repo.insert({
      credentialId,
      secretEncrypted,
      changedById,
      expiresAt: new Date(Date.now() + VERSION_TTL_MS),
    });
    await m.query(`DELETE FROM product_credential_versions WHERE "expiresAt" <= NOW()`);
  }

  private async decryptNotes(ids: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (!ids.length) return map;
    const rows: { id: string; notesEncrypted: string }[] = await this.dataSource.query(
      `SELECT id, "notesEncrypted" FROM product_credentials WHERE id = ANY($1::uuid[]) AND "notesEncrypted" IS NOT NULL`,
      [ids],
    );
    for (const row of rows) map.set(row.id, this.crypto.decrypt(row.notesEncrypted));
    return map;
  }

  /** Only ever called with items the actor can see: this is where notes get decrypted. */
  private async toResponses(items: ProductCredential[], actor: VaultActor) {
    const ids = items.map((i) => i.id);
    const [notes, last, users] = await Promise.all([
      this.decryptNotes(ids),
      this.vault.lastEvents(ids),
      this.hubUsers.load(items.flatMap((i) => [i.createdById, i.updatedById, i.passwordChangedById])),
    ]);
    const user = (id: string | null): SafeUser | null => (id ? (users.get(id) ?? null) : null);
    return items.map((c) => ({
      id: c.id,
      scope: c.scope,
      label: c.label,
      loginUrl: c.loginUrl,
      username: c.username,
      notes: notes.get(c.id) ?? null,
      access: c.scope === CredentialScope.PERSONAL ? { ...NO_ACCESS } : accessOf(c),
      createdBy: user(c.createdById),
      updatedBy: user(c.updatedById),
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      passwordChangedAt: c.passwordChangedAt,
      passwordChangedBy: user(c.passwordChangedById),
      lastEvent: last.get(c.id) ?? null,
      canManage: canManageVaultItem(actor, accessInfo(c)),
    }));
  }

  private async toResponse(id: string, actor: VaultActor) {
    const [response] = await this.toResponses([await this.getVisible(id, actor)], actor);
    return response;
  }

  /**
   * Tells everyone with access that the login changed. Runs after the commit and never fails the action.
   * Notifications also go out by email, so only the item's name and the actor's name go in.
   */
  private async notifyChange(item: ProductCredential, actor: VaultActor, changed: { secret: boolean; username: boolean }) {
    if (item.scope !== CredentialScope.COMPANY || (!changed.secret && !changed.username)) return;
    try {
      const what = changed.secret && changed.username ? 'password and username' : changed.secret ? 'password' : 'username';
      const [actorUser, active] = await Promise.all([
        this.hubUsers.findOne(actor.userId),
        this.usersRepo.find({ select: ['id', 'role'], where: { isActive: true } }),
      ]);
      const info = accessInfo(item);
      const recipients = active.filter(
        (u) => u.id !== actor.userId && canSeeVaultItem({ userId: u.id, role: u.role }, info),
      );
      await Promise.all(
        recipients.map((u) =>
          this.notifications
            .create({
              type: NotificationType.VAULT_UPDATED,
              title: `${item.label} ${what} changed`,
              message: `${actorUser?.name || 'Someone'} updated the ${what} for ${item.label}.`,
              userId: u.id,
              link: `/vault?item=${item.id}`,
            })
            .catch((error) =>
              this.logger.warn(`Vault notification for user ${u.id} failed: ${error?.message || error}`),
            ),
        ),
      );
    } catch (error) {
      this.logger.warn(`Vault notifications for item ${item.id} failed: ${error?.message || error}`);
    }
  }

  // ---------------------------------------------------------------- items

  async list(scope: 'company' | 'personal', actor: VaultActor) {
    const items = await this.visibleItems(scope, actor);
    items.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
    return this.toResponses(items, actor);
  }

  private async visibleItems(scope: 'company' | 'personal', actor: VaultActor) {
    const rows = await this.itemsRepo.find({
      where: scope === 'personal' ? { scope: CredentialScope.PERSONAL, ownerId: actor.userId } : { scope: CredentialScope.COMPANY },
    });
    return rows.filter((c) => canSeeVaultItem(actor, accessInfo(c)));
  }

  async create(dto: CreateVaultItemDto, actor: VaultActor) {
    const isCompany = dto.scope === 'company';
    const access = isCompany ? normalizeAccess(dto.access as Access) : NO_ACCESS;
    const notes = emptyToNull(dto.notes);
    const secretEncrypted = this.crypto.encrypt(dto.secret); // 503 when the key is missing
    const notesEncrypted = notes ? this.crypto.encrypt(notes) : null;
    const saved = await this.dataSource.transaction(async (m) => {
      const repo = m.getRepository(ProductCredential);
      const item = await repo.save(
        repo.create({
          productId: null,
          scope: isCompany ? CredentialScope.COMPANY : CredentialScope.PERSONAL,
          ownerId: actor.userId,
          label: dto.label,
          loginUrl: emptyToNull(dto.loginUrl),
          username: dto.username,
          secretEncrypted,
          notesEncrypted,
          accessEveryone: access.everyone,
          accessDepartments: access.departments,
          accessUserIds: access.userIds,
          createdById: actor.userId,
          updatedById: actor.userId,
        }),
      );
      await this.vault.logEvent(item.id, actor.userId, CredentialEventAction.CREATED, null, m);
      return item;
    });
    return this.toResponse(saved.id, actor);
  }

  async update(id: string, dto: UpdateVaultItemDto, actor: VaultActor) {
    const item = await this.getVisible(id, actor);
    const patch: Partial<ProductCredential> = {};
    const changed: string[] = [];

    if (dto.label != null && dto.label !== item.label) {
      patch.label = dto.label;
      changed.push('label');
    }
    if (dto.loginUrl !== undefined) {
      const url = emptyToNull(dto.loginUrl);
      if (url !== item.loginUrl) {
        patch.loginUrl = url;
        changed.push('loginUrl');
      }
    }
    if (dto.username != null && dto.username !== item.username) {
      patch.username = dto.username;
      changed.push('username');
    }
    if (dto.access != null && item.scope === CredentialScope.COMPANY) {
      const access = normalizeAccess(dto.access);
      if (!sameAccess(access, accessOf(item))) {
        if (!canManageVaultItem(actor, accessInfo(item))) throw new ForbiddenException(MANAGE_FORBIDDEN_MESSAGE);
        patch.accessEveryone = access.everyone;
        patch.accessDepartments = access.departments;
        patch.accessUserIds = access.userIds;
        changed.push('access');
      }
    }
    if (dto.notes !== undefined) {
      const notes = emptyToNull(dto.notes);
      const current = (await this.decryptNotes([item.id])).get(item.id) ?? null;
      if (notes !== current) {
        patch.notesEncrypted = notes ? this.crypto.encrypt(notes) : null;
        changed.push('notes');
      }
    }

    const nextSecret = dto.secret != null ? dto.secret : null;
    if (nextSecret !== null) this.crypto.assertReady();

    let secretChanged = false;
    await this.dataSource.transaction(async (m) => {
      if (nextSecret !== null) {
        const current = await this.lockSecret(m, item.id);
        // Saving the same password again isn't a change: no version and nobody gets notified.
        if (this.crypto.decrypt(current) !== nextSecret) {
          await this.saveVersion(m, item.id, current, actor.userId);
          patch.secretEncrypted = this.crypto.encrypt(nextSecret);
          patch.passwordChangedAt = new Date();
          patch.passwordChangedById = actor.userId;
          changed.push('secret');
          secretChanged = true;
        }
      }
      if (!changed.length) return;
      patch.updatedById = actor.userId;
      await m.getRepository(ProductCredential).update({ id: item.id }, patch);
      await this.vault.logEvent(
        item.id,
        actor.userId,
        CredentialEventAction.EDITED,
        `Changed ${changed.map((f) => FIELD_LABELS[f]).join(', ')}`,
        m,
      );
    });

    const next = { ...item, ...patch } as ProductCredential;
    await this.notifyChange(next, actor, { secret: secretChanged, username: changed.includes('username') });
    return this.toResponse(item.id, actor);
  }

  async remove(id: string, actor: VaultActor) {
    const item = await this.getVisible(id, actor);
    if (!canManageVaultItem(actor, accessInfo(item))) throw new ForbiddenException(MANAGE_FORBIDDEN_MESSAGE);
    // Events, shares and versions cascade with the row.
    await this.itemsRepo.delete({ id: item.id });
    return { success: true };
  }

  async reveal(id: string, purpose: 'reveal' | 'copy', actor: VaultActor) {
    const item = await this.getVisible(id, actor);
    this.crypto.assertReady();
    const row = await this.itemsRepo
      .createQueryBuilder('c')
      .addSelect('c.secretEncrypted')
      .where('c.id = :id', { id: item.id })
      .getOne();
    if (!row) throw new NotFoundException(NOT_FOUND_MESSAGE);
    const secret = this.crypto.decrypt(row.secretEncrypted);
    await this.vault.logEvent(
      item.id,
      actor.userId,
      purpose === 'copy' ? CredentialEventAction.COPIED : CredentialEventAction.REVEALED,
    );
    return { secret };
  }

  async events(id: string, actor: VaultActor) {
    const item = await this.getVisible(id, actor);
    return this.vault.recentEvents(item.id);
  }

  // ---------------------------------------------------------------- versions

  async versions(id: string, actor: VaultActor) {
    const item = await this.getVisible(id, actor);
    const rows = await this.versionsRepo
      .createQueryBuilder('v')
      .where('v.credentialId = :id', { id: item.id })
      .andWhere('v.expiresAt > NOW()')
      .orderBy('v.createdAt', 'DESC')
      .getMany();
    const users = await this.hubUsers.load(rows.map((v) => v.changedById));
    return rows.map((v) => ({
      id: v.id,
      changedBy: v.changedById ? (users.get(v.changedById) ?? null) : null,
      createdAt: v.createdAt,
      expiresAt: v.expiresAt,
    }));
  }

  /** Ciphertext of an unexpired version of this item. */
  private async versionSecret(m: EntityManager, credentialId: string, versionId: string): Promise<string> {
    const rows = await m.query(
      `SELECT "secretEncrypted" FROM product_credential_versions
        WHERE id = $1 AND "credentialId" = $2 AND "expiresAt" > NOW()`,
      [versionId, credentialId],
    );
    if (!rows.length) throw new NotFoundException(VERSION_NOT_FOUND_MESSAGE);
    return rows[0].secretEncrypted;
  }

  async revealVersion(id: string, versionId: string, actor: VaultActor) {
    const item = await this.getVisible(id, actor);
    this.crypto.assertReady();
    const secret = this.crypto.decrypt(await this.versionSecret(this.dataSource.manager, item.id, versionId));
    await this.vault.logEvent(item.id, actor.userId, CredentialEventAction.VERSION_REVEALED);
    return { secret };
  }

  async restoreVersion(id: string, versionId: string, actor: VaultActor) {
    const item = await this.getVisible(id, actor);
    this.crypto.assertReady();
    await this.dataSource.transaction(async (m) => {
      const current = await this.lockSecret(m, item.id);
      const restored = await this.versionSecret(m, item.id, versionId);
      await this.saveVersion(m, item.id, current, actor.userId);
      await m.getRepository(ProductCredential).update(
        { id: item.id },
        {
          secretEncrypted: restored,
          passwordChangedAt: new Date(),
          passwordChangedById: actor.userId,
          updatedById: actor.userId,
        },
      );
      await this.vault.logEvent(item.id, actor.userId, CredentialEventAction.RESTORED, 'Restored an earlier password', m);
    });
    await this.notifyChange(item, actor, { secret: true, username: false });
    return this.toResponse(item.id, actor);
  }

  // ---------------------------------------------------------------- assistant

  /** Names only, for the assistant. Nothing here is decrypted. */
  async listLabels(actor: VaultActor) {
    const [company, personal] = await Promise.all([
      this.visibleItems('company', actor),
      this.visibleItems('personal', actor),
    ]);
    return [...company, ...personal]
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
      .map((c) => ({ id: c.id, label: c.label, scope: c.scope }));
  }

  /** One-time, one-hour link that works even though the item isn't shareable. Only the assistant calls this. */
  async createInternalLink(id: string, actor: VaultActor) {
    if (!isUUID(id)) throw new NotFoundException(NOT_FOUND_MESSAGE);
    const item = await this.getVisible(id, actor);
    this.crypto.assertReady();
    const token = generateShareToken();
    const expiresAt = new Date(Date.now() + SHARE_DURATIONS_MS['1h']);
    await this.dataSource.transaction(async (m) => {
      const repo = m.getRepository(ProductCredentialShare);
      await repo.save(
        repo.create({
          credentialId: item.id,
          tokenHash: hashShareToken(token),
          expiresAt,
          oneTime: true,
          internal: true,
          createdById: actor.userId,
        }),
      );
      await this.vault.logEvent(
        item.id,
        actor.userId,
        CredentialEventAction.SHARED,
        'One-time link from the assistant, expires in 1h',
        m,
      );
    });
    return { label: item.label, url: this.vault.shareUrl(token), expiresAt, oneTime: true };
  }
}
