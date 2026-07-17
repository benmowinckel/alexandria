import type { MetadataRoute } from 'next';
import { SITE_URL } from './lib/config';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, lastModified: new Date(), priority: 1 },
    { url: `${SITE_URL}/start`, lastModified: new Date(), priority: 0.95 },
    { url: `${SITE_URL}/join`, lastModified: new Date(), priority: 0.95 },
    { url: `${SITE_URL}/whitepaper`, lastModified: new Date(), priority: 0.9 },
    { url: `${SITE_URL}/letter`, lastModified: new Date(), priority: 0.9 },
    { url: `${SITE_URL}/docs/letter.pdf`, lastModified: new Date(), priority: 0.9 },
    { url: `${SITE_URL}/library`, lastModified: new Date(), priority: 0.85 },
    { url: `${SITE_URL}/marketplace`, lastModified: new Date(), priority: 0.85 },
    { url: `${SITE_URL}/follow`, lastModified: new Date(), priority: 0.7 },
    { url: `${SITE_URL}/questions`, lastModified: new Date(), priority: 0.7 },
    { url: `${SITE_URL}/updates`, lastModified: new Date(), priority: 0.5 },
    { url: `${SITE_URL}/mechanics`, lastModified: new Date(), priority: 0.6 },
    { url: `${SITE_URL}/privacy`, lastModified: new Date(), priority: 0.3 },
    { url: `${SITE_URL}/terms`, lastModified: new Date(), priority: 0.3 },
  ];
}
