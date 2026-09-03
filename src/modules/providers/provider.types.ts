export type ProviderName = 'barcode_lookup' | 'openai' | 'google_vision' | 'bank_open_banking';
export type ProviderResult<T> =
  { status: 'not_configured'; data?: never } | { status: 'available'; data: T };
export interface ProductLookupProvider {
  lookup(barcode: string): Promise<ProviderResult<{ name: string; brand?: string }>>;
}
/** Safe default: callers must explicitly configure a vetted provider; it never invents product data. */
export const unavailableProductLookupProvider: ProductLookupProvider = {
  async lookup(_barcode) {
    return { status: 'not_configured' };
  },
};
