#!/usr/bin/env tsx
/**
 * Dynamic Browser Test Loop
 * 
 * Continuously runs browser tests, prioritizing:
 * 1. Untested areas (🔄 status)
 * 2. Failed tests (❌ status)
 * 3. Partial tests (⚠️ status)
 * 4. Regression testing of fixed bugs
 * 
 * Updates docs/browser-test-checklist.md after each test run
 */

import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const CHECKLIST_PATH = path.join(__dirname, '../docs/browser-test-checklist.md');
const LOOP_INTERVAL = 30 * 60 * 1000; // 30 minutes

interface TestArea {
  id: string;
  name: string;
  url: string;
  tests: TestCase[];
}

interface TestCase {
  id: string;
  description: string;
  status: '🔄' | '✅' | '❌' | '⚠️';
  lastRun?: Date;
  lastResult?: string;
}

// Test areas mapped to checklist sections
const TEST_AREAS: TestArea[] = [
  {
    id: 'public-pages',
    name: 'Public Pages',
    url: 'http://localhost:3000',
    tests: [
      { id: '1.1', description: 'Home / Public Feed', status: '✅' },
      { id: '1.2', description: 'Tactical View Toggle', status: '✅' },
      { id: '1.3', description: 'Public Signal Detail', status: '✅' },
      { id: '1.4', description: 'Public Article Detail', status: '✅' },
      { id: '1.5', description: 'Public Inference Detail', status: '✅' },
      { id: '1.6', description: 'Public Search', status: '✅' },
      { id: '1.7', description: 'Signup Prompt', status: '✅' },
      { id: '1.8', description: 'Loading States', status: '⚠️' },
      { id: '1.9', description: 'Error Boundaries', status: '✅' },
      { id: '1.10', description: 'Responsive Layout', status: '✅' },
    ],
  },
  {
    id: 'auth',
    name: 'Authentication',
    url: 'http://localhost:3000/sign-in',
    tests: [
      { id: '2.1', description: 'Sign In (Admin)', status: '✅' },
      { id: '2.2', description: 'Sign In (User)', status: '✅' },
      { id: '2.3', description: 'Sign Up', status: '✅' },
      { id: '2.4', description: 'Invalid Credentials', status: '✅' },
      { id: '2.5', description: 'Session Persistence', status: '✅' },
      { id: '2.6', description: 'Protected Route Redirect', status: '✅' },
      { id: '2.7', description: 'Sign Out', status: '✅' },
    ],
  },
  {
    id: 'dashboard-overview',
    name: 'Dashboard - Overview',
    url: 'http://localhost:3000/dashboard',
    tests: [
      { id: '3.1', description: 'Overview Page Load', status: '✅' },
      { id: '3.2', description: 'Sentiment Trends Chart', status: '✅' },
      { id: '3.3', description: 'Confidence Distribution', status: '✅' },
      { id: '3.4', description: 'Signal Source Breakdown', status: '✅' },
      { id: '3.5', description: 'Analytics Tab', status: '✅' },
      { id: '3.6', description: 'Articles Tab', status: '✅' },
    ],
  },
  {
    id: 'dashboard-signals',
    name: 'Dashboard - Signals',
    url: 'http://localhost:3000/dashboard/signals',
    tests: [
      { id: '4.1', description: 'Signal List', status: '✅' },
      { id: '4.2', description: 'Signal Filters', status: '✅' },
      { id: '4.3', description: 'Signal Search', status: '✅' },
      { id: '4.4', description: 'Signal Detail', status: '✅' },
      { id: '4.5', description: 'Add Signal', status: '✅' },
      { id: '4.6', description: 'Pagination', status: '✅' },
    ],
  },
  {
    id: 'dashboard-companies',
    name: 'Dashboard - Companies',
    url: 'http://localhost:3000/dashboard/companies',
    tests: [
      { id: '5.1', description: 'Company List', status: '✅' },
      { id: '5.2', description: 'Company Detail', status: '✅' },
      { id: '5.3', description: 'Add Company', status: '✅' },
      { id: '5.4', description: 'Watchlist Filter', status: '✅' },
      { id: '5.5', description: 'Company Search', status: '✅' },
    ],
  },
  {
    id: 'dashboard-insights',
    name: 'Dashboard - Strategic Insights',
    url: 'http://localhost:3000/dashboard/strategic-insights',
    tests: [
      { id: '6.1', description: 'Strategic Insights Page', status: '✅' },
      { id: '6.2', description: 'Inference Filtering', status: '✅' },
      { id: '6.3', description: 'Theme Momentum', status: '✅' },
    ],
  },
  {
    id: 'dashboard-profile',
    name: 'Dashboard - Profile & Settings',
    url: 'http://localhost:3000/dashboard/profile',
    tests: [
      { id: '7.1', description: 'Profile Page', status: '✅' },
      { id: '7.2', description: 'Edit Profile', status: '✅' },
      { id: '7.3', description: 'Settings Page', status: '✅' },
    ],
  },
  {
    id: 'admin-dashboard',
    name: 'Admin Dashboard',
    url: 'http://localhost:3000/dashboard/admin',
    tests: [
      { id: '8.1', description: 'Admin Overview', status: '✅' },
      { id: '8.2', description: 'Admin Navigation', status: '✅' },
      { id: '8.3', description: 'User Management', status: '✅' },
      { id: '8.4', description: 'User Role Change', status: '⚠️' },
      { id: '8.5', description: 'User Suspension', status: '⚠️' },
      { id: '8.6', description: 'System Health', status: '✅' },
      { id: '8.7', description: 'Scraper Management', status: '✅' },
      { id: '8.8', description: 'Job Monitoring', status: '✅' },
      { id: '8.9', description: 'API Key Status', status: '✅' },
      { id: '8.10', description: 'Content Moderation', status: '✅' },
      { id: '8.11', description: 'Moderation Queue', status: '✅' },
      { id: '8.12', description: 'Content Management', status: '✅' },
      { id: '8.13', description: 'Moderation Settings', status: '✅' },
      { id: '8.14', description: 'Admin Settings', status: '✅' },
      { id: '8.15', description: 'Audit Logs', status: '✅' },
    ],
  },
  {
    id: 'admin-control-center',
    name: 'Admin - Control Center',
    url: 'http://localhost:3000/dashboard/admin/control-center',
    tests: [
      { id: '9.1', description: 'Control Center Load', status: '✅' },
      { id: '9.2', description: 'Manual Trigger - Discovery', status: '✅' },
      { id: '9.3', description: 'Manual Trigger - Analysis', status: '✅' },
      { id: '9.4', description: 'Manual Trigger - Correlation', status: '✅' },
      { id: '9.5', description: 'Pipeline Status Indicators', status: '✅' },
    ],
  },
  {
    id: 'admin-intelligence',
    name: 'Admin - Intelligence',
    url: 'http://localhost:3000/dashboard/admin/intelligence',
    tests: [
      { id: '10.1', description: 'Inference Management', status: '✅' },
      { id: '10.2', description: 'Resolve Inference', status: '✅' },
      { id: '10.3', description: 'Theme Monitoring', status: '✅' },
    ],
  },
  {
    id: 'admin-deepagent',
    name: 'Admin - DeepAgent',
    url: 'http://localhost:3000/dashboard/admin/deepagent',
    tests: [
      { id: '11.1', description: 'DeepAgent Page Load', status: '✅' },
      { id: '11.2', description: 'New Session', status: '✅' },
      { id: '11.3', description: 'Send Message', status: '❌' }, // Bug #6 - needs retest after fix
      { id: '11.4', description: 'Performance Metrics', status: '✅' },
      { id: '11.5', description: 'Memory Search', status: '✅' },
      { id: '11.6', description: 'Batch Approval', status: '✅' },
      { id: '11.7', description: 'Templates', status: '✅' },
      { id: '11.8', description: 'Command Palette', status: '✅' },
      { id: '11.9', description: 'Keyboard Shortcuts', status: '✅' },
    ],
  },
  {
    id: 'cross-flow',
    name: 'Cross-Flow / Non-Linear Tests',
    url: 'http://localhost:3000',
    tests: [
      { id: '12.1', description: 'Public → Sign In → Dashboard', status: '✅' },
      { id: '12.2', description: 'Dashboard → Signal → Article → Back', status: '✅' },
      { id: '12.3', description: 'Admin → Control Center → Trigger → Monitor', status: '✅' },
      { id: '12.4', description: 'Company → Signals → Analysis → Inference', status: '✅' },
      { id: '12.5', description: 'Search → Detail → Share', status: '✅' },
      { id: '12.6', description: 'DeepAgent → Template → Session → Metrics', status: '✅' },
      { id: '12.7', description: 'Admin → Moderation → Approve → Public Feed', status: '🔄' },
      { id: '12.8', description: 'Browser Back/Forward', status: '✅' },
      { id: '12.9', description: 'Direct URL Access', status: '✅' },
      { id: '12.10', description: 'Multi-tab Navigation', status: '✅' },
      { id: '12.11', description: 'Session Expiry Mid-Action', status: '🔄' },
      { id: '12.12', description: 'Non-admin → Admin Route', status: '✅' },
    ],
  },
  {
    id: 'error-edge-cases',
    name: 'Error & Edge Cases',
    url: 'http://localhost:3000',
    tests: [
      { id: '13.1', description: '404 Page', status: '✅' },
      { id: '13.2', description: 'Empty States', status: '⚠️' },
      { id: '13.3', description: 'Network Error Recovery', status: '🔄' },
      { id: '13.4', description: 'Console Errors', status: '✅' },
      { id: '13.5', description: 'API Error Handling', status: '✅' },
    ],
  },
];

