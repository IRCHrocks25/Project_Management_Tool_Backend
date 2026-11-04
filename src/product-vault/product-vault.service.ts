import {
  BadRequestException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Product } from '../products/entities/product.entity';
import { CredentialEnvironment, ProductCredential } from './entities/product-credential.entity';
import {
  CredentialEventAction,
  ProductCredentialEvent,
} from './entities/product-credential-event.entity';
import { ProductCredentialShare } from './entities/product-credential-share.entity';
import { CreateCredentialDto, CreateShareDto, UpdateCredentialDto } from './dto/credential.dto';
import { VaultCryptoService } from './vault-crypto.service';
import {
  REVEAL_FORBIDDEN_MESSAGE,
  EDIT_FORBIDDEN_MESSAGE,
  SHARE_DURATIONS_MS,
  SHARE_GONE_MESSAGE,
  canRevealCredential,
  generateShareToken,
  hashShareToken,
  isWellFormedShareToken,
  rowsOf,
  safeUser,
} from './vault-access';
import { publicAppUrl } from '../shared/public-app-url';

export interface VaultActor {
  userId: string;
  role?: string | null;
}

const USER_FIELDS = (alias: string) => [
  `${alias}.id`,
  `${alias}.name`,
  `${alias}.avatarUrl`,
  `${alias}.role`,
];

const FIELD_LABELS: Record<string, string> = {
  label: 'name',
  environment: 'environment',
  loginUrl: 'login URL',
  username: 'username',
  secret: 'password',
  shareable: 'sharing',
};

@Injectable()
export class ProductVaultService {
  constructor(
    @InjectRepository(Product) private readonly productsRepo: Repository<Product>,
    @InjectRepository(ProductCredential) private readonly credentialsRepo: Repository<ProductCredential>,
    @InjectRepository(ProductCredentialEvent)
    private readonly eventsRepo: Repository<ProductCredentialEvent>,
    @InjectRepository(ProductCredentialShare)
    private readonly sharesRepo: Repository<ProductCredentialShare>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly crypto: VaultCryptoService,
    private readonly configService: ConfigService,
  ) {}

  // ---------------------------------------------------------------- helpers

  async getProduct(productId: string): Promise<Product> {
    const product = await this.productsRepo.findOne({ where: { id: productId } });
    if (!product) throw new NotFoundException('Product not found.');
    return product;
  }

  /** product_members belongs to another module and may not exist yet: a missing table means "not a member". */
  async isMember(productId: string, userId: string): Promise<boolean> {
    try {
      const rows = await this.dataSource.query(
        `SELECT 1 FROM product_members WHERE "productId" = $1 AND "userId" = $2 LIMIT 1`,
        [productId, userId],
      );
      return rows.length > 0;
    } catch (err: any) {
      if (err?.code === '42P01' || err?.driverError?.code === '42P01') return false;
      throw err;
    }
  }

  async canReveal(actor: VaultActor, product: Product): Promise<boolean> {
    const quick = canRevealCredential({
      userId: actor.userId,
      role: actor.role,
      productOwnerId: product.ownerId,
      isMember: false,
    });
    if (quick) return true;
    if (!actor.userId) return false;
    return canRevealCredential({
      userId: actor.userId,
      role: actor.role,
      productOwnerId: product.ownerId,
      isMember: await this.isMember(product.id, actor.userId),
    });
  }

  private async assertCanReveal(actor: VaultActor, product: Product, message = REVEAL_FORBIDDEN_MESSAGE) {
    if (!(await this.canReveal(actor, product))) {
      throw new ForbiddenException(message);
    }
  }

  private async getCredential(productId: string, credId: string): Promise<ProductCredential> {
    const cred = await this.credentialsRepo.findOne({ where: { id: credId, productId } });
    if (!cred) throw new NotFoundException('Vault item not found.');
    return cred;
  }

  private async getSecretEncrypted(credId: string): Promise<string> {
    const row = await this.credentialsRepo
      .createQueryBuilder('c')
      .addSelect('c.secretEncrypted')
      .where('c.id = :id', { id: credId })
      .getOne();
    if (!row) throw new NotFoundException('Vault item not found.');
    return row.secretEncrypted;
  }

  async logEvent(
    credentialId: string,
    userId: string | null,
    action: CredentialEventAction,
    detail: string | null = null,
    manager?: EntityManager,
  ) {
    const repo = manager ? manager.getRepository(ProductCredentialEvent) : this.eventsRepo;
    await repo.insert({ credentialId, userId, action, detail });
  }

  private emptyToNull(v: string | null | undefined): string | null {
    if (v === undefined || v === null) return null;
    const t = v.trim();
    return t === '' ? null : t;
  }

