import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { getConnectionToken, getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import helmet from 'helmet';
import { Connection, Model, Types } from 'mongoose';
import request from 'supertest';
import type { App } from 'supertest/types';
import { CatalogService } from './catalog.service';
import { SaveAdminProductDto } from './dto/storefront-admin.dto';
import {
  StorefrontCategory, StorefrontCategorySchema, StorefrontImage, StorefrontImageSchema,
  StorefrontInventoryStock, StorefrontInventoryStockDocument, StorefrontInventoryStockSchema,
  StorefrontProduct, StorefrontProductDocument, StorefrontProductSchema,
  StorefrontProductVariant, StorefrontProductVariantDocument, StorefrontProductVariantSchema,
} from './schemas/storefront.schema';
import { StorefrontAdminAuthController } from './storefront-admin-auth.controller';
import { StorefrontAdminAuthService } from './storefront-admin-auth.service';
import { StorefrontAdminController } from './storefront-admin.controller';
import { StorefrontAdminGuard, StorefrontAdminOriginGuard } from './storefront-admin.guard';
import { StorefrontAdminService } from './storefront-admin.service';
import type { AdminCatalogProduct } from './storefront-admin.service';
import { StorefrontImagesController } from './storefront-images.controller';
import { StorefrontSeedService } from './storefront-seed.service';

const describeWithDatabase = process.env.STOREFRONT_ADMIN_TEST_URI ? describe : describe.skip;
const origin = 'http://localhost:3001';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');

const productInput = {
    name: 'Áo thử nghiệm', description: 'Sản phẩm kiểm thử', categoryId: null,
    thumbnailUrl: '/kaira-assets/images/product-item-1.jpg', galleryImages: [] as string[],
    status: 'active', isFeatured: false,
    variants: [{ color: 'Đỏ', size: 'M', price: 100000, quantityOnHand: 10 }],
} satisfies SaveAdminProductDto;

function input(): typeof productInput {
  return { ...productInput, variants: productInput.variants.map((variant) => ({ ...variant })) };
}

describeWithDatabase('storefront admin with an isolated replica-set database', () => {
  let app: INestApplication<App>;
  let connection: Connection;
  let service: StorefrontAdminService;
  let catalog: CatalogService;
  let products: Model<StorefrontProductDocument>;
  let variants: Model<StorefrontProductVariantDocument>;
  let stocks: Model<StorefrontInventoryStockDocument>;
  let cookie: string;
  let product: AdminCatalogProduct;

  beforeAll(async () => {
    const config = new ConfigService({ NODE_ENV: 'test', CORS_ORIGIN: origin, storefront: { admin: {
      email: 'admin@example.com', passwordHash: await bcrypt.hash('test-password', 4),
      jwtSecret: 'isolated-test-secret-at-least-32-characters',
    } } });
    const module = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(process.env.STOREFRONT_ADMIN_TEST_URI ?? '', {
          dbName: `storefront_admin_test_${new Types.ObjectId().toHexString()}`, serverSelectionTimeoutMS: 5000,
        }), JwtModule.register({}),
        MongooseModule.forFeature([
          { name: StorefrontProduct.name, schema: StorefrontProductSchema },
          { name: StorefrontProductVariant.name, schema: StorefrontProductVariantSchema },
          { name: StorefrontInventoryStock.name, schema: StorefrontInventoryStockSchema },
          { name: StorefrontCategory.name, schema: StorefrontCategorySchema },
          { name: StorefrontImage.name, schema: StorefrontImageSchema },
        ]),
      ],
      providers: [
        { provide: ConfigService, useValue: config }, CatalogService, StorefrontAdminService,
        StorefrontAdminAuthService, StorefrontAdminGuard, StorefrontAdminOriginGuard, StorefrontSeedService,
      ],
      controllers: [StorefrontAdminAuthController, StorefrontAdminController, StorefrontImagesController],
    }).compile();
    app = module.createNestApplication<INestApplication<App>>();
    app.use(helmet());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    connection = app.get<Connection>(getConnectionToken());
    products = app.get<Model<StorefrontProductDocument>>(getModelToken(StorefrontProduct.name));
    variants = app.get<Model<StorefrontProductVariantDocument>>(getModelToken(StorefrontProductVariant.name));
    stocks = app.get<Model<StorefrontInventoryStockDocument>>(getModelToken(StorefrontInventoryStock.name));
    service = app.get(StorefrontAdminService);
    catalog = app.get(CatalogService);
    await Promise.all([products.init(), variants.init(), stocks.init()]);
  }, 30000);

  afterAll(async () => { await app.close(); });

  it('blocks unauthenticated requests, logs in and clears the cookie on logout', async () => {
    await request(app.getHttpServer()).get('/storefront/admin/products').expect(401);
    await request(app.getHttpServer()).post('/storefront/admin/auth/login').send({ email: 'admin@example.com', password: 'test-password' }).expect(403);
    const response = await request(app.getHttpServer()).post('/storefront/admin/auth/login').set('Origin', origin)
      .send({ email: 'admin@example.com', password: 'test-password' }).expect(200);
    const cookies = response.headers['set-cookie'] as unknown as string[];
    cookie = cookies[0]?.split(';')[0] ?? '';
    expect(cookie).toContain('storefront_admin_access_token=');
    expect(cookies[0]).toContain('HttpOnly');
    expect(cookies[0]).toContain('SameSite=Lax');
    await request(app.getHttpServer()).get('/storefront/admin/auth/me').set('Cookie', cookie).expect(200, { email: 'admin@example.com' });
    const logout = await request(app.getHttpServer()).post('/storefront/admin/auth/logout').set('Origin', origin).set('Cookie', cookie).expect(200);
    expect(logout.headers['set-cookie']).toEqual(expect.arrayContaining([expect.stringContaining('storefront_admin_access_token=;')]));
  });

  it('creates a product and exposes its variants and stock in the public catalog', async () => {
    const response = await request(app.getHttpServer()).post('/storefront/admin/products').set('Origin', origin).set('Cookie', cookie).send(input()).expect(201);
    product = response.body as AdminCatalogProduct;
    expect(product.name).toBe('Áo thử nghiệm');
    expect(product.variants[0]?.availableQuantity).toBe(10);
    expect(product.galleryImages).toEqual([input().thumbnailUrl]);
    expect((await catalog.findBySlug(product.slug)).id).toBe(product.id);
  });

  it('validates request bodies, image paths, categories and variant ownership before saving', async () => {
    const post = (body: object): request.Test => request(app.getHttpServer()).post('/storefront/admin/products')
      .set('Origin', origin).set('Cookie', cookie).send(body).expect(400);
    await post({ ...input(), variants: [] });
    await post({ ...input(), variants: [{ price: -1, quantityOnHand: 1 }] });
    await post({ ...input(), variants: [{ price: 1, quantityOnHand: 1.5 }] });
    await post({ ...input(), thumbnailUrl: 'javascript:alert(1)' });
    await post({ ...input(), categoryId: new Types.ObjectId().toHexString() });
    await post({ ...input(), deleted_at: null });
    await request(app.getHttpServer()).patch(`/storefront/admin/products/${product.id}`).set('Origin', origin).set('Cookie', cookie)
      .send({ ...input(), name: 'Không được lưu', variants: [{ ...input().variants[0], id: new Types.ObjectId().toHexString() }] }).expect(400);
    expect((await service.findOne(product.id)).name).toBe('Áo thử nghiệm');
  });

  it('preserves IDs, metadata and reserved stock and rolls back invalid edits', async () => {
    const variant = product.variants[0];
    if (!variant) throw new Error('Missing test variant');
    await products.updateOne({ _id: product.id }, { $set: { brand: 'Original brand', size_chart: [{ size: 'M', bust_cm: 100 }] } });
    await variants.updateOne({ _id: variant.id }, { $set: { weight_kg: 0.25, compare_at_price: 150000 } });
    await stocks.updateOne({ variant_id: variant.id }, { $set: { reserved_quantity: 3 } });
    await expect(service.save({ ...input(), name: 'Rollback', variants: [{ id: variant.id, price: 200000, quantityOnHand: 2 }] }, product.id)).rejects.toThrow('giữ chỗ');
    expect((await service.findOne(product.id)).name).toBe('Áo thử nghiệm');
    expect((await variants.findById(variant.id))?.price).toBe(100000);
    const updated = await service.save({ ...input(), name: 'Áo đã sửa', variants: [
      { id: variant.id, color: 'Xanh', size: 'L', price: 120000, quantityOnHand: 8 },
      { color: 'Đen', size: 'XL', price: 130000, quantityOnHand: 4 },
    ] }, product.id);
    expect(updated.slug).toBe(product.slug);
    expect(updated.variants[0]?.sku).toBe(variant.sku);
    expect(updated.variants[0]?.availableQuantity).toBe(5);
    expect((await products.findById(product.id))?.brand).toBe('Original brand');
    expect((await variants.findById(variant.id))?.weight_kg).toBe(0.25);
    expect(updated.sizeChart[0]?.bust_cm).toBe(100);
    product = updated;
  });

  it('stores an image and serves the same bytes with cross-origin image headers', async () => {
    const response = await request(app.getHttpServer()).post('/storefront/admin/images').set('Origin', origin).set('Cookie', cookie)
      .attach('file', png, { filename: 'photo.png', contentType: 'image/png' }).expect(201);
    const { url } = response.body as { url: string };
    const image = await request(app.getHttpServer()).get(url).expect(200).expect('Content-Type', 'image/png')
      .expect('Cross-Origin-Resource-Policy', 'cross-origin');
    expect(image.body).toEqual(png);
    await request(app.getHttpServer()).post('/storefront/admin/images').set('Origin', origin).set('Cookie', cookie)
      .attach('file', Buffer.from('<svg/>'), { filename: 'fake.png', contentType: 'image/png' }).expect(400);
    await request(app.getHttpServer()).post('/storefront/admin/images').set('Origin', origin).set('Cookie', cookie)
      .attach('file', Buffer.alloc(5 * 1024 * 1024 + 1), { filename: 'large.png', contentType: 'image/png' }).expect(413);
  });

  it('does not overwrite seed product images or resurrect removed variants on restart', async () => {
    const seeded = await products.findOne({ slug: 'minimal-cotton-shirt' });
    if (!seeded) throw new Error('Missing seed product');
    const dto = input();
    dto.thumbnailUrl = '/kaira-assets/images/product-item-9.jpg';
    dto.galleryImages = [dto.thumbnailUrl];
    await service.save(dto, seeded.id);
    await app.get(StorefrontSeedService).onModuleInit();
    const after = await service.findOne(seeded.id);
    expect(after.thumbnailUrl).toBe(dto.thumbnailUrl);
    expect(after.galleryImages).toEqual(dto.galleryImages);
    expect(after.variants).toHaveLength(1);
    await service.remove(seeded.id);
    await app.get(StorefrontSeedService).onModuleInit();
    await expect(catalog.findBySlug(seeded.slug)).rejects.toThrow('Không tìm thấy');
  });

  it('removes variants and products from sale while preserving old order snapshots', async () => {
    const removed = product.variants[0];
    const kept = product.variants[1];
    if (!removed || !kept) throw new Error('Missing test variants');
    const snapshot = { product_id: product.id, variant_id: removed.id, product_name_snapshot: product.name, unit_price: removed.price };
    const stored = await connection.collection('storefront_order_items').insertOne(snapshot);
    await service.save({ ...input(), variants: [{ id: kept.id, price: kept.price, quantityOnHand: 4 }] }, product.id);
    expect((await variants.findById(removed.id))?.is_active).toBe(false);
    expect((await service.findOne(product.id)).variants[0]?.isDefault).toBe(true);
    await request(app.getHttpServer()).delete(`/storefront/admin/products/${product.id}`).set('Origin', origin).set('Cookie', cookie).expect(200);
    expect((await service.list()).some((item) => item.id === product.id)).toBe(false);
    await expect(catalog.findBySlug(product.slug)).rejects.toThrow('Không tìm thấy');
    expect((await products.findById(product.id))?.deleted_at).toBeInstanceOf(Date);
    expect((await variants.findById(kept.id))?.is_active).toBe(false);
    expect(await connection.collection('storefront_order_items').findOne({ _id: stored.insertedId })).toMatchObject(snapshot);
  });
});
