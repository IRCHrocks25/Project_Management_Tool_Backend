import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from '../products/entities/product.entity';
import { User } from '../users/entities/user.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProductsModule } from '../products/products.module';
import { ProductCredential } from './entities/product-credential.entity';
import { ProductCredentialEvent } from './entities/product-credential-event.entity';
import { ProductCredentialShare } from './entities/product-credential-share.entity';
import { ProductCredentialVersion } from './entities/product-credential-version.entity';
import { ProductDemoAccount } from './entities/product-demo-account.entity';
import { VaultCryptoService } from './vault-crypto.service';
import { ProductVaultService } from './product-vault.service';
import { DemoAccountsService } from './demo-accounts.service';
import { CompanyVaultService } from './company-vault.service';
import { CompanyVaultController } from './company-vault.controller';
import {
  ProductCredentialsController,
  ProductDemoAccountsController,
  VaultSharesController,
} from './product-vault.controller';

// Katalyst Hub: credential vault, client share links and demo accounts. Also the company and personal vault.
@Module({
  imports: [
    ConfigModule,
    NotificationsModule,
    ProductsModule, // HubUsersService: safe user shapes
    TypeOrmModule.forFeature([
      Product,
      User,
      ProductCredential,
      ProductCredentialEvent,
      ProductCredentialShare,
      ProductCredentialVersion,
      ProductDemoAccount,
    ]),
  ],
  controllers: [ProductCredentialsController, ProductDemoAccountsController, VaultSharesController, CompanyVaultController],
  providers: [VaultCryptoService, ProductVaultService, DemoAccountsService, CompanyVaultService],
  exports: [VaultCryptoService, ProductVaultService, CompanyVaultService],
})
export class ProductVaultModule {}