  /** Public shape of a credential (never includes the secret). */
  private toCredentialResponse(
    c: ProductCredential,
    lastEvent: { action: string; user: any; at: Date } | null,
    canReveal: boolean,
  ) {
    return {
      id: c.id,
      productId: c.productId,
      label: c.label,
      environment: c.environment,
      loginUrl: c.loginUrl,
      username: c.username,
      shareable: c.shareable,
      createdBy: safeUser(c.createdBy),
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      lastEvent,
      canReveal,
    };
  }

  private async lastEvents(credentialIds: string[]) {
    const map = new Map<string, { action: string; user: any; at: Date }>();
    if (!credentialIds.length) return map;
    const rows = await this.dataSource.query(
      `SELECT DISTINCT ON (e."credentialId")
              e."credentialId", e.action, e."createdAt",
              u.id AS "userId", u.name AS "userName", u."avatarUrl" AS "userAvatarUrl", u.role AS "userRole"
         FROM product_credential_events e
         LEFT JOIN users u ON u.id = e."userId"
        WHERE e."credentialId" = ANY($1::uuid[])
        ORDER BY e."credentialId", e."createdAt" DESC`,
      [credentialIds],
    );
    for (const r of rows) {
      map.set(r.credentialId, {
        action: r.action,
        at: r.createdAt,
        user: r.userId
          ? { id: r.userId, name: r.userName, avatarUrl: r.userAvatarUrl ?? null, role: r.userRole ?? null }
          : null,
      });
    }
    return map;
  }

  private async loadCredentialResponse(cred: ProductCredential, canReveal: boolean) {
    const full = await this.credentialsRepo
      .createQueryBuilder('c')
      .leftJoin('c.createdBy', 'cb')
      .addSelect(USER_FIELDS('cb'))
      .where('c.id = :id', { id: cred.id })
      .getOne();
    const last = await this.lastEvents([cred.id]);
    return this.toCredentialResponse(full ?? cred, last.get(cred.id) ?? null, canReveal);
  }

  // ---------------------------------------------------------------- credentials

  async listCredentials(productId: string, actor: VaultActor) {
    const product = await this.getProduct(productId);
    const canReveal = await this.canReveal(actor, product);
    const creds = await this.credentialsRepo
      .createQueryBuilder('c')
      .leftJoin('c.createdBy', 'cb')
      .addSelect(USER_FIELDS('cb'))
      .where('c.productId = :productId', { productId })
      .orderBy('c.environment', 'ASC')
      .addOrderBy('c.label', 'ASC')
      .getMany();
    const last = await this.lastEvents(creds.map((c) => c.id));
    return creds.map((c) => this.toCredentialResponse(c, last.get(c.id) ?? null, canReveal));
  }

  /** Inserts a credential and its `created` event. Used by the vault and by demo accounts. */
  async insertCredential(
    manager: EntityManager,
    productId: string,
    actorId: string,
    data: {
      label: string;
      environment: CredentialEnvironment;
      loginUrl?: string | null;
      username: string;
      secret: string;
      shareable: boolean;
    },
    detail: string | null = null,
  ): Promise<ProductCredential> {
    const secretEncrypted = this.crypto.encrypt(data.secret);
    const repo = manager.getRepository(ProductCredential);
    const saved = await repo.save(
      repo.create({
        productId,
        label: data.label.trim(),
        environment: data.environment,
        loginUrl: this.emptyToNull(data.loginUrl),
        username: data.username.trim(),
        secretEncrypted,
        shareable: data.shareable,
        createdById: actorId,
        updatedById: actorId,
      }),
    );
    await this.logEvent(saved.id, actorId, CredentialEventAction.CREATED, detail, manager);
    return saved;
  }

  async createCredential(productId: string, dto: CreateCredentialDto, actor: VaultActor) {
    const product = await this.getProduct(productId);
    this.crypto.assertReady();
    const saved = await this.dataSource.transaction((m) =>
      this.insertCredential(m, product.id, actor.userId, dto),
    );
    return this.loadCredentialResponse(saved, await this.canReveal(actor, product));
  }

