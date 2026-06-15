---
name: use-chrome-devtools-mcp
description: >-
  Use Chrome DevTools MCP (user-chrome-devtools) for browser automation, testing, and debugging.
  Covers correct tool invocation, parameter requirements, page management, snapshot vs screenshot,
  script evaluation, and common anti-patterns to avoid. Use when performing browser automation,
  UI testing, debugging web pages, interacting with web elements, navigating pages, or when the
  user mentions browser testing, chrome devtools MCP, or web automation.
disable-model-invocation: false
---

# Use Chrome DevTools MCP

## Overview

The `user-chrome-devtools` MCP provides Chrome DevTools Protocol access for browser automation. It uses **pageId-based targeting** and **uid-based element interaction** (from snapshots). This is distinct from `cursor-ide-browser` which uses different tool names and patterns.

## Tool Inventory

| Tool | Purpose | Required Params |
|------|---------|-----------------|
| `list_pages` | List open browser pages | none |
| `navigate_page` | Navigate to URL, back, forward, reload | `pageId` |
| `new_page` | Open a new page/tab | `url` |
| `close_page` | Close a page | `pageId` |
| `select_page` | Select a page as active | `pageId` |
| `take_snapshot` | Get a11y tree snapshot with uids | `pageId` |
| `take_screenshot` | Visual screenshot | `pageId` |
| `click` | Click element by uid | `uid`, `pageId` |
| `click_at` | Click at coordinates | `x`, `y`, `pageId` |
| `fill` | Fill input/select by uid | `uid`, `value`, `pageId` |
| `fill_form` | Fill multiple form fields | `pageId` |
| `type_text` | Type text into element | `uid`, `pageId` |
| `press_key` | Press keyboard key | `key`, `pageId` |
| `hover` | Hover over element | `uid`, `pageId` |
| `drag` | Drag and drop | `uid`, `targetUid`, `pageId` |
| `evaluate_script` | Run JavaScript | `function`, `pageId` |
| `wait_for` | Wait for element/state | `pageId` |
| `upload_file` | Upload file to input | `uid`, `filePath`, `pageId` |
| `handle_dialog` | Handle alert/confirm/prompt | `action`, `pageId` |
| `resize_page` | Resize viewport | `width`, `height`, `pageId` |
| `emulate` | Emulate device/CPU/network | `pageId` |
| `list_console_messages` | Get console logs | `pageId` |
| `list_network_requests` | Get network requests | `pageId` |
| `get_console_message` | Get specific console message | `messageId`, `pageId` |
| `get_network_request` | Get specific network request | `requestId`, `pageId` |
| `take_heapsnapshot` | Take heap snapshot | `pageId` |
| `get_heapsnapshot_*` | Analyze heap snapshots | varies |
| `performance_*` | Performance tracing | varies |
| `lighthouse_audit` | Run Lighthouse audit | `url` |
| `screencast_*` | Start/stop screencast | varies |
| `execute_3p_developer_tool` | Run 3rd party devtool | varies |
| `list_3p_developer_tools` | List available 3rd party tools | none |

## CRITICAL: Correct Tool Invocation

### NEVER Use These Patterns

```json
// WRONG - hyphenated toolName with server prefix
{"server": "user-chrome-devtools", "toolName": "user-chrome-devtools-navigate_page"}

// WRONG - hyphenated toolName
{"server": "user-chrome-devtools", "toolName": "navigate-page"}

// WRONG - using cursor-ide-browser tools thinking they're chrome-devtools
{"server": "cursor-ide-browser", "toolName": "browser_navigate"}
```

### ALWAYS Use This Pattern

```json
// CORRECT - clean toolName, correct server
{"server": "user-chrome-devtools", "toolName": "navigate_page", "arguments": {"pageId": 1, "type": "url", "url": "http://localhost:3000"}}
```

**Key rules:**
- `toolName` uses **snake_case** (underscores): `navigate_page`, `take_snapshot`, `evaluate_script`
- `server` is exactly `"user-chrome-devtools"`
- `cursor-ide-browser` is a **different MCP** with different tools (`browser_navigate`, `browser_snapshot`, etc.) - do NOT mix them

## Page Management Workflow

### Step 1: Always List Pages First

```
CallMcpTool(server="user-chrome-devtools", toolName="list_pages", arguments={})
```

This returns page IDs and URLs. Use the correct `pageId` for all subsequent calls.

### Step 2: Navigate or Create New Page

```
// Navigate existing page
CallMcpTool(server="user-chrome-devtools", toolName="navigate_page", arguments={
  "pageId": 1,
  "type": "url",
  "url": "http://localhost:3000/login"
})

// Or create new page
CallMcpTool(server="user-chrome-devtools", toolName="new_page", arguments={
  "url": "http://localhost:3000/login"
})
```

### Step 3: Take Snapshot to Get UIDs

```
CallMcpTool(server="user-chrome-devtools", toolName="take_snapshot", arguments={
  "pageId": 1
})
```

The snapshot returns elements with `uid` values. Use these uids for `click`, `fill`, `hover`, `drag`, etc.

### Step 4: Interact Using UIDs

```
// Click
CallMcpTool(server="user-chrome-devtools", toolName="click", arguments={
  "uid": "element-uid-from-snapshot",
  "pageId": 1,
  "includeSnapshot": true
})

// Fill input
CallMcpTool(server="user-chrome-devtools", toolName="fill", arguments={
  "uid": "input-uid-from-snapshot",
  "value": "user@example.com",
  "pageId": 1
})

// Press key
CallMcpTool(server="user-chrome-devtools", toolName="press_key", arguments={
  "key": "Enter",
  "pageId": 1
})
```

