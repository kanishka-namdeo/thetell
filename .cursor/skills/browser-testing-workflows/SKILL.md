---
name: browser-testing-workflows
description: >-
  Browser testing for The Tell dashboard using Chrome DevTools MCP. Covers authenticated
  session testing, DOM exploration, data extraction, form interaction, and debugging.
  Use when testing dashboard pages, verifying UI changes, extracting data from the running
  app, or debugging browser automation issues.
disable-model-invocation: false
---

# Browser Testing Workflows

Practical browser testing patterns for The Tell dashboard using Chrome DevTools MCP via `CallMcpTool`.

## Tool Access

Use `CallMcpTool` with `server: "user-chrome-devtools"` for all browser automation.

**Core tools:**
- `list_pages` - Get available browser pages
- `navigate_page` - Navigate to URL
- `take_snapshot` - Get accessibility tree with element UIDs
- `take_screenshot` - Visual screenshot
- `click` - Click element by UID
- `fill` - Fill input by UID
- `evaluate_script` - Run JavaScript
- `wait_for` - Wait for text/element
- `list_console_messages` - Check for errors
- `list_network_requests` - Inspect API calls

## Authentication Testing

### Test Dashboard with Existing Session

```typescript
// 1. List pages to find active browser session
CallMcpTool({
  server: "user-chrome-devtools",
  toolName: "list_pages",
  arguments: {}
})

// 2. Navigate to dashboard (uses existing cookies)
CallMcpTool({
  server: "user-chrome-devtools",
  toolName: "navigate_page",
  arguments: {
    pageId: 1,
    url: "http://localhost:3000/dashboard"
  }
})

// 3. Take snapshot to verify page loaded
CallMcpTool({
  server: "user-chrome-devtools",
  toolName: "take_snapshot",
  arguments: { pageId: 1 }
})

// 4. Check if redirected to login (session expired)
// If snapshot shows login form, session needs refresh
```

### Verify Authentication State

```typescript
// Check current URL after navigation
CallMcpTool({
  server: "user-chrome-devtools",
  toolName: "evaluate_script",
  arguments: {
    pageId: 1,
    function: "() => window.location.href"
  }
})
// If URL contains "/sign-in" or "/auth", session expired
```

## Dashboard Page Testing

### Test Signal Dashboard

```typescript
// Navigate to signals page
CallMcpTool({
  server: "user-chrome-devtools",
  toolName: "navigate_page",
  arguments: {
    pageId: 1,
    url: "http://localhost:3000/dashboard/signals"
  }
})

// Wait for content to load
CallMcpTool({
  server: "user-chrome-devtools",
  toolName: "wait_for",
  arguments: {
    pageId: 1,
    text: ["Signals", "signal"],
    timeout: 10000
  }
})

// Take snapshot to see structure
CallMcpTool({
  server: "user-chrome-devtools",
  toolName: "take_snapshot",
  arguments: { pageId: 1 }
})

// Extract signal data
CallMcpTool({
  server: "user-chrome-devtools",
  toolName: "evaluate_script",
  arguments: {
    pageId: 1,
    function: `() => {
      const cards = document.querySelectorAll('[data-testid="signal-card"], article');
      return Array.from(cards).slice(0, 5).map(card => ({
        title: card.querySelector('h2, h3')?.textContent?.trim(),
        sentiment: card.querySelector('[data-sentiment]')?.getAttribute('data-sentiment'),
        confidence: card.querySelector('[data-confidence]')?.textContent?.trim()
      }));
    }`
  }
})
```

### Test Admin Pages

```typescript
// Navigate to admin dashboard
CallMcpTool({
  server: "user-chrome-devtools",
  toolName: "navigate_page",
  arguments: {
    pageId: 1,
    url: "http://localhost:3000/dashboard/admin"
  }
})

// Verify admin access (check for admin-specific elements)
CallMcpTool({
  server: "user-chrome-devtools",
  toolName: "evaluate_script",
  arguments: {
    pageId: 1,
    function: `() => {
      const hasAdminNav = !!document.querySelector('[data-admin-nav], nav a[href*="admin"]');
      const hasUserManagement = !!document.querySelector('[href*="admin/users"]');
      return { hasAdminNav, hasUserManagement };
    }`
  }
})
```

## Form Interaction

### Login Form Testing

