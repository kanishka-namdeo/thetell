import { getFeedsByCompanyId } from '../src/lib/scraping/feed-registry';

const amdFeeds = getFeedsByCompanyId('amd');
console.log('AMD feeds:', JSON.stringify(amdFeeds, null, 2));
