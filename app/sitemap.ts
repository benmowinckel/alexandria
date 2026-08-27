import type { MetadataRoute } from 'next';
import { SITE_URL } from './lib/config';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, priority: 1 },
    { url: `${SITE_URL}/start`, priority: 0.95 },
    { url: `${SITE_URL}/chat`, priority: 0.9 },
    { url: `${SITE_URL}/join`, priority: 0.95 },
    { url: `${SITE_URL}/ask`, priority: 0.9 },
    { url: `${SITE_URL}/whitepaper`, priority: 0.9 },
    { url: `${SITE_URL}/features`, priority: 0.85 },
    { url: `${SITE_URL}/letter`, priority: 0.9 },
    { url: `${SITE_URL}/docs/letter.pdf`, priority: 0.9 },
    { url: `${SITE_URL}/library`, priority: 0.85 },
    { url: `${SITE_URL}/marketplace`, priority: 0.85 },
    { url: `${SITE_URL}/follow`, priority: 0.7 },
    { url: `${SITE_URL}/questions`, priority: 0.7 },
    { url: `${SITE_URL}/updates`, priority: 0.5 },
    { url: `${SITE_URL}/mechanics`, priority: 0.6 },
    { url: `${SITE_URL}/privacy`, priority: 0.3 },
    { url: `${SITE_URL}/terms`, priority: 0.3 },
  ];
}