```typescript
// Navigate to login
CallMcpTool({
  server: "user-chrome-devtools",
  toolName: "navigate_page",
  arguments: {
    pageId: 1,
    url: "http://localhost:3000/sign-in"
  }
})

// Take snapshot to get input UIDs
CallMcpTool({
  server: "user-chrome-devtools",
  toolName: "take_snapshot",
  arguments: { pageId: 1 }
})

// Fill email field (use UID from snapshot)
CallMcpTool({
  server: "user-chrome-devtools",
  toolName: "fill",
  arguments: {
    pageId: 1,
    uid: "email-input-uid",
    value: "admin@thetell.com"
  }
})

// Fill password field
CallMcpTool({
  server: "user-chrome-devtools",
  toolName: "fill",
  arguments: {
    pageId: 1,
    uid: "password-input-uid",
    value: "password123"
  }
})

// Click submit button
CallMcpTool({
  server: "user-chrome-devtools",
  toolName: "click",
  arguments: {
    pageId: 1,
    uid: "submit-button-uid"
  }
})

// Wait for redirect after login
CallMcpTool({
  server: "user-chrome-devtools",
  toolName: "wait_for",
  arguments: {
    pageId: 1,
    text: ["Dashboard", "Welcome"],
    timeout: 15000
  }
})
```

### Filter/Form Testing

```typescript
// Test signal filters
CallMcpTool({
  server: "user-chrome-devtools",
  toolName: "navigate_page",
  arguments: {
    pageId: 1,
    url: "http://localhost:3000/dashboard/signals"
  }
})

// Take snapshot to find filter controls
CallMcpTool({
  server: "user-chrome-devtools",
  toolName: "take_snapshot",
  arguments: { pageId: 1 }
})

// Select sentiment filter (use UID from snapshot)
CallMcpTool({
  server: "user-chrome-devtools",
  toolName: "fill",
  arguments: {
    pageId: 1,
    uid: "sentiment-select-uid",
    value: "NEGATIVE"
  }
})

// Wait for results to update
CallMcpTool({
  server: "user-chrome-devtools",
  toolName: "wait_for",
  arguments: {
    pageId: 1,
    timeout: 5000
  }
})

// Verify filtered results
CallMcpTool({
  server: "user-chrome-devtools",
  toolName: "evaluate_script",
  arguments: {
    pageId: 1,
    function: `() => {
      const signals = document.querySelectorAll('[data-testid="signal-card"]');
      return {
        count: signals.length,
        allNegative: Array.from(signals).every(s => 
          s.querySelector('[data-sentiment]')?.getAttribute('data-sentiment') === 'NEGATIVE'
        )
      };
    }`
  }
})
```

## Data Extraction

### Extract Table Data

```typescript
// Navigate to analytics page
CallMcpTool({
  server: "user-chrome-devtools",
  toolName: "navigate_page",
  arguments: {
    pageId: 1,
    url: "http://localhost:3000/dashboard/analytics"
  }
})

// Extract table data
CallMcpTool({
  server: "user-chrome-devtools",
  toolName: "evaluate_script",
  arguments: {
    pageId: 1,
    function: `() => {
      const tables = document.querySelectorAll('table');
      return Array.from(tables).map(table => {
        const headers = Array.from(table.querySelectorAll('th')).map(th => 
          th.textContent?.trim()
        );
        const rows = Array.from(table.querySelectorAll('tbody tr')).map(tr => {
          const cells = Array.from(tr.querySelectorAll('td')).map(td => 
            td.textContent?.trim()
          );
          return Object.fromEntries(headers.map((h, i) => [h, cells[i]]));
        });
        return { headers, rows: rows.slice(0, 10) };
      });
    }`
  }
})
```

### Extract Signal Metrics

```typescript
CallMcpTool({
  server: "user-chrome-devtools",
  toolName: "evaluate_script",
  arguments: {
    pageId: 1,
    function: `() => {
      const cards = document.querySelectorAll('[data-testid="signal-card"]');
      return Array.from(cards).map(card => ({
        title: card.querySelector('h2, h3')?.textContent?.trim(),
        source: card.querySelector('[data-source-type]')?.getAttribute('data-source-type'),
        sentiment: card.querySelector('[data-sentiment]')?.getAttribute('data-sentiment'),
        confidence: parseFloat(card.querySelector('[data-confidence]')?.textContent || '0'),
        company: card.querySelector('[data-company]')?.textContent?.trim(),
        timestamp: card.querySelector('time')?.getAttribute('datetime')
      }));
    }`
  }
})
```

## Debugging

### Check Console Errors

```typescript
// After page load, check for errors
CallMcpTool({
  server: "user-chrome-devtools",
  toolName: "list_console_messages",
  arguments: {
    pageId: 1,
    types: ["error", "warning"]
  }
})

// Get specific error details
CallMcpTool({
  server: "user-chrome-devtools",
  toolName: "get_console_message",
  arguments: {
    pageId: 1,
    messageId: 123
  }
})
```

