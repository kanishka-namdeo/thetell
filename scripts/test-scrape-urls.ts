import { NewsScraper } from "../src/lib/scraping/news-scraper";

const testUrls = [
  // Apple
  { url: "https://www.apple.com/newsroom/2024/01/apple-previews-new-entertainment-services-and-features/", company: "apple" },
  { url: "https://www.apple.com/newsroom/2024/02/apple-intelligence-comes-to-iphone-ipad-and-mac/", company: "apple" },
  { url: "https://www.apple.com/newsroom/2024/03/apple-increases-investment-in-us-to-500-billion/", company: "apple" },
  
  // Tesla
  { url: "https://www.tesla.com/blog/tesla-releases-fourth-quarter-and-full-year-2023-financial-results", company: "tesla" },
  { url: "https://www.tesla.com/blog/tesla-vehicle-production-deliveries-q4-2023", company: "tesla" },
  { url: "https://ir.tesla.com/press-release/tesla-releases-fourth-quarter-and-full-year-2023-financial-results", company: "tesla" },
  
  // NVIDIA
  { url: "https://blogs.nvidia.com/blog/geforce-rtx-40-super-series/", company: "nvidia" },
  { url: "https://blogs.nvidia.com/blog/nvidia-celebration-40-years/", company: "nvidia" },
  { url: "https://nvidianews.nvidia.com/news/nvidia-super-resolves-generative-ai", company: "nvidia" },
  
  // Alternative sources
  { url: "https://techcrunch.com/2024/01/15/apple-vision-pro-pre-orders/", company: "apple" },
  { url: "https://www.cnbc.com/2024/01/25/tesla-earnings-q4-2023.html", company: "tesla" },
  { url: "https://www.theverge.com/2024/1/15/24041382/apple-vision-pro-preorders-price-release-date", company: "apple" },
];

async function testUrl(url: string, company: string) {
  const scraper = new NewsScraper();
  try {
    const result = await scraper.scrapeArticle(url);
    if (result && result.bodyText.length > 100) {
      console.log(`✓ ${company}: ${url}`);
      console.log(`  Title: ${result.title.substring(0, 80)}`);
      console.log(`  Length: ${result.bodyText.length} chars`);
      return true;
    } else {
      console.log(`✗ ${company}: ${url} - Insufficient content`);
      return false;
    }
  } catch (error) {
    console.log(`✗ ${company}: ${url} - ${error}`);
    return false;
  }
}

async function main() {
  console.log("Testing URLs for scraping...\n");
  
  const results = await Promise.all(
    testUrls.map(async ({ url, company }) => ({
      url,
      company,
      success: await testUrl(url, company)
    }))
  );
  
  console.log("\n=== Summary ===");
  console.log(`Total: ${results.length}`);
  console.log(`Success: ${results.filter(r => r.success).length}`);
  console.log(`Failed: ${results.filter(r => !r.success).length}`);
  
  console.log("\n=== Working URLs by Company ===");
  const byCompany = results.reduce((acc, r) => {
    if (!acc[r.company]) acc[r.company] = [];
    if (r.success) acc[r.company].push(r.url);
    return acc;
  }, {} as Record<string, string[]>);
  
  Object.entries(byCompany).forEach(([company, urls]) => {
    console.log(`\n${company}:`);
    urls.forEach(url => console.log(`  - ${url}`));
  });
}

main().catch(console.error);
