import { describe, expect, it } from 'vitest';
import { jsonLdProducts, money, productLine, shopifyProducts, wooProducts } from '@/lib/inbox/products';

describe('catalogue from a shop website', () => {
  it('Shopify: every variant with its price; "Default Title" means no variation; sold out is kept', () => {
    const p = shopifyProducts([
      { title: 'Homemade Cerelac', handle: 'cerelac', product_type: 'Baby food', body_html: '<p>6 mash+</p>', variants: [{ title: '500g', price: '700.00', available: true }, { title: '1kg', price: '1200.00', compare_at_price: '1400.00', available: false }] },
      { title: 'Badam Mix', handle: 'badam', variants: [{ title: 'Default Title', price: '350.00', available: true }] },
    ], 'https://shop.test');
    expect(p).toHaveLength(2);
    expect(productLine(p[0])).toBe('• Homemade Cerelac: 500g ৳700; 1kg ৳1,200 (stock nai) — https://shop.test/products/cerelac');
    expect(p[0].variants[1].regular).toBe(1400);
    expect(productLine(p[1])).toBe('• Badam Mix: ৳350 — https://shop.test/products/badam');
  });
  it('WooCommerce: prices come in minor units; variation attributes become the label; no variation list = price range', () => {
    const p = wooProducts([
      { id: 1, name: 'Cerelac', permalink: 'https://w.test/cerelac', type: 'variable', is_in_stock: true, categories: [{ name: 'Baby food' }], prices: { price: '70000', regular_price: '70000', currency_minor_unit: 2, currency_code: 'BDT', price_range: { min_amount: '70000', max_amount: '120000' } } },
      { id: 2, name: 'Mix', permalink: 'https://w.test/mix', type: 'variable', is_in_stock: true, prices: { price: '30000', regular_price: '30000', currency_minor_unit: 2, currency_code: 'BDT', price_range: { min_amount: '30000', max_amount: '45000' } } },
    ], { '1': [{ attributes: [{ name: 'Size', value: '500g' }], prices: { price: '70000', regular_price: '70000', currency_minor_unit: 2 }, is_in_stock: true }, { attributes: [{ name: 'Size', value: '1kg' }], prices: { price: '120000', regular_price: '120000', currency_minor_unit: 2 }, is_in_stock: true }] });
    expect(productLine(p[0])).toContain('500g ৳700; 1kg ৳1,200');
    expect(p[0].category).toBe('Baby food');
    expect(productLine(p[1])).toContain('dam 300 theke 450 porjonto');
  });
  it('WooCommerce: the variation name comes from the parent list or the variation text; entities are decoded', () => {
    const p = wooProducts([
      { id: 5, name: 'Pur Bottle &#8211; 1102', permalink: 'https://w.test/b', type: 'variable', is_in_stock: true, prices: { price: '40000', currency_minor_unit: 2, currency_code: 'BDT' }, variations: [{ id: 51, attributes: [{ name: 'Weight', value: '250g' }] }, { id: 52, attributes: [] }] },
    ], { '5': [{ id: 51, prices: { price: '35000', currency_minor_unit: 2 }, is_in_stock: true, attributes: [] }, { id: 52, variation: '<span>Weight</span>: 1kg, Flavor: Rose', prices: { price: '120000', currency_minor_unit: 2 }, is_in_stock: true }] });
    expect(p[0].name).toBe('Pur Bottle – 1102');
    expect(p[0].variants.map((v) => [v.label, v.price])).toEqual([['250g', 350], ['1kg / Rose', 1200]]);
  });
  it('JSON-LD: a product with an offer, and a ProductGroup with variants', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': [
      { '@type': 'Product', name: 'Honey Mix', url: 'https://j.test/honey', offers: { '@type': 'Offer', price: '450', priceCurrency: 'BDT', availability: 'https://schema.org/InStock' } },
      { '@type': 'ProductGroup', name: 'Cerelac', hasVariant: [{ '@type': 'Product', name: 'Cerelac 500g', offers: { price: '700', priceCurrency: 'BDT' } }, { '@type': 'Product', name: 'Cerelac 1kg', offers: { price: '1200', priceCurrency: 'BDT' } }] },
    ] })}</script>`;
    const p = jsonLdProducts(html, 'https://j.test/page');
    expect(p.map((x) => x.name)).toEqual(['Honey Mix', 'Cerelac']);
    expect(p[1].variants.map((v) => [v.label, v.price])).toEqual([['500g', 700], ['1kg', 1200]]);
    expect(money(1200)).toBe('৳1,200');
  });
});
