/**
 * update-listings.mjs
 *
 * Fetches Ivan's live listings directly from the KW GraphQL API
 * and rewrites listings.json. Photos are referenced via KW CDN URLs
 * (no local download needed).
 *
 * Run manually : node update-listings.mjs
 * Scheduled    : via GitHub Actions (.github/workflows/update-listings.yml)
 */

import { writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const JSON_PATH = join(__dirname, 'listings.json');

const ORG_ID          = 1869686;
const VIEWPORT_BOUNDS = [25.9, -80.1, 25.65, -80.45];
const GQL_ENDPOINT    = 'https://graph.prod.consumer.kw.com/';
const KW_BASE         = 'https://ivan-resciniti.kw.com';

const GQL_HEADERS = {
  'Content-Type': 'application/json',
  'Accept':       'application/json',
  'Origin':       KW_BASE,
  'Referer':      `${KW_BASE}/`,
  'User-Agent':   'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
};

const LISTINGS_QUERY = `
query ListingSearch($location: Location!, $filters: SearchFilters, $sorting: Sorting, $first: Float, $after: Float) {
  listings(location: $location, filters: $filters, sorting: $sorting, first: $first, after: $after) {
    listings {
      id
      pricing {
        sale { amount }
        rent { amount }
      }
      address {
        displayAddress
        city
      }
      images
    }
  }
}`;

function listingUrl(address, id) {
  const slug = address
    .replace(/#/g, '')
    .replace(/,/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `${KW_BASE}/property/${slug}/${id}`;
}

function formatPrice(amount) {
  if (!amount) return null;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);
}

async function fetchListings(category) {
  const body = JSON.stringify({
    variables: {
      location: {
        boundaryIds: [],
        viewport: { bounds: VIEWPORT_BOUNDS },
      },
      filters: {
        listingCategory: [category],
        listingStatus: ['active', 'comingSoon'],
        brandedSiteOrgId: ORG_ID,
        hideVowListings: false,
      },
      sorting: { sortBy: 'listingUpdateDate', sortDirection: 'desc' },
      first: 50,
      after: 0,
    },
    query: LISTINGS_QUERY,
  });

  const res = await fetch(GQL_ENDPOINT, { method: 'POST', headers: GQL_HEADERS, body });
  if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors) console.warn(`[update-listings] GraphQL warnings (${category}):`, json.errors.map(e => e.message).join(', '));
  return json.data?.listings?.listings ?? [];
}

async function run() {
  console.log('[update-listings] Fetching listings from KW GraphQL API…');

  const [saleListings, rentalListings] = await Promise.all([
    fetchListings('sale'),
    fetchListings('rent'),
  ]);

  const allListings = [
    ...saleListings.map(l => ({ ...l, _category: 'sale' })),
    ...rentalListings.map(l => ({ ...l, _category: 'rental' })),
  ];
  console.log(`[update-listings] Found ${saleListings.length} for sale, ${rentalListings.length} rentals (${allListings.length} total)`);

  if (!allListings.length) throw new Error('API returned 0 listings — aborting to keep existing data');

  const listings = [];

  for (const raw of allListings) {
    const photoUrl = raw.images?.[0];
    const addr     = raw.address?.displayAddress?.trim();
    if (!photoUrl) { console.warn(`[update-listings] Listing ${raw.id} has no images — skipping`); continue; }
    if (!addr)     { console.warn(`[update-listings] Listing ${raw.id} has no address — skipping`); continue; }

    const isRental    = raw._category === 'rental';
    const priceAmount = raw.pricing?.sale?.amount || raw.pricing?.rent?.amount;
    const price       = priceAmount
      ? (isRental ? `${formatPrice(priceAmount)}/mo` : formatPrice(priceAmount))
      : 'Contact for price';

    listings.push({
      photo:   photoUrl,
      price,
      type:    isRental ? 'Rental' : 'Residential',
      address: addr,
      url:     listingUrl(addr, raw.id),
    });

    console.log(`[update-listings] ✓ ${addr}`);
  }

  if (!listings.length) throw new Error('No valid listings found — keeping existing listings.json');

  await writeFile(JSON_PATH, JSON.stringify(listings, null, 2));
  console.log(`[update-listings] listings.json updated with ${listings.length} entries`);
  console.log('[update-listings] Done.');
}

run().catch(err => {
  console.error('[update-listings] FAILED:', err.message);
  process.exit(1);
});