  async updateCredential(productId: string, credId: string, dto: UpdateCredentialDto, actor: VaultActor) {
    const product = await this.getProduct(productId);
    const cred = await this.getCredential(productId, credId);
    // Someone who can't see a password mustn't be able to overwrite it or make it shareable.
    await this.assertCanReveal(actor, product, EDIT_FORBIDDEN_MESSAGE);
    const changed: string[] = [];
    const patch: Partial<ProductCredential> = {};

    if (dto.label !== undefined && dto.label.trim() !== cred.label) {
      patch.label = dto.label.trim();
      changed.push('label');
    }
    if (dto.environment !== undefined && dto.environment !== cred.environment) {
      patch.environment = dto.environment;
      changed.push('environment');
    }
    if (dto.loginUrl !== undefined) {
      const url = this.emptyToNull(dto.loginUrl);
      if (url !== cred.loginUrl) {
        patch.loginUrl = url;
        changed.push('loginUrl');
      }
    }
    if (dto.username !== undefined && dto.username.trim() !== cred.username) {
      patch.username = dto.username.trim();
      changed.push('username');
    }
    if (dto.shareable !== undefined && dto.shareable !== cred.shareable) {
      patch.shareable = dto.shareable;
      changed.push('shareable');
    }
    if (dto.secret !== undefined) {
      patch.secretEncrypted = this.crypto.encrypt(dto.secret); // 503 when the key is missing
      changed.push('secret');
    }

    if (changed.length) {
      patch.updatedById = actor.userId;
      await this.dataSource.transaction(async (m) => {
        await m.getRepository(ProductCredential).update({ id: cred.id }, patch);
        await this.logEvent(
          cred.id,
          actor.userId,
          CredentialEventAction.EDITED,
          `Changed ${changed.map((f) => FIELD_LABELS[f]).join(', ')}`,
          m,
        );
      });
    }
    return this.loadCredentialResponse(cred, await this.canReveal(actor, product));
  }

  async deleteCredential(productId: string, credId: string, actor: VaultActor) {
    const product = await this.getProduct(productId);
    const cred = await this.getCredential(productId, credId);
    await this.assertCanReveal(actor, product, EDIT_FORBIDDEN_MESSAGE);
    // Events and shares cascade with the credential; demo accounts keep existing (credentialId -> NULL).
    await this.credentialsRepo.delete({ id: cred.id });
    return { success: true };
  }

  async reveal(productId: string, credId: string, purpose: 'reveal' | 'copy', actor: VaultActor) {
    const product = await this.getProduct(productId);
    const cred = await this.getCredential(productId, credId);
    await this.assertCanReveal(actor, product);
    this.crypto.assertReady();
    const secret = this.crypto.decrypt(await this.getSecretEncrypted(cred.id));
    await this.logEvent(
      cred.id,
      actor.userId,
      purpose === 'copy' ? CredentialEventAction.COPIED : CredentialEventAction.REVEALED,
    );
    return { secret };
  }

  async listEvents(productId: string, credId: string) {
    await this.getProduct(productId);
    const cred = await this.getCredential(productId, credId);
    const events = await this.eventsRepo
      .createQueryBuilder('e')
      .leftJoin('e.user', 'u')
      .addSelect(USER_FIELDS('u'))
      .where('e.credentialId = :id', { id: cred.id })
      .orderBy('e.createdAt', 'DESC')
      .take(20)
      .getMany();
    return events.map((e) => ({
      id: e.id,
      action: e.action,
      detail: e.detail,
      user: safeUser(e.user),
      at: e.createdAt,
    }));
  }

  // ---------------------------------------------------------------- shares

  private shareUrl(token: string): string {
    const base = publicAppUrl(this.configService.get<string>('FRONTEND_URL'));
    return `${base}/share/${token}`;
  }

  async createShare(productId: string, credId: string, dto: CreateShareDto, actor: VaultActor) {
    const product = await this.getProduct(productId);
    const cred = await this.getCredential(productId, credId);
    await this.assertCanReveal(actor, product);
    if (!cred.shareable) {
      throw new BadRequestException(
        "This login isn't marked as shareable. Edit it and turn on sharing first.",
      );
    }
    this.crypto.assertReady();

    const token = generateShareToken();
    const expiresAt = new Date(Date.now() + SHARE_DURATIONS_MS[dto.expiresIn]);
    const share = await this.dataSource.transaction(async (m) => {
      const repo = m.getRepository(ProductCredentialShare);
      const saved = await repo.save(
        repo.create({
          credentialId: cred.id,
          tokenHash: hashShareToken(token),
          expiresAt,
          oneTime: dto.oneTime,
          createdById: actor.userId,
        }),
      );
      await this.logEvent(
        cred.id,
        actor.userId,
        CredentialEventAction.SHARED,
        dto.oneTime ? `One-time link, expires in ${dto.expiresIn}` : `Link valid for ${dto.expiresIn}`,
        m,
      );
      return saved;
    });
    // The token is returned exactly once, here.
    return { id: share.id, url: this.shareUrl(token), expiresAt: share.expiresAt, oneTime: share.oneTime };
  }