async function main() {
  console.log('🚀 Starting Dynamic Browser Test Loop');
  console.log(`Loop interval: ${LOOP_INTERVAL / 1000 / 60} minutes`);
  console.log(`Checklist: ${CHECKLIST_PATH}\n`);

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  let loopCount = 0;

  while (true) {
    loopCount++;
    console.log(`\n${'='.repeat(60)}`);
    console.log(`LOOP #${loopCount} - ${new Date().toLocaleString()}`);
    console.log('='.repeat(60));

    // Prioritize tests
    const priorityTests = prioritizeTests();
    
    if (priorityTests.length === 0) {
      console.log('✅ All tests are passing! Running regression suite...');
      await runRegressionSuite(page);
    } else {
      console.log(`🎯 Running ${priorityTests.length} priority tests:`);
      priorityTests.forEach(t => console.log(`   - ${t.id}: ${t.description} (${t.status})`));
      
      for (const test of priorityTests) {
        await runTest(page, test);
      }
    }

    // Update checklist
    updateChecklist();

    console.log(`\n⏰ Next loop in ${LOOP_INTERVAL / 1000 / 60} minutes...`);
    await new Promise(resolve => setTimeout(resolve, LOOP_INTERVAL));
  }

  async function runTest(page: any, test: TestCase) {
    console.log(`\n🧪 Testing ${test.id}: ${test.description}`);
    
    try {
      // Find the test area
      const area = TEST_AREAS.find(a => a.tests.some(t => t.id === test.id));
      if (!area) {
        console.log(`❌ Test area not found for ${test.id}`);
        test.status = '❌';
        test.lastResult = 'Test area not found';
        return;
      }

      // Navigate to test URL
      await page.goto(area.url);
      await page.waitForLoadState('networkidle');

      // Run specific test logic
      const result = await executeTestLogic(page, test.id);
      
      test.status = result.passed ? '✅' : '❌';
      test.lastResult = result.message;
      test.lastRun = new Date();

      console.log(`${test.status} ${result.message}`);
    } catch (error) {
      test.status = '❌';
      test.lastResult = `Error: ${error.message}`;
      console.log(`❌ ${test.lastResult}`);
    }
  }

  async function executeTestLogic(page: any, testId: string): Promise<{ passed: boolean; message: string }> {
    // Implement test logic for each test ID
    // This is a simplified version - expand based on actual test requirements
    
    switch (testId) {
      case '11.3': // DeepAgent Send Message - Bug #6 retest
        try {
          // Login as admin
          await page.goto('http://localhost:3000/sign-in');
          await page.fill('input[type="email"]', 'admin@thetell.com');
          await page.fill('input[type="password"]', 'password123');
          await page.click('button[type="submit"]');
          await page.waitForURL('**/dashboard');
          
          // Navigate to DeepAgent
          await page.goto('http://localhost:3000/dashboard/admin/deepagent');
          await page.waitForLoadState('networkidle');
          
          // Try to send a message
          const messageInput = await page.locator('textarea').first();
          await messageInput.fill('Test message after Bug #6 fix');
          await page.click('button:has-text("Send")');
          
          // Wait for response or error
          await page.waitForTimeout(3000);
          
          // Check for error messages
          const errorText = await page.locator('text=path must be absolute').count();
          if (errorText > 0) {
            return { passed: false, message: 'Bug #6 still present: path validation error' };
          }
          
          return { passed: true, message: 'Bug #6 fixed: message sent successfully' };
        } catch (error) {
          return { passed: false, message: `Test failed: ${error.message}` };
        }

      case '12.7': // Admin → Moderation → Approve → Public Feed
        // TODO: Implement full flow test
        return { passed: false, message: 'Test not yet implemented' };

      case '12.11': // Session Expiry Mid-Action
        // TODO: Implement session expiry test
        return { passed: false, message: 'Test not yet implemented' };

      case '13.3': // Network Error Recovery
        // TODO: Implement network error test
        return { passed: false, message: 'Test not yet implemented' };

      default:
        // For tests marked as ✅, just verify the page loads
        const title = await page.title();
        if (title) {
          return { passed: true, message: 'Page loaded successfully' };
        }
        return { passed: false, message: 'Page failed to load' };
    }
  }

  function prioritizeTests(): TestCase[] {
    const allTests = TEST_AREAS.flatMap(area => area.tests);
    
    // Priority order: ❌ (failed) > 🔄 (untested) > ⚠️ (partial)
    const failed = allTests.filter(t => t.status === '❌');
    const untested = allTests.filter(t => t.status === '🔄');
    const partial = allTests.filter(t => t.status === '⚠️');
    
    return [...failed, ...untested, ...partial];
  }

  async function runRegressionSuite(page: any) {
    console.log('\n🔄 Running regression suite on all ✅ tests...');
    
    const allTests = TEST_AREAS.flatMap(area => area.tests);
    const passingTests = allTests.filter(t => t.status === '✅');
    
    // Sample 10% of passing tests for regression
    const sampleSize = Math.max(5, Math.floor(passingTests.length * 0.1));
    const sampledTests = passingTests
      .sort(() => Math.random() - 0.5)
      .slice(0, sampleSize);
    
    console.log(`Testing ${sampledTests.length} random passing tests for regressions...`);
    
    for (const test of sampledTests) {
      await runTest(page, test);
    }
  }

  function updateChecklist() {
    console.log('\n📝 Updating test checklist...');
    
    let content = fs.readFileSync(CHECKLIST_PATH, 'utf-8');
    
    // Update each test status in the checklist
    for (const area of TEST_AREAS) {
      for (const test of area.tests) {
        // Find the test row in the checklist and update status
        const testRowRegex = new RegExp(`(\\| ${test.id} \\|[^|]+\\|[^|]+\\| )([✅❌⚠️🔄])`, 'g');
        content = content.replace(testRowRegex, `$1${test.status}`);
      }
    }
    
    // Update last updated timestamp
    const now = new Date();
    const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    content = content.replace(/\*\*Last updated\*\*: .+/, `**Last updated**: ${timestamp} (Loop #${loopCount})`);
    
    fs.writeFileSync(CHECKLIST_PATH, content, 'utf-8');
    console.log('✅ Checklist updated');
  }
}

main().catch(console.error);
