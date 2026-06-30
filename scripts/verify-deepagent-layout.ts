import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  
  // Login
  await page.goto('http://localhost:3000/sign-in');
  await page.fill('input[name="email"]', 'admin@thetell.com');
  await page.fill('input[name="password"]', 'password123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);
  
  // Navigate to DeepAgent
  await page.goto('http://localhost:3000/dashboard/admin/deepagent');
  await page.waitForTimeout(1000);
  
  // Check current state
  const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 500));
  console.log('=== Initial State ===');
  console.log(bodyText);
  
  // Take initial screenshot
  await page.screenshot({ path: 'D:\\test_misc\\the_tell\\deepagent-initial.png' });
  console.log('Saved: deepagent-initial.png');
  
  // Create a new session if none exist
  const createBtn = await page.$('button:has-text("New Chat")');
  if (createBtn) {
    await createBtn.click();
    await page.waitForTimeout(1000);
  }
  
  // Send multiple messages to create a conversation with 6+ messages
  const messages = [
    'What is the current state of the project?',
    'Can you analyze the recent signals?',
    'What are the main themes emerging?',
    'Show me the top inferences',
    'What companies are showing the most activity?',
    'Summarize the key findings',
    'What should I focus on next?'
  ];
  
  for (let i = 0; i < messages.length; i++) {
    const textarea = await page.$('textarea');
    if (textarea) {
      await textarea.fill(messages[i]);
      await page.keyboard.press('Enter');
      console.log(`Sent message ${i + 1}: ${messages[i]}`);
      
      // Wait for response to start appearing
      await page.waitForTimeout(2000);
      
      // Take screenshot after each message
      await page.screenshot({ path: `D:\\test_misc\\the_tell\\deepagent-msg-${i + 1}.png` });
      console.log(`Saved: deepagent-msg-${i + 1}.png`);
    }
  }
  
  // Final screenshot
  await page.screenshot({ path: 'D:\\test_misc\\the_tell\\deepagent-final.png' });
  console.log('Saved: deepagent-final.png');
  
  // Check layout
  const layoutInfo = await page.evaluate(() => {
    const chatLayout = document.querySelector('[class*="flex-col"]');
    const messageList = document.querySelector('[class*="flex-1"]');
    const inputBar = document.querySelector('textarea')?.closest('div');
    
    return {
      chatLayoutHeight: chatLayout?.clientHeight,
      messageListHeight: messageList?.clientHeight,
      inputBarTop: inputBar?.getBoundingClientRect().top,
      viewportHeight: window.innerHeight,
      messageCount: document.querySelectorAll('[class*="flex group"]').length
    };
  });
  
  console.log('\n=== Layout Info ===');
  console.log(JSON.stringify(layoutInfo, null, 2));
  
  await browser.close();
})();
