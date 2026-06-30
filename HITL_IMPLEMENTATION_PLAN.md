# DeepAgent HITL (Human-in-the-Loop) Implementation Plan

## Overview

Add approval gates before dangerous operations (file writes, edits, shell execution) in the DeepAgent chat interface. This prevents accidental or malicious code changes by requiring explicit admin approval before execution.

## Architecture

```
User Input → Agent Stream → Tool Call Detected
                                    ↓
                          Is tool dangerous?
                                    ↓
                    YES → Interrupt & Send SSE Event
                                    ↓
                    Frontend Shows Approval Dialog
                                    ↓
                    User Approves/Rejects
                                    ↓
                    Backend Receives Decision
                                    ↓
                    Agent Resumes Execution
```

## Phase 1: Database Schema

### Add Approval Model

File: `prisma/schema.prisma`

```prisma
model DeepAgentApproval {
  id          String   @id @default(cuid())
  sessionId   String
  messageId   String
  toolName    String
  toolInput   Json
  status      String   @default("pending") // pending, approved, rejected
  decidedBy   String?  // userId who decided
  decidedAt   DateTime?
  createdAt   DateTime @default(now())
  
  session DeepAgentSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  
  @@index([sessionId])
  @@index([status])
  @@index([createdAt])
}
```

Add relation to `DeepAgentSession`:

```prisma
model DeepAgentSession {
  // ... existing fields ...
  approvals DeepAgentApproval[]
}
```

### Migration

```bash
pnpm prisma migrate dev --name add-deepagent-approvals
```

## Phase 2: Backend - Agent Configuration

### Configure interruptOn

File: `src/lib/deepagent/backend.ts`

```typescript
const agent = createDeepAgent({
  model,
  backend,
  systemPrompt,
  interruptOn: {
    write_file: true,
    edit_file: true,
    execute: true,
  },
});
```

### Handle Interrupts in Stream

File: `src/lib/deepagent/backend.ts`

Modify `streamDeepAgent` to detect interrupts and yield approval events:

```typescript
for await (const event of run) {
  if (event.type === "interrupt") {
    // Save approval request to DB
    const approval = await prisma.deepAgentApproval.create({
      data: {
        sessionId,
        messageId: currentMessageId,
        toolName: event.toolName,
        toolInput: event.toolInput,
        status: "pending",
      },
    });
    
    yield {
      type: "approval_request",
      approvalId: approval.id,
      toolName: event.toolName,
      toolInput: event.toolInput,
    };
    
    // Wait for approval decision
    const decision = await waitForApproval(approval.id);
    
    // Resume with decision
    if (decision === "approved") {
      await run.resume({ toolResult: { success: true } });
    } else {
      await run.resume({ toolResult: { success: false, error: "Rejected by user" } });
    }
  }
  
  // ... existing event handling ...
}
```

### Approval API Endpoints

File: `src/app/api/v1/admin/deepagent/approvals/[id]/route.ts`

```typescript
// POST /api/v1/admin/deepagent/approvals/[id]
// Body: { decision: "approved" | "rejected" }

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!requireAdmin(session)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const { decision } = await req.json();
  
  const approval = await prisma.deepAgentApproval.update({
    where: { id: params.id },
    data: {
      status: decision,
      decidedBy: session.user.id,
      decidedAt: new Date(),
    },
  });

  // Signal the waiting stream to resume
  approvalResolvers[params.id]?.(decision);

  return NextResponse.json({ success: true });
}
```

### Approval Wait Mechanism

File: `src/lib/deepagent/approval-waiter.ts`

```typescript
const approvalResolvers: Record<string, (decision: string) => void> = {};

export function waitForApproval(approvalId: string): Promise<string> {
  return new Promise((resolve) => {
    approvalResolvers[approvalId] = resolve;
  });
}

export function resolveApproval(approvalId: string, decision: string) {
  approvalResolvers[approvalId]?.(decision);
  delete approvalResolvers[approvalId];
}
```

## Phase 3: Frontend - Approval UI

### New Component: Approval Dialog

