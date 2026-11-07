/**
 * Accounts for people outside the company: one-time links, signing in with a name and 6-digit code, lockouts and
 * resets. What a client can read lives in DrivelyService; the rules are in docs/drively.md.
 */
import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectDataSource } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { randomBytes, randomInt, timingSafeEqual } from 'crypto';
import { DataSource } from 'typeorm';
import { EmailService } from '../email/email.service';
import { WorkspaceActor } from '../workspace/workspace-access';
import {
  CLIENT_LINK_DAYS,
  CLIENT_SESSION,
  CLIENT_TOKEN_TYPE,
  RESET_CODE_MINUTES,
  RESET_MAX_ATTEMPTS,
  RESET_RESEND_SECONDS,
  assertUsableCode,
  cleanClientEmail,
  cleanClientName,
  clientTokenSecret,
  hashLinkToken,
  hashResetCode,
  lockMinutesAfter,
} from './drive-client.logic';
import { ClaimClientLinkDto, ClientResetCodeDto, ClientSignInDto } from './dto/drive-client.dto';
import { DrivelyService } from './drively.service';

export interface DriveClientSession {
  id: string;
  name: string;
  email: string | null;
  tokenVersion: number;
}

interface ClientRow extends DriveClientSession {
  codeHash: string;
  failedAttempts: number;
  lockedUntil: Date | null;
  resetCodeHash: string | null;
  resetExpires: Date | null;
  resetSentAt: Date | null;
  resetAttempts: number;
}

interface LinkRow {
  id: string;
  itemId: string;
  clientId: string | null;
  itemName: string;
  itemKind: string;
  createdById: string | null;
}

const LINK_GONE = 'This link has already been used or has expired. Ask the person who sent it for a new one.';
const WRONG_CODE = "That name and code don't match.";
const WRONG_RESET = 'That reset code is wrong or has expired. Check it, or ask for a new one.';
const SALT_ROUNDS = 10;
const MAX_SAME_NAME = 25;
/** Compared against when nobody has that name, so a wrong name takes as long as a wrong code. */
const DUMMY_HASH = bcrypt.hashSync('not-a-real-code', SALT_ROUNDS);
const SESSION_COLUMNS = 'id, name, email, "tokenVersion"';

