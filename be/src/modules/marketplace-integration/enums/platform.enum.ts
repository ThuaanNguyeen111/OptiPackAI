export enum MarketplacePlatform {
  TIKTOK = 'tiktok',
  LAZADA = 'lazada',
  TIKI = 'tiki',
}

export function parseMarketplacePlatform(
  value: unknown,
  fallback: MarketplacePlatform = MarketplacePlatform.LAZADA,
): MarketplacePlatform {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'tiktok') return MarketplacePlatform.TIKTOK;
    if (normalized === 'lazada') return MarketplacePlatform.LAZADA;
    if (normalized === 'tiki') return MarketplacePlatform.TIKI;
  }
  return fallback;
}