### Inspect Network Requests

```typescript
// List all network requests
CallMcpTool({
  server: "user-chrome-devtools",
  toolName: "list_network_requests",
  arguments: {
    pageId: 1,
    resourceTypes: ["xhr", "fetch"]
  }
})

// Get specific API request details
CallMcpTool({
  server: "user-chrome-devtools",
  toolName: "get_network_request",
  arguments: {
    pageId: 1,
    requestId: 456
  }
})
```

### Visual Debugging

```typescript
// Take screenshot for visual verification
CallMcpTool({
  server: "user-chrome-devtools",
  toolName: "take_screenshot",
  arguments: {
    pageId: 1,
    fullPage: true
  }
})

// Resize viewport for responsive testing
CallMcpTool({
  server: "user-chrome-devtools",
  toolName: "resize_page",
  arguments: {
    pageId: 1,
    width: 375,
    height: 667
  }
})
```

## Common Patterns

### Wait for Dynamic Content

```typescript
// Wait for specific text
CallMcpTool({
  server: "user-chrome-devtools",
  toolName: "wait_for",
  arguments: {
    pageId: 1,
    text: ["Loading complete", "No signals found"],
    timeout: 10000
  }
})

// Wait for element with retry
CallMcpTool({
  server: "user-chrome-devtools",
  toolName: "evaluate_script",
  arguments: {
    pageId: 1,
    function: `async () => {
      for (let i = 0; i < 10; i++) {
        const el = document.querySelector('[data-testid="signal-list"]');
        if (el && el.children.length > 0) {
          return { found: true, count: el.children.length };
        }
        await new Promise(r => setTimeout(r, 1000));
      }
      return { found: false };
    }`
  }
})
```

### Scroll and Load More

```typescript
// Scroll to load lazy content
CallMcpTool({
  server: "user-chrome-devtools",
  toolName: "evaluate_script",
  arguments: {
    pageId: 1,
    function: `async () => {
      const initialCount = document.querySelectorAll('[data-testid="signal-card"]').length;
      for (let i = 0; i < 5; i++) {
        window.scrollBy(0, window.innerHeight);
        await new Promise(r => setTimeout(r, 1000));
      }
      const finalCount = document.querySelectorAll('[data-testid="signal-card"]').length;
      return { initial: initialCount, final: finalCount };
    }`
  }
})
```

## Anti-Patterns

### 1. Wrong Tool Name Format

```typescript
// WRONG
CallMcpTool({
  server: "user-chrome-devtools",
  toolName: "user-chrome-devtools-navigate_page"
})

// CORRECT
CallMcpTool({
  server: "user-chrome-devtools",
  toolName: "navigate_page"
})
```

### 2. Missing pageId

```typescript
// WRONG - missing pageId
CallMcpTool({
  server: "user-chrome-devtools",
  toolName: "take_snapshot",
  arguments: {}
})

// CORRECT
CallMcpTool({
  server: "user-chrome-devtools",
  toolName: "take_snapshot",
  arguments: { pageId: 1 }
})
```

### 3. Using Stale UIDs

```typescript
// WRONG - using old UID
CallMcpTool({
  server: "user-chrome-devtools",
  toolName: "click",
  arguments: { pageId: 1, uid: "old-uid" }
})

// CORRECT - take fresh snapshot first
CallMcpTool({
  server: "user-chrome-devtools",
  toolName: "take_snapshot",
  arguments: { pageId: 1 }
})
// Then use UID from new snapshot
```

### 4. Not Checking Authentication

```typescript
// WRONG - assuming logged in
CallMcpTool({
  server: "user-chrome-devtools",
  toolName: "navigate_page",
  arguments: { pageId: 1, url: "http://localhost:3000/dashboard" }
})
// Then immediately extracting data without checking if redirected to login

// CORRECT - verify authentication
CallMcpTool({
  server: "user-chrome-devtools",
  toolName: "evaluate_script",
  arguments: {
    pageId: 1,
    function: "() => window.location.href"
  }
})
// Check if URL contains "/sign-in" before proceeding
```

## Verification Checklist

Before completing browser testing:

- [ ] Listed pages to get valid pageId
- [ ] Verified authentication state (not redirected to login)
- [ ] Took snapshot to understand DOM structure
- [ ] Used fresh UIDs from latest snapshot
- [ ] Checked console for errors
- [ ] Checked network requests for failures
- [ ] Took screenshot for visual verification
- [ ] Extracted data matches expected structure