@Injectable()
export class DriveClientsService {
  private readonly logger = new Logger(DriveClientsService.name);

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly email: EmailService,
    private readonly drive: DrivelyService,
  ) {}

  /* ---------------------------- sessions ---------------------------- */

  private secret() {
    return clientTokenSecret(this.config.get<string>('JWT_SECRET', 'your-secret-key-change-in-production'));
  }

  private session(client: DriveClientSession) {
    return {
      token: this.jwt.sign({ sub: client.id, typ: CLIENT_TOKEN_TYPE, tv: client.tokenVersion }, { secret: this.secret(), expiresIn: CLIENT_SESSION }),
      client: { id: client.id, name: client.name, hasEmail: !!client.email },
    };
  }

  /** Checks a token's signature only. Null if it isn't a client token. Synchronous for the socket handshake. */
  verifyToken(token: unknown): { clientId: string; tokenVersion: number } | null {
    if (typeof token !== 'string' || !token) return null;
    try {
      const payload = this.jwt.verify(token, { secret: this.secret(), algorithms: ['HS256'] });
      if (payload?.typ !== CLIENT_TOKEN_TYPE || typeof payload.sub !== 'string') return null;
      return { clientId: payload.sub, tokenVersion: Number(payload.tv) };
    } catch {
      return null;
    }
  }

  /** Null once the code has changed or the account is gone. */
  async activeSession(clientId: string, tokenVersion: number): Promise<DriveClientSession | null> {
    const [row] = await this.db.query(`SELECT ${SESSION_COLUMNS} FROM drive_clients WHERE id = $1 AND "tokenVersion" = $2`, [clientId, tokenVersion]);
    return row ?? null;
  }

  private markSeen(clientId: string) {
    return this.db.query(`UPDATE drive_clients SET "lastSeenAt" = NOW() WHERE id = $1`, [clientId]);
  }

  /* ---------------------------- signing in ---------------------------- */

  private lockedError(until: Date) {
    const minutes = Math.max(1, Math.ceil((new Date(until).getTime() - Date.now()) / 60000));
    return new HttpException(
      `Too many wrong tries. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}, or use "Forgot your code?".`,
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private isLocked(client: ClientRow) {
    return !!client.lockedUntil && new Date(client.lockedUntil).getTime() > Date.now();
  }

  private async recordFailure(clientId: string) {
    const [[row]] = await this.db.query(`UPDATE drive_clients SET "failedAttempts" = "failedAttempts" + 1 WHERE id = $1 RETURNING "failedAttempts"`, [clientId]);
    const minutes = lockMinutesAfter(row.failedAttempts);
    if (minutes) {
      await this.db.query(`UPDATE drive_clients SET "lockedUntil" = NOW() + make_interval(mins => $2) WHERE id = $1`, [clientId, minutes]);
    }
  }

  private async recordSuccess(clientId: string) {
    await this.db.query(`UPDATE drive_clients SET "failedAttempts" = 0, "lockedUntil" = NULL, "lastSeenAt" = NOW() WHERE id = $1`, [clientId]);
  }

  private sameName(name: string): Promise<ClientRow[]> {
    return this.db.query(`SELECT * FROM drive_clients WHERE lower(name) = lower($1) ORDER BY "createdAt" LIMIT ${MAX_SAME_NAME}`, [name]);
  }

  /** Names aren't unique, so the code picks out who it is. A wrong try counts against everyone with that name. */
  async signIn(dto: ClientSignInDto) {
    const candidates = await this.sameName(cleanClientName(dto.name));
    const open = candidates.filter((c) => !this.isLocked(c));
    if (candidates.length === 0) await bcrypt.compare(dto.code, DUMMY_HASH);
    for (const client of open) {
      if (await bcrypt.compare(dto.code, client.codeHash)) {
        await this.recordSuccess(client.id);
        return this.session(client);
      }
    }
    await Promise.all(open.map((c) => this.recordFailure(c.id)));
    if (candidates.length > 0 && open.length === 0) {
      const soonest = candidates.reduce((a, b) => (new Date(a.lockedUntil!) < new Date(b.lockedUntil!) ? a : b));
      throw this.lockedError(soonest.lockedUntil!);
    }
    throw new UnauthorizedException(WRONG_CODE);
  }

  /* ---------------------------- one-time links ---------------------------- */

  private async usableLink(token: string): Promise<LinkRow> {
    const [link] = await this.db.query(
      `SELECT l.id, l."itemId", l."clientId", l."createdById", i.name AS "itemName", i.kind AS "itemKind"
       FROM drive_client_links l JOIN drive_items i ON i.id = l."itemId"
       WHERE l."tokenHash" = $1 AND l."usedAt" IS NULL AND l."expiresAt" > NOW() AND i."trashedAt" IS NULL`,
      [hashLinkToken(token)],
    );
    if (!link) throw new NotFoundException(LINK_GONE);
    return link;
  }

  /** What the page needs before anyone has signed in. Holding the link is what allows this. */
  async describeLink(token: string) {
    const link = await this.usableLink(token);
    const [[sender], [client]] = await Promise.all([
      this.db.query(`SELECT name FROM users WHERE id = $1`, [link.createdById]),
      link.clientId ? this.db.query(`SELECT name FROM drive_clients WHERE id = $1`, [link.clientId]) : Promise.resolve([undefined]),
    ]);
    return {
      type: link.clientId ? ('new_code' as const) : ('invite' as const),
      itemName: link.itemName,
      itemKind: link.itemKind,
      sharedBy: sender?.name ?? null,
      clientName: client?.name ?? null,
    };
  }

  async claimLink(token: string, dto: ClaimClientLinkDto) {
    const link = await this.usableLink(token);
    const result = link.clientId ? await this.claimNewCode(link, dto.code) : await this.claimInvite(link, dto);
    return { ...result, itemId: link.itemId, itemKind: link.itemKind };
  }

  /** Marks the link used inside the caller's transaction. Losing the race means someone else already used it. */
  private async spendLink(m: { query: DataSource['query'] }, linkId: string) {
    const [rows] = await m.query(`UPDATE drive_client_links SET "usedAt" = NOW() WHERE id = $1 AND "usedAt" IS NULL RETURNING id`, [linkId]);
    if (!rows?.length) throw new NotFoundException(LINK_GONE);
  }

  private async claimNewCode(link: LinkRow, code: string) {
    assertUsableCode(code);
    const codeHash = await bcrypt.hash(code, SALT_ROUNDS);
    const client = await this.db.transaction(async (m) => {
      await this.spendLink(m, link.id);
      const [rows] = await m.query(
        `UPDATE drive_clients SET "codeHash" = $2, "tokenVersion" = "tokenVersion" + 1, "failedAttempts" = 0, "lockedUntil" = NULL,
           "resetCodeHash" = NULL, "resetExpires" = NULL, "resetAttempts" = 0, "lastSeenAt" = NOW()
         WHERE id = $1 RETURNING ${SESSION_COLUMNS}`,
        [link.clientId, codeHash],
      );
      return rows[0] as DriveClientSession;
    });
    this.drive.onAccessChanged();
    return this.session(client);
  }

  /**
   * Someone new sets up an account; someone returning enters the name and code they already use and this file joins
   * their account. A wrong guess against a name creates a new account and spends the link, so a link gives one try.
   * An email already in use can't do that, so a wrong code there counts toward the lockout instead.
   */
  private async claimInvite(link: LinkRow, dto: ClaimClientLinkDto) {
    const name = cleanClientName(dto.name);
    if (name.length < 2) throw new BadRequestException('Please enter your name.');
    const email = cleanClientEmail(dto.email);

    let existing: ClientRow | null = null;
    if (email) {
      const [owner]: ClientRow[] = await this.db.query(`SELECT * FROM drive_clients WHERE lower(email) = $1`, [email]);
      if (owner) {
        if (this.isLocked(owner)) throw this.lockedError(owner.lockedUntil!);
        if (!(await bcrypt.compare(dto.code, owner.codeHash))) {
          await this.recordFailure(owner.id);
          throw new ConflictException('That email already has an account. Enter its code, or use "Forgot your code?" on the sign-in page.');
        }
        existing = owner;
      }
    }
    if (!existing) {
      for (const client of (await this.sameName(name)).filter((c) => !this.isLocked(c))) {
        if (await bcrypt.compare(dto.code, client.codeHash)) {
          existing = client;
          break;
        }
      }
    }
    if (!existing) assertUsableCode(dto.code);
    const codeHash = existing ? null : await bcrypt.hash(dto.code, SALT_ROUNDS);

    let client: DriveClientSession;
    try {
      client = await this.db.transaction(async (m) => {
        await this.spendLink(m, link.id);
        let account: DriveClientSession | null = existing;
        if (existing) {
          await m.query(`UPDATE drive_clients SET email = COALESCE(email, $2), "failedAttempts" = 0, "lockedUntil" = NULL, "lastSeenAt" = NOW() WHERE id = $1`, [existing.id, email]);
        } else {
          const [row] = await m.query(
            `INSERT INTO drive_clients (name, email, "codeHash", "createdById", "lastSeenAt") VALUES ($1, $2, $3, $4, NOW()) RETURNING ${SESSION_COLUMNS}`,
            [name, email, codeHash, link.createdById],
          );
          account = row;
        }
        await m.query(
          `INSERT INTO drive_client_shares ("itemId", "clientId", "createdById") VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [link.itemId, account!.id, link.createdById],
        );
        return account!;
      });
    } catch (error: any) {
      if (error?.code === '23505') throw new ConflictException('That email already has an account. Enter its code, or use "Forgot your code?" on the sign-in page.');
      throw error;
    }
    return this.session(client);
  }

  /* ---------------------------- forgot code ---------------------------- */

  /** Same answer whether or not the email is known, and the email goes out in the background so timing matches too. */
  async forgotCode(rawEmail: string) {
    const message = 'If that email is on an account, we sent it a reset code.';
    const email = cleanClientEmail(rawEmail);
    const [client]: ClientRow[] = await this.db.query(`SELECT * FROM drive_clients WHERE lower(email) = $1`, [email]);
    if (!client?.email) return { message };
    if (client.resetSentAt && Date.now() - new Date(client.resetSentAt).getTime() < RESET_RESEND_SECONDS * 1000) return { message };

    const code = randomInt(100000, 1000000).toString();
    await this.db.query(
      `UPDATE drive_clients SET "resetCodeHash" = $2, "resetExpires" = NOW() + make_interval(mins => $3), "resetSentAt" = NOW(), "resetAttempts" = 0 WHERE id = $1`,
      [client.id, hashResetCode(this.secret(), client.id, code), RESET_CODE_MINUTES],
    );
    this.email
      .sendClientCodeReset(client.email, code, RESET_CODE_MINUTES, client.name)
      .catch((error) => this.logger.error(`Client reset email failed: ${error?.message || error}`));
    return { message };
  }

  async resetCode(dto: ClientResetCodeDto) {
    const invalid = new BadRequestException(WRONG_RESET);
    const [client]: ClientRow[] = await this.db.query(`SELECT * FROM drive_clients WHERE lower(email) = $1`, [cleanClientEmail(dto.email)]);
    if (!client?.resetCodeHash || !client.resetExpires || new Date(client.resetExpires).getTime() < Date.now()) throw invalid;

    const expected = Buffer.from(client.resetCodeHash);
    const given = Buffer.from(hashResetCode(this.secret(), client.id, dto.resetCode));
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
      const [[row]] = await this.db.query(`UPDATE drive_clients SET "resetAttempts" = "resetAttempts" + 1 WHERE id = $1 RETURNING "resetAttempts"`, [client.id]);
      if (row.resetAttempts >= RESET_MAX_ATTEMPTS) {
        await this.db.query(`UPDATE drive_clients SET "resetCodeHash" = NULL, "resetExpires" = NULL WHERE id = $1`, [client.id]);
        throw new BadRequestException('Too many wrong tries, so this reset code was cancelled. Please ask for a new one.');
      }
      throw invalid;
    }

    assertUsableCode(dto.code);
    const codeHash = await bcrypt.hash(dto.code, SALT_ROUNDS);
    const [rows] = await this.db.query(
      `UPDATE drive_clients SET "codeHash" = $2, "tokenVersion" = "tokenVersion" + 1, "failedAttempts" = 0, "lockedUntil" = NULL,
         "resetCodeHash" = NULL, "resetExpires" = NULL, "resetAttempts" = 0, "lastSeenAt" = NOW()
       WHERE id = $1 RETURNING ${SESSION_COLUMNS}`,
      [client.id, codeHash],
    );
    this.drive.onAccessChanged();
    return this.session(rows[0]);
  }

  /* ---------------------------- for a file's owner ---------------------------- */

  private async newLink(itemId: string, clientId: string | null, actor: WorkspaceActor) {
    const token = randomBytes(32).toString('base64url');
    const [row] = await this.db.query(
      `INSERT INTO drive_client_links ("tokenHash", "itemId", "clientId", "createdById", "expiresAt")
       VALUES ($1, $2, $3, $4, NOW() + make_interval(days => $5)) RETURNING id, "expiresAt"`,
      [hashLinkToken(token), itemId, clientId, actor.userId, CLIENT_LINK_DAYS],
    );
    // The token is only ever available here; the database keeps just its hash.
    return { id: row.id, token, expiresAt: row.expiresAt };
  }

  async createInvite(itemId: string, actor: WorkspaceActor) {
    await this.drive.assertOwner(itemId, actor, 'create a client link');
    return this.newLink(itemId, null, actor);
  }

  /** For a client with no email who forgot their code. Their current code keeps working until this link is used. */
  async createNewCodeLink(itemId: string, clientId: string, actor: WorkspaceActor) {
    await this.drive.assertOwner(itemId, actor, 'reset a client code');
    await this.requireClientOnItem(itemId, clientId);
    return this.newLink(itemId, clientId, actor);
  }

  private async requireClientOnItem(itemId: string, clientId: string) {
    const [share] = await this.db.query(`SELECT 1 FROM drive_client_shares WHERE "itemId" = $1 AND "clientId" = $2`, [itemId, clientId]);
    if (!share) throw new NotFoundException("That client doesn't have access to this file.");
  }

  async listAccess(itemId: string, actor: WorkspaceActor) {
    await this.drive.assertOwner(itemId, actor, 'see client access');
    const [clients, links] = await Promise.all([
      this.db.query(
        `SELECT c.id, c.name, c.email, c."lastSeenAt", s.permission, s."createdAt" AS "sharedAt"
         FROM drive_client_shares s JOIN drive_clients c ON c.id = s."clientId"
         WHERE s."itemId" = $1 ORDER BY lower(c.name)`,
        [itemId],
      ),
      this.db.query(
        `SELECT l.id, l."expiresAt", l."createdAt", c.name AS "clientName"
         FROM drive_client_links l LEFT JOIN drive_clients c ON c.id = l."clientId"
         WHERE l."itemId" = $1 AND l."usedAt" IS NULL AND l."expiresAt" > NOW() ORDER BY l."createdAt" DESC`,
        [itemId],
      ),
    ]);
    return { clients, links };
  }

  async cancelLink(itemId: string, linkId: string, actor: WorkspaceActor) {
    await this.drive.assertOwner(itemId, actor, 'cancel a client link');
    await this.db.query(`DELETE FROM drive_client_links WHERE id = $1 AND "itemId" = $2 AND "usedAt" IS NULL`, [linkId, itemId]);
    return { cancelled: true };
  }

  async removeAccess(itemId: string, clientId: string, actor: WorkspaceActor) {
    await this.drive.assertOwner(itemId, actor, 'remove client access');
    await this.db.query(`DELETE FROM drive_client_shares WHERE "itemId" = $1 AND "clientId" = $2`, [itemId, clientId]);
    await this.db.query(`DELETE FROM drive_client_links WHERE "itemId" = $1 AND "clientId" = $2 AND "usedAt" IS NULL`, [itemId, clientId]);
    this.drive.onAccessChanged();
    return { removed: true };
  }

  /** Clients the team already has, so sharing another file with one needs no new link. */
  listClients() {
    return this.db.query(`SELECT id, name, email FROM drive_clients ORDER BY lower(name) LIMIT 500`);
  }

  async shareWithClient(itemId: string, clientId: string, actor: WorkspaceActor) {
    await this.drive.assertOwner(itemId, actor, 'share this with a client');
    const [client] = await this.db.query(`SELECT 1 FROM drive_clients WHERE id = $1`, [clientId]);
    if (!client) throw new NotFoundException('Client not found.');
    await this.db.query(
      `INSERT INTO drive_client_shares ("itemId", "clientId", "createdById") VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [itemId, clientId, actor.userId],
    );
    return { shared: true };
  }
}