## Parameter Requirements

### Required Parameters by Tool

| Tool | Required | Notes |
|------|----------|-------|
| `navigate_page` | `pageId` | `type` defaults to "url" if `url` provided |
| `click` | `uid`, `pageId` | |
| `fill` | `uid`, `value`, `pageId` | Use "true"/"false" for checkboxes |
| `click_at` | `x`, `y`, `pageId` | |
| `evaluate_script` | `function`, `pageId` | Function must be string, returns JSON |
| `take_snapshot` | `pageId` | |
| `take_screenshot` | `pageId` | |
| `wait_for` | `pageId` | |
| `press_key` | `key`, `pageId` | |
| `hover` | `uid`, `pageId` | |
| `drag` | `uid`, `targetUid`, `pageId` | |
| `upload_file` | `uid`, `filePath`, `pageId` | |
| `handle_dialog` | `action`, `pageId` | "accept", "dismiss", or prompt text |

### PageId is Almost Always Required

**Almost every tool call requires `pageId`**. Get it from `list_pages` first. Never guess page IDs.

## Snapshot vs Screenshot

| Aspect | `take_snapshot` | `take_screenshot` |
|--------|-----------------|-------------------|
| Output | Text a11y tree with uids | Image |
| Use for | Finding elements to interact with | Visual verification |
| Element IDs | Provides `uid` for click/fill | No element IDs |
| Preference | **Always prefer snapshot** for automation | Use only for visual checks |

**Rule**: Take a snapshot BEFORE any click/fill/hover. Use the uid from the snapshot. Always use the latest snapshot.

## evaluate_script Usage

```
CallMcpTool(server="user-chrome-devtools", toolName="evaluate_script", arguments={
  "pageId": 1,
  "function": "() => {\n  return document.title\n}"
})
```

- Function must be a **string** containing JavaScript
- Return values must be **JSON-serializable**
- Can accept element uids as `args` parameter
- Use `filePath` to save large outputs to disk

## Common Anti-Patterns (NEVER DO)

### 1. Wrong Tool Name Format

```
// WRONG
{"toolName": "user-chrome-devtools-navigate_page"}
{"toolName": "navigate-page"}

// CORRECT
{"toolName": "navigate_page"}
```

### 2. Wrong Server Confusion

```
// WRONG - cursor-ide-browser is a DIFFERENT MCP
{"server": "cursor-ide-browser", "toolName": "browser_navigate"}

// CORRECT - use user-chrome-devtools for DevTools protocol
{"server": "user-chrome-devtools", "toolName": "navigate_page"}
```

### 3. Missing pageId Parameter

```
// WRONG - missing pageId
{"toolName": "navigate_page", "arguments": {"url": "http://localhost:3000"}}

// CORRECT
{"toolName": "navigate_page", "arguments": {"pageId": 1, "type": "url", "url": "http://localhost:3000"}}
```

### 4. Using Stale UIDs

```
// WRONG - using uid from an old snapshot
{"toolName": "click", "arguments": {"uid": "old-uid-from-previous-snapshot", "pageId": 1}}

// CORRECT - take fresh snapshot first
{"toolName": "take_snapshot", "arguments": {"pageId": 1}}
// Then use uid from THIS snapshot's response
{"toolName": "click", "arguments": {"uid": "current-uid", "pageId": 1}}
```

### 5. Giving Up After Tool Failure

If a tool call fails:
1. Check the error message
2. Verify required parameters
3. Re-list pages to get current pageId
4. Take a fresh snapshot
5. Retry with correct parameters

**NEVER** abandon browser testing entirely after a correctable tool invocation mistake.

### 6. Assuming Tools Are Available

Before calling any chrome-devtools tool, verify the MCP server is connected and available. If tools are not available in the current context, state this clearly rather than trying wrong tool names.

## Recommended Workflow for Browser Testing

```
1. list_pages → get pageId(s)
2. navigate_page or new_page → load target URL
3. take_snapshot → get element uids
4. [Optional] take_screenshot → visual verification
5. click/fill/press_key → interact using uids
6. take_snapshot → verify page state changed
7. Repeat steps 5-6 for multi-step flows
8. list_console_messages → check for errors
9. list_network_requests → check for failed requests
```

## Debugging with Console and Network Tools

```
// Check console for errors
CallMcpTool(server="user-chrome-devtools", toolName="list_console_messages", arguments={
  "pageId": 1,
  "types": ["error", "warning"]
})

// Check network for failed requests
CallMcpTool(server="user-chrome-devtools", toolName="list_network_requests", arguments={
  "pageId": 1
})

// Get specific message/request details
CallMcpTool(server="user-chrome-devtools", toolName="get_console_message", arguments={
  "pageId": 1,
  "messageId": 123
})
```

## Quick Reference: Do This, Not That

| Do This | Not That |
|---------|----------|
| `{"server": "user-chrome-devtools", "toolName": "navigate_page"}` | `{"toolName": "user-chrome-devtools-navigate_page"}` |
| Always get `pageId` from `list_pages` first | Guess or hardcode pageId |
| `take_snapshot` before every interaction | Use stale uids from old snapshots |
| Verify MCP is available before calling | Assume tools exist in all contexts |
| Retry with corrected params on failure | Abandon browser testing after first error |
| Use `cursor-ide-browser` for `browser_*` tools | Mix `cursor-ide-browser` and `user-chrome-devtools` tools |