File: `src/app/dashboard/admin/deepagent/_components/deep-agent-approval-dialog.tsx`

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { AlertTriangle, Check, X } from "lucide-react";

interface ApprovalDialogProps {
  open: boolean;
  toolName: string;
  toolInput: any;
  onApprove: () => void;
  onReject: () => void;
}

export function DeepAgentApprovalDialog({
  open,
  toolName,
  toolInput,
  onApprove,
  onReject,
}: ApprovalDialogProps) {
  return (
    <Dialog open={open}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            Approval Required
          </DialogTitle>
          <DialogDescription>
            DeepAgent wants to execute a dangerous operation
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <div className="text-sm font-medium text-muted-foreground">
              Operation
            </div>
            <div className="text-sm font-mono bg-muted p-2 rounded mt-1">
              {toolName}
            </div>
          </div>

          <div>
            <div className="text-sm font-medium text-muted-foreground">
              Input
            </div>
            <pre className="text-xs font-mono bg-muted p-3 rounded mt-1 overflow-auto max-h-64">
              {JSON.stringify(toolInput, null, 2)}
            </pre>
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onReject}>
              <X className="h-4 w-4 mr-2" />
              Reject
            </Button>
            <Button variant="default" onClick={onApprove}>
              <Check className="h-4 w-4 mr-2" />
              Approve
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

### Update Message List

File: `src/app/dashboard/admin/deepagent/_components/deep-agent-message-list.tsx`

Add state for pending approvals:

```tsx
const [pendingApproval, setPendingApproval] = useState<{
  approvalId: string;
  toolName: string;
  toolInput: any;
} | null>(null);
```

Handle approval_request SSE event in parent component and pass to message list.

### Update Chat Layout

File: `src/app/dashboard/admin/deepagent/_components/deep-agent-chat-layout.tsx`

Add approval dialog and handle approval events:

```tsx
const [pendingApproval, setPendingApproval] = useState<...>(null);

const handleApprovalRequest = (event: ApprovalRequestEvent) => {
  setPendingApproval({
    approvalId: event.approvalId,
    toolName: event.toolName,
    toolInput: event.toolInput,
  });
};

const handleApprove = async () => {
  if (!pendingApproval) return;
  
  await fetch(`/api/v1/admin/deepagent/approvals/${pendingApproval.approvalId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision: "approved" }),
  });
  
  setPendingApproval(null);
};

