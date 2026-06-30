/**
 * Diagnose Tesla IR page structure from Google Cache HTML.
 */

import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(__dirname, "../.env.local") });

async function diagnose() {
  const url = "https://ir.tesla.com/press-release/tesla-releases-first-quarter-2026-financial-results";
  const cacheUrl = `https://webcache.googleusercontent.com/search?q=cache:${encodeURIComponent(url)}`;
  
  const response = await fetch(cacheUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    signal: AbortSignal.timeout(15000),
  });
  
  const html = await response.text();
  console.log(`HTML length: ${html.length}`);
  
  // Check for common patterns
  const hasP = (html.match(/<p[ >]/gi) || []).length;
  const hasDiv = (html.match(/<div[ >]/gi) || []).length;
  const hasScript = (html.match(/<script[ >]/gi) || []).length;
  const hasNoscript = (html.match(/<noscript/gi) || []).length;
  const hasArticle = (html.match(/<article/gi) || []).length;
  const hasMain = (html.match(/<main/gi) || []).length;
  const hasDrupal = html.includes("drupal");
  const hasReact = html.includes("__NEXT_DATA__") || html.includes("react");
  
  console.log(`<p> tags: ${hasP}`);
  console.log(`<div> tags: ${hasDiv}`);
  console.log(`<script> tags: ${hasScript}`);
  console.log(`<noscript> tags: ${hasNoscript}`);
  console.log(`<article> tags: ${hasArticle}`);
  console.log(`<main> tags: ${hasMain}`);
  console.log(`Drupal: ${hasDrupal}`);
  console.log(`React/Next: ${hasReact}`);
  
  // Look for content in noscript
  const noscriptMatch = html.match(/<noscript>([\s\S]*?)<\/noscript>/gi);
  if (noscriptMatch) {
    console.log(`\nNoscript blocks: ${noscriptMatch.length}`);
    for (const ns of noscriptMatch.slice(0, 3)) {
      console.log(`  Length: ${ns.length}`);
      console.log(`  Preview: ${ns.slice(0, 200)}`);
    }
  }
  
  // Check for JSON data embedded in page
  const jsonMatch = html.match(/application\/ld\+json[\s\S]*?<\/script>/gi);
  if (jsonMatch) {
    console.log(`\nJSON-LD blocks: ${jsonMatch.length}`);
    for (const jm of jsonMatch.slice(0, 2)) {
      console.log(`  Preview: ${jm.slice(0, 300)}`);
    }
  }
  
  // Check for Drupal settings/data
  const drupalData = html.match(/drupalSettings[\s\S]*?;/i);
  if (drupalData) {
    console.log(`\nDrupal settings found (first 500 chars):`);
    console.log(drupalData[0].slice(0, 500));
  }
  
  // Check for any text content between tags
  const cheerio = await import("cheerio");
  const $ = cheerio.load(html);
  
  // Check all text content
  const allText = $("body").text().trim();
  console.log(`\nBody text length: ${allText.length}`);
  console.log(`Body text preview: ${allText.slice(0, 500)}`);
  
  // Check for specific content divs
  const contentDivs = $('[class*="content"], [class*="press"], [class*="release"], [class*="body"], [class*="article"]');
  console.log(`\nContent-related divs: ${contentDivs.length}`);
  contentDivs.each((i, el) => {
    const cls = $(el).attr("class");
    const text = $(el).text().trim();
    if (text.length > 50) {
      console.log(`  .${cls}: ${text.length} chars - ${text.slice(0, 100)}`);
    }
  });
}

diagnose().catch(console.error);
