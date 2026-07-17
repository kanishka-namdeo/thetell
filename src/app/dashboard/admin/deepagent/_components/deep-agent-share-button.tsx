"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Share2, Copy, Check, X, Link as LinkIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";

interface ShareLink {
  id: string;
  token: string;
  shareUrl: string;
  expiresAt: string;
  createdAt: string;
  revokedAt: string | null;
  isActive: boolean;
}

interface DeepAgentShareButtonProps {
  sessionId: string | null;
  className?: string;
}

export function DeepAgentShareButton({
  sessionId,
  className,
}: DeepAgentShareButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [shareLinks, setShareLinks] = useState<ShareLink[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [expiresInHours, setExpiresInHours] = useState(24);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const shareControllerRef = useRef<AbortController | null>(null);

  const loadShareLinks = async () => {
    if (!sessionId) return;

    shareControllerRef.current?.abort();
    const controller = new AbortController();
    shareControllerRef.current = controller;

    setIsLoading(true);
    try {
      const response = await fetch(`/api/v1/admin/deepagent/sessions/${sessionId}/share`, {
credentials: "include", signal: controller.signal });
      if (response.ok) {
        const data = await response.json();
        setShareLinks(data.data);
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      logger.error("deepagent.share.load_failed", { sessionId, error: String(error) });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateShare = async () => {
    if (!sessionId) return;

    setIsCreating(true);
    try {
      const response = await fetch(`/api/v1/admin/deepagent/sessions/${sessionId}/share`, {
credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expiresInHours }),
      });

      if (response.ok) {
        await loadShareLinks();
      }
    } catch (error) {
      logger.error("deepagent.share.create_failed", { sessionId, error: String(error) });
    } finally {
      setIsCreating(false);
    }
  };

  const handleRevokeShare = async (shareId: string) => {
    if (!sessionId) return;

    try {
      const response = await fetch(
        `/api/v1/admin/deepagent/sessions/${sessionId}/share?shareId=${shareId}`,
        {
credentials: "include", method: "DELETE" }
      );

      if (response.ok) {
        await loadShareLinks();
      }
    } catch (error) {
      logger.error("deepagent.share.revoke_failed", { sessionId, shareId, error: String(error) });
    }
  };

  const handleCopyLink = async (token: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedToken(token);
      copyTimeoutRef.current = setTimeout(() => setCopiedToken(null), 2000);
    } catch (error) {
      logger.error("clipboard.copy.failed", { error: String(error) });
    }
  };

  // Cleanup timeout and abort controller on unmount
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
      shareControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (isOpen && sessionId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadShareLinks();
    }
  }, [isOpen, sessionId]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  if (!sessionId) return null;

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(true)}
        className={cn("h-8", className)}
        title="Share conversation"
      >
        <Share2 className="h-3.5 w-3.5 sm:mr-1.5" />
        <span className="hidden sm:inline">Share</span>
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Share Conversation</DialogTitle>
            <DialogDescription>
              Create shareable links to this conversation. Anyone with the link can view it.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Create new share link */}
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <Label htmlFor="expires">Expires in</Label>
                  <select
                    id="expires"
                    value={expiresInHours}
                    onChange={(e) => setExpiresInHours(Number(e.target.value))}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value={1}>1 hour</option>
                    <option value={6}>6 hours</option>
                    <option value={24}>24 hours</option>
                    <option value={48}>2 days</option>
                    <option value={168}>7 days</option>
                    <option value={720}>30 days</option>
                  </select>
                </div>
                <Button
                  onClick={handleCreateShare}
                  disabled={isCreating}
                  className="mt-6"
                >
                  <LinkIcon className="h-4 w-4 mr-2" />
                  {isCreating ? "Creating..." : "Create Link"}
                </Button>
              </div>
            </div>

            {/* Existing share links */}
            <div className="space-y-2">
              <Label>Active Share Links</Label>
              {isLoading ? (
                <div className="text-sm text-muted-foreground text-center py-4">
                  Loading...
                </div>
              ) : shareLinks.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-4">
                  No share links created yet
                </div>
              ) : (
                <ScrollArea className="h-[300px] pr-3">
                  <div className="space-y-2">
                    {shareLinks.map((share) => (
                      <div
                        key={share.id}
                        className="flex items-center gap-2 p-3 border rounded-lg"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant={share.isActive ? "default" : "secondary"}>
                              {share.isActive ? "Active" : "Expired"}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              Expires {formatDate(share.expiresAt)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Input
                              value={share.shareUrl}
                              readOnly
                              className="h-8 text-xs font-mono"
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleCopyLink(share.token, share.shareUrl)}
                              className="shrink-0"
                            >
                              {copiedToken === share.token ? (
                                <>
                                  <Check className="h-3 w-3" />
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3 w-3" />
                                </>
                              )}
                            </Button>
                          </div>
                        </div>
                        {share.isActive && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleRevokeShare(share.id)}
                            className="shrink-0"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
