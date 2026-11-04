import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Not, Repository } from 'typeorm';
import { Product } from './entities/product.entity';
import { ProductMember } from './entities/product-member.entity';
import { ProductLink, ProductLinkKind } from './entities/product-link.entity';
import { ProductDomain } from './entities/product-domain.entity';
import { NotificationType } from '../notifications/entities/notification.entity';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';
import { CreateMemberDto, UpdateMemberDto } from './dto/member.dto';
import { CreateLinkDto, UpdateLinkDto } from './dto/link.dto';
import { CreateDomainDto, UpdateDomainDto } from './dto/domain.dto';
import { HubUsersService, SafeUser } from './hub-users.service';
import { computeAttention, generateCode, uniqueSlug } from './products.logic';

/** Tables owned by other Hub modules; they may not exist yet on a given database. */
type OptionalTable = 'product_tickets' | 'product_sops' | 'product_credentials' | 'product_demo_accounts';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);
  private readonly knownTables = new Set<string>();

  constructor(
    @InjectRepository(Product) private readonly productsRepository: Repository<Product>,
    @InjectRepository(ProductMember) private readonly membersRepository: Repository<ProductMember>,
    @InjectRepository(ProductLink) private readonly linksRepository: Repository<ProductLink>,
    @InjectRepository(ProductDomain) private readonly domainsRepository: Repository<ProductDomain>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly hubUsers: HubUsersService,
  ) {}

  // ---------------------------------------------------------------- helpers

  async findOrFail(id: string): Promise<Product> {
    const product = await this.productsRepository.findOne({ where: { id } });
    if (!product) throw new NotFoundException('Product not found.');
    return product;
  }

  private async tableExists(table: OptionalTable): Promise<boolean> {
    if (this.knownTables.has(table)) return true;
    try {
      const rows = await this.dataSource.query(`SELECT to_regclass($1) IS NOT NULL AS ok`, [`public.${table}`]);
      if (rows?.[0]?.ok) {
        this.knownTables.add(table);
        return true;
      }
    } catch {
      /* treat as missing */
    }
    return false;
  }

  /** Raw query against another module's table; returns [] if the table is missing or the query fails. */
  private async optionalQuery<T = any>(table: OptionalTable, sql: string, params: unknown[]): Promise<T[]> {
    if (!(await this.tableExists(table))) return [];
    try {
      return await this.dataSource.query(sql, params);
    } catch (error) {
      this.logger.warn(`Query on ${table} failed, counting as 0: ${error?.message || error}`);
      return [];
    }
  }

  private async optionalCount(table: OptionalTable, productId: string, extraWhere = ''): Promise<number> {
    const rows = await this.optionalQuery<{ n: number }>(
      table,
      `SELECT COUNT(*)::int AS n FROM ${table} WHERE "productId" = $1 ${extraWhere}`,
      [productId],
    );
    return rows[0]?.n ?? 0;
  }

  private async ticketCounts(productIds: string[]): Promise<Map<string, { open: number; high: number }>> {
    const map = new Map<string, { open: number; high: number }>();
    if (productIds.length === 0) return map;
    const rows = await this.optionalQuery<{ productId: string; open: number; high: number }>(
      'product_tickets',
      `SELECT "productId",
              COUNT(*) FILTER (WHERE status <> 'done')::int AS open,
              COUNT(*) FILTER (WHERE status <> 'done' AND priority = 'high')::int AS high
         FROM product_tickets
        WHERE "productId" = ANY($1::uuid[])
        GROUP BY "productId"`,
      [productIds],
    );
    for (const r of rows) map.set(r.productId, { open: r.open, high: r.high });
    return map;
  }

  private async lastUpdates(productIds: string[]): Promise<Map<string, { at: Date; authorId: string | null }>> {
    const map = new Map<string, { at: Date; authorId: string | null }>();
    if (productIds.length === 0) return map;
    const rows: { productId: string; authorId: string | null; createdAt: Date }[] = await this.dataSource.query(
      `SELECT DISTINCT ON ("productId") "productId", "authorId", "createdAt"
         FROM product_updates
        WHERE "productId" = ANY($1::uuid[])
        ORDER BY "productId", "createdAt" DESC`,
      [productIds],
    );
    for (const r of rows) map.set(r.productId, { at: r.createdAt, authorId: r.authorId });
    return map;
  }

  private async assertUserExists(userId: string, message: string): Promise<SafeUser> {
    const user = await this.hubUsers.findOne(userId);
    if (!user) throw new BadRequestException(message);
    return user;
  }

  private async assertNameFree(name: string, exceptId?: string) {
    const qb = this.productsRepository
      .createQueryBuilder('p')
      .where('LOWER(p.name) = LOWER(:name)', { name });
    if (exceptId) qb.andWhere('p.id <> :exceptId', { exceptId });
    if (await qb.getExists()) throw new BadRequestException(`A product named ${name} already exists.`);
  }

  // ---------------------------------------------------------------- products

  async list(archived: boolean) {
    const products = await this.productsRepository.find({
      where: { archivedAt: archived ? Not(IsNull()) : IsNull() },
      order: { name: 'ASC' },
    });
    const ids = products.map((p) => p.id);
    if (ids.length === 0) return [];

    const [members, domains, tickets, updates] = await Promise.all([
      this.membersRepository.find({
        select: ['productId', 'userId', 'area', 'createdAt'],
        where: { productId: In(ids) },
        order: { createdAt: 'ASC' },
      }),
      this.domainsRepository.find({ where: { productId: In(ids) } }),
      this.ticketCounts(ids),
      this.lastUpdates(ids),
    ]);
    const users = await this.hubUsers.load([
      ...products.map((p) => p.ownerId),
      ...[...updates.values()].map((u) => u.authorId),
    ]);

    const now = new Date();
    return products.map((p) => {
      const t = tickets.get(p.id) ?? { open: 0, high: 0 };
      const last = updates.get(p.id) ?? null;
      return {
        ...p,
        owner: users.get(p.ownerId) ?? null,
        members: members.filter((m) => m.productId === p.id).map((m) => ({ userId: m.userId, area: m.area })),
        openTickets: t.open,
        highPriorityOpen: t.high,
        lastUpdate: last ? { at: last.at, author: users.get(last.authorId) ?? null } : null,
        attention: computeAttention(
          {
            domains: domains.filter((d) => d.productId === p.id),
            highPriorityOpen: t.high,
            lastUpdateAt: last?.at ?? null,
            productCreatedAt: p.createdAt,
          },
          now,
        ),
      };
    });
  }

  async getBySlug(slug: string) {
    const product = await this.productsRepository.findOne({ where: { slug: (slug || '').toLowerCase() } });
    if (!product) throw new NotFoundException('Product not found.');
    return this.detail(product);
  }

  private async detail(product: Product) {
    const id = product.id;
    const [members, links, domains, tickets, last, updatesCount, filesCount, sops, credentials, demoAccounts] =
      await Promise.all([
        this.membersRepository.find({ where: { productId: id }, order: { createdAt: 'ASC' } }),
        this.linksRepository.find({ where: { productId: id }, order: { sortOrder: 'ASC', createdAt: 'ASC' } }),
        this.domainsRepository.find({ where: { productId: id }, order: { domain: 'ASC' } }),
        this.ticketCounts([id]),
        this.lastUpdates([id]),
        this.dataSource.query(`SELECT COUNT(*)::int AS n FROM product_updates WHERE "productId" = $1`, [id]),
        this.dataSource.query(`SELECT COUNT(*)::int AS n FROM product_files WHERE "productId" = $1`, [id]),
        this.optionalCount('product_sops', id),
        this.optionalCount('product_credentials', id),
        this.optionalCount('product_demo_accounts', id),
      ]);
    const lastUpdate = last.get(id) ?? null;
    const users = await this.hubUsers.load([product.ownerId, lastUpdate?.authorId, ...members.map((m) => m.userId)]);
    const t = tickets.get(id) ?? { open: 0, high: 0 };

    return {
      ...product,
      owner: users.get(product.ownerId) ?? null,
      members: members.map((m) => ({ ...m, user: users.get(m.userId) ?? null })),
      links,
      domains,
      lastUpdate: lastUpdate ? { at: lastUpdate.at, author: users.get(lastUpdate.authorId) ?? null } : null,
      attention: computeAttention({
        domains,
        highPriorityOpen: t.high,
        lastUpdateAt: lastUpdate?.at ?? null,
        productCreatedAt: product.createdAt,
      }),
      counts: {
        updates: updatesCount[0]?.n ?? 0,
        openTickets: t.open,
        sops,
        files: filesCount[0]?.n ?? 0,
        credentials,
        demoAccounts,
        members: members.length,
      },
    };
  }

  async create(dto: CreateProductDto, actorId: string) {
    await this.assertNameFree(dto.name);
    await this.assertUserExists(dto.ownerId, "The owner you picked doesn't exist.");

    const existing = await this.productsRepository.find({ select: ['id', 'slug', 'code', 'name'] });
    let code: string;
    if (dto.code) {
      const clash = existing.find((p) => p.code.toUpperCase() === dto.code);
      if (clash) throw new BadRequestException(`The code ${dto.code} is already used by ${clash.name}.`);
      code = dto.code;
    } else {
      code = generateCode(dto.name, existing.map((p) => p.code));
    }
    const slug = uniqueSlug(dto.name, existing.map((p) => p.slug));

    let productId: string;
    try {
      productId = await this.dataSource.transaction(async (manager) => {
        const product = await manager.save(
          manager.create(Product, {
            slug,
            code,
            name: dto.name,
            description: dto.description?.trim() || null,
            status: dto.status,
            version: dto.version || null,
            ownerId: dto.ownerId,
            createdById: actorId,
          }),
        );
        await manager.save(manager.create(ProductMember, { productId: product.id, userId: dto.ownerId, area: 'Owner' }));
        if (dto.productionUrl) {
          await manager.save(
            manager.create(ProductLink, {
              productId: product.id,
              kind: ProductLinkKind.ENVIRONMENT,
              label: 'Production',
              url: dto.productionUrl,
              sortOrder: 0,
            }),
          );
        }
        return product.id;
      });
    } catch (error) {
      // Two people creating the same product at once: the unique slug/code index catches it.
      if (error?.code === '23505') {
        throw new BadRequestException(`A product named ${dto.name} or with code ${code} was just created. Try again.`);
      }
      throw error;
    }
    return this.detail(await this.findOrFail(productId));
  }

  async update(id: string, dto: UpdateProductDto) {
    const product = await this.findOrFail(id);
    if (dto.name !== undefined && dto.name.toLowerCase() !== product.name.toLowerCase()) {
      await this.assertNameFree(dto.name, id);
    }
    if (dto.ownerId !== undefined && dto.ownerId !== product.ownerId) {
      await this.assertUserExists(dto.ownerId, "The owner you picked doesn't exist.");
    }
    // The slug stays the same on rename so existing links and notifications keep working.
    const patch: Partial<Product> = {};
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.description !== undefined) patch.description = dto.description?.trim() || null;
    if (dto.status !== undefined) patch.status = dto.status;
    if (dto.version !== undefined) patch.version = dto.version || null;
    if (dto.ownerId !== undefined) patch.ownerId = dto.ownerId;
    if (Object.keys(patch).length > 0) await this.productsRepository.update(id, patch);
    return this.detail(await this.findOrFail(id));
  }

  async setArchived(id: string, archived: boolean) {
    const product = await this.findOrFail(id);
    if (archived ? !product.archivedAt : !!product.archivedAt) {
      await this.productsRepository.update(id, { archivedAt: archived ? new Date() : null });
    }
    return this.detail(await this.findOrFail(id));
  }

  // ---------------------------------------------------------------- members

  async addMember(productId: string, dto: CreateMemberDto, actorId: string) {
    const product = await this.findOrFail(productId);
    const user = await this.assertUserExists(dto.userId, "The person you picked doesn't exist.");
    if (await this.membersRepository.exists({ where: { productId, userId: dto.userId } })) {
      throw new BadRequestException(`${user.name} is already on the ${product.name} team.`);
    }
    let member: ProductMember;
    try {
      member = await this.membersRepository.save(
        this.membersRepository.create({ productId, userId: dto.userId, area: dto.area, askAbout: dto.askAbout?.trim() || null }),
      );
    } catch (error) {
      if (error?.code === '23505') throw new BadRequestException(`${user.name} is already on the ${product.name} team.`);
      throw error;
    }

    if (dto.userId !== actorId) {
      const actor = await this.hubUsers.findOne(actorId);
      await this.hubUsers.notify({
        type: NotificationType.PRODUCT_ASSIGNED,
        title: `${actor?.name || 'Someone'} added you to the ${product.name} team`,
        message: `You're on ${product.name} for: ${dto.area}.`,
        userId: dto.userId,
        productId,
        link: `/products/${product.slug}/team`,
      });
    }
    return { ...member, user };
  }

  private async findMemberOrFail(productId: string, memberId: string) {
    const member = await this.membersRepository.findOne({ where: { id: memberId, productId } });
    if (!member) throw new NotFoundException('Team member not found.');
    return member;
  }

  async updateMember(productId: string, memberId: string, dto: UpdateMemberDto) {
    const member = await this.findMemberOrFail(productId, memberId);
    if (dto.area !== undefined) member.area = dto.area;
    if (dto.askAbout !== undefined) member.askAbout = dto.askAbout?.trim() || null;
    const saved = await this.membersRepository.save(member);
    return { ...saved, user: await this.hubUsers.findOne(saved.userId) };
  }

  async removeMember(productId: string, memberId: string) {
    const member = await this.findMemberOrFail(productId, memberId);
    await this.membersRepository.delete(member.id);
    return { success: true };
  }

  // ---------------------------------------------------------------- links

  async addLink(productId: string, dto: CreateLinkDto) {
    await this.findOrFail(productId);
    const max = await this.linksRepository
      .createQueryBuilder('l')
      .select('COALESCE(MAX(l.sortOrder), -1)', 'max')
      .where('l.productId = :productId', { productId })
      .getRawOne<{ max: number }>();
    return this.linksRepository.save(
      this.linksRepository.create({ productId, kind: dto.kind, label: dto.label, url: dto.url, sortOrder: Number(max?.max ?? -1) + 1 }),
    );
  }

  private async findLinkOrFail(productId: string, linkId: string) {
    const link = await this.linksRepository.findOne({ where: { id: linkId, productId } });
    if (!link) throw new NotFoundException('Link not found.');
    return link;
  }

  async updateLink(productId: string, linkId: string, dto: UpdateLinkDto) {
    const link = await this.findLinkOrFail(productId, linkId);
    Object.assign(link, Object.fromEntries(Object.entries(dto).filter(([, v]) => v !== undefined)));
    return this.linksRepository.save(link);
  }

  async removeLink(productId: string, linkId: string) {
    const link = await this.findLinkOrFail(productId, linkId);
    await this.linksRepository.delete(link.id);
    return { success: true };
  }

  // ---------------------------------------------------------------- domains

  async addDomain(productId: string, dto: CreateDomainDto) {
    await this.findOrFail(productId);
    return this.domainsRepository.save(
      this.domainsRepository.create({
        productId,
        domain: dto.domain,
        registrar: dto.registrar || null,
        dnsProvider: dto.dnsProvider || null,
        renewsOn: dto.renewsOn,
        sslExpiresOn: dto.sslExpiresOn,
      }),
    );
  }

  private async findDomainOrFail(productId: string, domainId: string) {
    const domain = await this.domainsRepository.findOne({ where: { id: domainId, productId } });
    if (!domain) throw new NotFoundException('Domain not found.');
    return domain;
  }

  async updateDomain(productId: string, domainId: string, dto: UpdateDomainDto) {
    const domain = await this.findDomainOrFail(productId, domainId);
    if (dto.domain !== undefined) domain.domain = dto.domain;
    if (dto.registrar !== undefined) domain.registrar = dto.registrar || null;
    if (dto.dnsProvider !== undefined) domain.dnsProvider = dto.dnsProvider || null;
    if (dto.renewsOn !== undefined) domain.renewsOn = dto.renewsOn;
    if (dto.sslExpiresOn !== undefined) domain.sslExpiresOn = dto.sslExpiresOn;
    return this.domainsRepository.save(domain);
  }

  async removeDomain(productId: string, domainId: string) {
    const domain = await this.findDomainOrFail(productId, domainId);
    await this.domainsRepository.delete(domain.id);
    return { success: true };
  }
}
