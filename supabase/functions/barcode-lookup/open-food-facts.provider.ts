export type Product = { name: string; brand?: string; image_url?: string; categories?: string[] };

export class BarcodeProviderError extends Error {
  constructor(
    readonly code: 'NOT_CONFIGURED' | 'NOT_FOUND' | 'UPSTREAM_ERROR' | 'INVALID_RESPONSE',
  ) {
    super(code);
  }
}

type OpenFoodFactsResponse = {
  status?: number;
  product?: {
    product_name?: string;
    brands?: string;
    image_front_url?: string;
    categories_tags?: string[];
  };
};

/** Public read-only Open Food Facts adapter. It never fabricates a product when a barcode is absent. */
export async function lookupOpenFoodFacts(
  barcode: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Product> {
  let response: Response;
  try {
    response = await fetchImpl(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'PayvandBackend/1.0 (barcode lookup)',
        },
        signal: AbortSignal.timeout(8_000),
      },
    );
  } catch {
    throw new BarcodeProviderError('UPSTREAM_ERROR');
  }
  if (!response.ok) throw new BarcodeProviderError('UPSTREAM_ERROR');
  let body: OpenFoodFactsResponse;
  try {
    body = (await response.json()) as OpenFoodFactsResponse;
  } catch {
    throw new BarcodeProviderError('INVALID_RESPONSE');
  }
  if (body.status !== 1 || !body.product?.product_name?.trim())
    throw new BarcodeProviderError('NOT_FOUND');
  return {
    name: body.product.product_name.trim().slice(0, 200),
    brand: body.product.brands?.trim().slice(0, 160) || undefined,
    image_url: body.product.image_front_url?.slice(0, 1000),
    categories: body.product.categories_tags?.slice(0, 20),
  };
}