  async listShares(productId: string, credId: string, actor: VaultActor) {
    const product = await this.getProduct(productId);
    const cred = await this.getCredential(productId, credId);
    await this.assertCanReveal(actor, product);
    const shares = await this.sharesRepo
      .createQueryBuilder('s')
      .leftJoin('s.createdBy', 'cb')
      .addSelect(USER_FIELDS('cb'))
      .where('s.credentialId = :id', { id: cred.id })
      .andWhere('s.revokedAt IS NULL')
      .andWhere('s.expiresAt > NOW()')
      .andWhere('(s.oneTime = false OR s.viewedAt IS NULL)')
      .orderBy('s.createdAt', 'DESC')
      .getMany();
    return shares.map((s) => ({
      id: s.id,
      expiresAt: s.expiresAt,
      oneTime: s.oneTime,
      viewedAt: s.viewedAt,
      createdBy: safeUser(s.createdBy),
      createdAt: s.createdAt,
    }));
  }

  async revokeShare(productId: string, credId: string, shareId: string, actor: VaultActor) {
    const product = await this.getProduct(productId);
    const cred = await this.getCredential(productId, credId);
    await this.assertCanReveal(actor, product);
    const share = await this.sharesRepo.findOne({ where: { id: shareId, credentialId: cred.id } });
    if (!share) throw new NotFoundException('Share link not found.');
    if (!share.revokedAt) {
      await this.dataSource.transaction(async (m) => {
        await m.getRepository(ProductCredentialShare).update({ id: share.id }, { revokedAt: new Date() });
        await this.logEvent(cred.id, actor.userId, CredentialEventAction.SHARE_REVOKED, null, m);
      });
    }
    return { success: true };
  }

  // ---------------------------------------------------------------- public share links

  private gone(): never {
    throw new GoneException({ statusCode: 410, message: SHARE_GONE_MESSAGE, error: 'Gone' });
  }

  private static readonly ACTIVE_SHARE_SQL = `
        s."revokedAt" IS NULL
    AND s."expiresAt" > NOW()
    AND (s."oneTime" = false OR s."viewedAt" IS NULL)
    AND c.shareable = true`;

  /** Peek at a link without consuming it. */
  async peekShare(token: string) {
    if (!isWellFormedShareToken(token)) this.gone();
    const rows = await this.dataSource.query(
      `SELECT s."expiresAt", s."oneTime", c.label, p.name AS "productName"
         FROM product_credential_shares s
         JOIN product_credentials c ON c.id = s."credentialId"
         JOIN products p ON p.id = c."productId"
        WHERE s."tokenHash" = $1 AND ${ProductVaultService.ACTIVE_SHARE_SQL}
        LIMIT 1`,
      [hashShareToken(token)],
    );
    if (!rows.length) this.gone();
    const r = rows[0];
    return { label: r.label, productName: r.productName, expiresAt: r.expiresAt, oneTime: r.oneTime };
  }

  /**
   * Opens a link. The conditional UPDATE marks it viewed atomically, so a one-time link can only
   * be opened once even with concurrent requests. Decryption runs in the same transaction; if it
   * fails the link is not consumed.
   */
  async openShare(token: string) {
    if (!isWellFormedShareToken(token)) this.gone();
    this.crypto.assertReady(); // 503 before consuming anything
    return this.dataSource.transaction(async (m) => {
      const consumed = rowsOf(
        await m.query(
          `WITH s AS (
             UPDATE product_credential_shares s
                SET "viewedAt" = NOW()
               FROM product_credentials c
              WHERE c.id = s."credentialId"
                AND s."tokenHash" = $1
                AND ${ProductVaultService.ACTIVE_SHARE_SQL}
          RETURNING s.id, s."credentialId"
           )
           SELECT * FROM s`,
          [hashShareToken(token)],
        ),
      );
      if (!consumed.length) this.gone();
      const credentialId: string = consumed[0].credentialId;
      const rows = await m.query(
        `SELECT c.label, c."loginUrl", c.username, c."secretEncrypted", p.name AS "productName"
           FROM product_credentials c
           JOIN products p ON p.id = c."productId"
          WHERE c.id = $1`,
        [credentialId],
      );
      if (!rows.length) this.gone();
      const r = rows[0];
      const secret = this.crypto.decrypt(r.secretEncrypted);
      await this.logEvent(credentialId, null, CredentialEventAction.SHARE_VIEWED, null, m);
      return {
        label: r.label,
        productName: r.productName,
        loginUrl: r.loginUrl,
        username: r.username,
        secret,
      };
    });
  }
}
