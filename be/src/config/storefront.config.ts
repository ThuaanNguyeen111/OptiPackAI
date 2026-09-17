import { registerAs } from '@nestjs/config';

export const DEFAULT_STOREFRONT_NAME = 'AURELLE';

export default registerAs('storefront', () => ({
  name: process.env.STOREFRONT_NAME?.trim() || DEFAULT_STOREFRONT_NAME,
}));
