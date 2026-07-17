"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DeepAgentSessionSidebar } from "./deep-agent-session-sidebar";
import { DeepAgentExport } from "./deep-agent-export";
import { DeepAgentApprovalDialog } from "./deep-agent-approval-dialog";
import { DeepAgentTimeline } from "./deep-agent-timeline";
import { DeepAgentShareButton } from "./deep-agent-share-button";
import { logger } from "@/lib/logger";
import type { DeepAgentSession, DeepAgentMessage, DeepAgentApproval } from "@/lib/deepagent/types";

interface DeepAgentChatLayoutProps {
  children: React.ReactNode;
  sessions: DeepAgentSession[];
  selectedSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onNewSession: () => void;
  onDeleteSession?: (sessionId: string) => void;
  messages?: DeepAgentMessage[];
}

export function DeepAgentChatLayout({
  children,
  sessions,
  selectedSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  messages = [],
}: DeepAgentChatLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<DeepAgentApproval | null>(null);
  const [isProcessingApproval, setIsProcessingApproval] = useState(false);

  const selectedSession = sessions.find((s) => s.id === selectedSessionId) || null;

  const handleApprove = async (approvalId: string) => {
    setIsProcessingApproval(true);
    try {
      const response = await fetch(`/api/v1/admin/deepagent/approvals/${approvalId}`, {
credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "approved" }),
      });
      
      if (!response.ok) {
        throw new Error("Failed to approve");
      }
      
      setPendingApproval(null);
    } catch (error) {
      logger.error("deepagent.approval_failed", { approvalId, error: String(error) });
    } finally {
      setIsProcessingApproval(false);
    }
  };

  const handleReject = async (approvalId: string) => {
    setIsProcessingApproval(true);
    try {
      const response = await fetch(`/api/v1/admin/deepagent/approvals/${approvalId}`, {
credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "rejected" }),
      });
      
      if (!response.ok) {
        throw new Error("Failed to reject");
      }
      
      setPendingApproval(null);
    } catch (error) {
      logger.error("deepagent.rejection_failed", { approvalId, error: String(error) });
    } finally {
      setIsProcessingApproval(false);
    }
  };

  return (
    <div className="flex flex-col sm:flex-row h-[calc(100vh-10rem)] bg-background overflow-hidden">
      {/* Desktop Sidebar */}
      <div
        className={cn(
          "transition-all duration-300 ease-in-out border-b sm:border-b-0 sm:border-r border-border",
          sidebarCollapsed ? "w-0 sm:w-0" : "w-full sm:w-[260px] lg:w-[280px]",
          "hidden sm:block"
        )}
      >
        {!sidebarCollapsed && (
          <DeepAgentSessionSidebar
            sessions={sessions}
            selectedSessionId={selectedSessionId}
            onSelectSession={onSelectSession}
            onNewSession={onNewSession}
            onDeleteSession={onDeleteSession}
          />
        )}
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header with sidebar toggle */}
        <div className="border-b border-border px-2 sm:px-4 py-2 flex items-center gap-2">
          {/* Mobile: always show hamburger to open session sidebar */}
          <Button
            variant="ghost"
            size="sm"
            className="sm:hidden"
            onClick={() => setMobileSidebarOpen(true)}
            aria-label="Open session sidebar"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </Button>
          {/* Desktop: toggle collapse */}
          <Button
            variant="ghost"
            size="sm"
            className="hidden sm:flex"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </Button>
          <div className="flex-1" />
          {selectedSession && (
            <>
              <DeepAgentTimeline sessionId={selectedSessionId} />
              <DeepAgentShareButton sessionId={selectedSessionId} />
              <DeepAgentExport session={selectedSession} messages={messages} />
            </>
          )}
        </div>

        {/* Chat content */}
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {children}
          </div>
        </div>
      </div>

      {/* Mobile sidebar overlay */}
      {mobileSidebarOpen && (
        <div className="sm:hidden fixed inset-0 z-50 bg-background flex">
          <div className="w-[260px] max-w-[85vw]">
            <DeepAgentSessionSidebar
              sessions={sessions}
              selectedSessionId={selectedSessionId}
              onSelectSession={(id) => {
                onSelectSession(id);
                setMobileSidebarOpen(false);
              }}
              onNewSession={() => {
                onNewSession();
                setMobileSidebarOpen(false);
              }}
              onDeleteSession={onDeleteSession}
            />
          </div>
          <div className="flex-1 flex items-start justify-end p-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMobileSidebarOpen(false)}
            >
              <PanelLeftClose className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Approval Dialog */}
      <DeepAgentApprovalDialog
        approval={pendingApproval}
        onApprove={handleApprove}
        onReject={handleReject}
        isProcessing={isProcessingApproval}
      />
    </div>
  );
}
