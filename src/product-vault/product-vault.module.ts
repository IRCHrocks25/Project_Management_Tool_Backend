import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from '../products/entities/product.entity';
import { User } from '../users/entities/user.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProductCredential } from './entities/product-credential.entity';
import { ProductCredentialEvent } from './entities/product-credential-event.entity';
import { ProductCredentialShare } from './entities/product-credential-share.entity';
import { ProductDemoAccount } from './entities/product-demo-account.entity';
import { VaultCryptoService } from './vault-crypto.service';
import { ProductVaultService } from './product-vault.service';
import { DemoAccountsService } from './demo-accounts.service';
import {
  ProductCredentialsController,
  ProductDemoAccountsController,
  VaultSharesController,
} from './product-vault.controller';

// Katalyst Hub: credential vault, client share links and demo accounts.
@Module({
  imports: [
    ConfigModule,
    NotificationsModule,
    TypeOrmModule.forFeature([
      Product,
      User,
      ProductCredential,
      ProductCredentialEvent,
      ProductCredentialShare,
      ProductDemoAccount,
    ]),
  ],
  controllers: [ProductCredentialsController, ProductDemoAccountsController, VaultSharesController],
  providers: [VaultCryptoService, ProductVaultService, DemoAccountsService],
  exports: [VaultCryptoService, ProductVaultService],
})
export class ProductVaultModule {}