const handleReject = async () => {
  if (!pendingApproval) return;
  
  await fetch(`/api/v1/admin/deepagent/approvals/${pendingApproval.approvalId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision: "rejected" }),
  });
  
  setPendingApproval(null);
};

return (
  <>
    {/* ... existing layout ... */}
    
    <DeepAgentApprovalDialog
      open={!!pendingApproval}
      toolName={pendingApproval?.toolName || ""}
      toolInput={pendingApproval?.toolInput}
      onApprove={handleApprove}
      onReject={handleReject}
    />
  </>
);
```

### Update Stream Handler

File: `src/lib/deepagent/stream-handler.ts`

Add extraction function for approval events:

```typescript
export function extractApprovalFromChunk(chunk: unknown): ApprovalRequest | null {
  if (chunk && typeof chunk === "object") {
    const data = chunk as Record<string, unknown>;
    if (data.type === "approval_request") {
      return {
        approvalId: data.approvalId as string,
        toolName: data.toolName as string,
        toolInput: data.toolInput,
      };
    }
  }
  return null;
}
```

### Update Types

File: `src/lib/deepagent/types.ts`

```typescript
export interface ApprovalRequest {
  approvalId: string;
  toolName: string;
  toolInput: unknown;
}

export interface DeepAgentMessage {
  // ... existing fields ...
  pendingApproval?: ApprovalRequest;
}
```

## Phase 4: Stream Route Updates

File: `src/app/api/v1/admin/deepagent/stream/route.ts`

Handle approval_request events:

```typescript
const approval = extractApprovalFromChunk(event);
if (approval) {
  controller.enqueue(
    encoder.encode(
      formatSSE({
        event: "approval_request",
        data: approval,
      })
    )
  );
  continue;
}
```

## Phase 5: Testing

### Manual Testing Checklist

1. **File Write Approval**
   - Ask agent to create a new file
   - Verify approval dialog appears
   - Approve → file should be created
   - Reject → file should NOT be created

2. **File Edit Approval**
   - Ask agent to edit an existing file
   - Verify approval dialog appears
   - Approve → file should be edited
   - Reject → file should NOT be edited

3. **Shell Execution Approval**
   - Ask agent to run a command (e.g., `ls`)
   - Verify approval dialog appears
   - Approve → command should execute
   - Reject → command should NOT execute

4. **Multiple Approvals**
   - Ask agent to perform multiple operations
   - Verify each requires separate approval
   - Verify approvals can be granted/rejected independently

5. **Session Persistence**
   - Refresh page during pending approval
   - Verify approval state is preserved
   - Verify user can still approve/reject after refresh

### Edge Cases

- What if user closes browser during approval?
- What if approval times out (e.g., user walks away)?
- What if multiple approvals are pending simultaneously?
- What if user rejects but agent continues anyway (bug)?

## Phase 6: Optional Enhancements

### Timeout Mechanism

Add auto-rejection after N minutes:

```typescript
// In approval-waiter.ts
export function waitForApproval(approvalId: string, timeoutMs = 300_000): Promise<string> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve("timeout");
    }, timeoutMs);
    
    approvalResolvers[approvalId] = (decision) => {
      clearTimeout(timeout);
      resolve(decision);
    };
  });
}
```

### Approval History

Add UI to view past approvals:

- Sidebar tab showing approval history
- Filter by status (approved/rejected/timeout)
- Show who approved and when

### Bulk Approval

Allow approving multiple pending operations at once (if agent requests multiple file writes).

### Approval Policies

Configure which tools require approval:

- Settings page to toggle approval requirements
- Per-user approval permissions
- Auto-approve for safe operations (e.g., read-only commands)

## Implementation Order

1. ✅ Backend hardening (env restrictions, timeout, maxOutputBytes) - DONE
2. Database schema + migration
3. Backend interrupt handling + approval API
4. Frontend approval dialog
5. Stream handler updates
6. Integration testing
7. Optional enhancements

## Security Considerations

- Approval requests must be scoped to the session owner
- Only admins can approve (already enforced by admin-only route)
- Approval decisions must be logged in audit trail
- Timeout prevents indefinite blocking
- Rejected operations must not execute

## Performance Considerations

- Approval waiter uses in-memory promises (not DB polling)
- Approval state persisted to DB for crash recovery
- SSE connection stays open during approval wait
- Frontend shows loading state during approval

## Files to Create/Modify

### New Files
- `src/lib/deepagent/approval-waiter.ts`
- `src/app/api/v1/admin/deepagent/approvals/[id]/route.ts`
- `src/app/dashboard/admin/deepagent/_components/deep-agent-approval-dialog.tsx`
- `prisma/migrations/YYYYMMDDHHMMSS_add_deepagent_approvals/migration.sql`

### Modified Files
- `prisma/schema.prisma`
- `src/lib/deepagent/backend.ts`
- `src/lib/deepagent/types.ts`
- `src/lib/deepagent/stream-handler.ts`
- `src/app/api/v1/admin/deepagent/stream/route.ts`
- `src/app/dashboard/admin/deepagent/_components/deep-agent-chat-layout.tsx`
- `src/app/dashboard/admin/deepagent/_components/deep-agent-message-list.tsx`

## Success Criteria

- [ ] Dangerous operations (write_file, edit_file, execute) require approval
- [ ] Approval dialog shows tool name and input clearly
- [ ] User can approve or reject operations
- [ ] Rejected operations do not execute
- [ ] Approved operations execute normally
- [ ] Multiple pending approvals handled correctly
- [ ] Approval state persists across page refreshes
- [ ] Audit log records all approval decisions
- [ ] No performance degradation in streaming
