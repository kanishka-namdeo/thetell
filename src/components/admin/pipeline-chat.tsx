"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { Radar, Square, CheckCircle, XCircle, MessageSquare, Play, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ChatMessage } from "@/components/admin/chat-message";
import { SourceBadge } from "@/components/admin/source-badge";
import { usePipelineStream, type DiscoveredSource } from "@/hooks/use-pipeline-stream";

type CompanyOption = { id: string; name: string; ticker: string | null };

interface PipelineChatProps {
  companyId?: string;
  onApply: (sources: DiscoveredSource[], sessionId: string | null) => void;
  onClose?: () => void;
}

export function PipelineChat({
  companyId: initialCompanyId,
  onApply,
  onClose,
}: PipelineChatProps) {
  const [inputCompanyName, setInputCompanyName] = useState("");
  const [selectedCompany, setSelectedCompany] = useState<CompanyOption | null>(null);
  const [effectiveCompanyId, setEffectiveCompanyId] = useState<string | undefined>(initialCompanyId);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/admin/companies/list")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (!cancelled && Array.isArray(data)) {
          setCompanies(data);
        }
      })
      .catch(() => {
        // ignore - list stays empty, manual entry still works
      })
      .finally(() => {
        if (!cancelled) setLoadingCompanies(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSelectCompany = (company: CompanyOption) => {
    setSelectedCompany(company);
    setInputCompanyName(company.name);
    setEffectiveCompanyId(company.id);
  };

  const handleManualInput = (value: string) => {
    setInputCompanyName(value);
    // If user edits away from the selected company's name, clear selection
    if (selectedCompany && value !== selectedCompany.name) {
      setSelectedCompany(null);
      setEffectiveCompanyId(initialCompanyId);
    }
  };

  const {
    events,
    sources,
    gaps,
    isLoading,
    error,
    sessionId,
    start,
    cancel,
    clear,
  } = usePipelineStream({
    companyName: inputCompanyName,
    companyId: effectiveCompanyId,
  });

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // Scroll when new events arrive
  React.useEffect(() => {
    scrollToBottom();
  }, [events, scrollToBottom]);

  const canStart = inputCompanyName.trim().length > 0;

  const handleStart = () => {
    if (!canStart) return;
    start();
  };

  const handleCancel = () => {
    cancel();
  };

  const handleApply = () => {
    if (sources.length > 0) {
      onApply(sources, sessionId);
    }
  };

  const handleDiscard = () => {
    clear();
    setInputCompanyName("");
    if (onClose) {
      onClose();
    }
  };

  const handleReset = () => {
    clear();
    setInputCompanyName("");
  };

  // Show initial state - company name input
  if (events.length === 0 && !isLoading) {
    return (
      <div className="flex flex-col h-[600px] bg-background border">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <Radar className="h-5 w-5" />
            <span className="font-medium">Pipeline Orchestrator</span>
          </div>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              <XCircle className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Content - Company Input */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-6">
          <div className="text-center space-y-2">
            <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground" />
            <h2 className="text-xl font-semibold">Discover Company Data Sources</h2>
            <p className="text-sm text-muted-foreground max-w-md">
              Enter a company name to discover RSS feeds, social profiles, SEC filings,
              job postings, and more using AI-powered MCP servers.
            </p>
          </div>

          <div className="w-full max-w-md space-y-4">
            <div className="space-y-2">
              <label htmlFor="companyName" className="text-sm font-medium">
                Company Name
              </label>
              <Input
                id="companyName"
                placeholder="e.g., Apple, Tesla, Microsoft"
                value={inputCompanyName}
                onChange={(e) => handleManualInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canStart) {
                    handleStart();
                  }
                }}
                autoFocus
              />
            </div>

            <Button
              onClick={handleStart}
              disabled={!canStart}
              className="w-full"
              size="lg"
            >
              <Play className="h-4 w-4 mr-2" />
              Start Discovery
            </Button>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Or select a tracked company</span>
                {loadingCompanies && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Loading
                  </span>
                )}
              </div>
              {companies.length > 0 ? (
                <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
                  {companies.map((company) => {
                    const isSelected = selectedCompany?.id === company.id;
                    return (
                      <Button
                        key={company.id}
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleSelectCompany(company)}
                        className={cn(
                          "justify-between h-auto py-2 px-3 font-normal",
                          isSelected &&
                            "border-primary bg-primary/10 text-primary ring-1 ring-primary"
                        )}
                      >
                        <span className="truncate">{company.name}</span>
                        {company.ticker && (
                          <Badge
                            variant={isSelected ? "default" : "outline"}
                            className="ml-2 text-[10px] px-1.5"
                          >
                            {company.ticker}
                          </Badge>
                        )}
                      </Button>
                    );
                  })}
                </div>
              ) : !loadingCompanies ? (
                <p className="text-xs text-muted-foreground">
                  No tracked companies yet. Type a name above to continue.
                </p>
              ) : null}
            </div>
          </div>

          <div className="text-xs text-muted-foreground text-center space-y-1">
            <p>Sources discovered include:</p>
            <div className="flex flex-wrap gap-1 justify-center">
              {["SEC Filings", "GitHub", "News", "Job Postings", "Patents", "Court Records"].map((s) => (
                <Badge key={s} variant="outline" className="text-[10px]">
                  {s}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[600px] bg-background border">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <Radar className="h-5 w-5" />
          <span className="font-medium">Pipeline Orchestrator</span>
          <Badge variant="outline" className="text-xs">
            {inputCompanyName}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {isLoading ? (
            <Button variant="outline" size="sm" onClick={handleCancel}>
              <Square className="h-3 w-3 mr-1" />
              Cancel
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={handleReset}>
                New Search
              </Button>
              {onClose && (
                <Button variant="ghost" size="sm" onClick={onClose}>
                  <XCircle className="h-4 w-4" />
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Chat Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {events.length === 0 && !isLoading && !error && (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin" />
              <p className="text-sm">Starting discovery...</p>
            </div>
          </div>
        )}

        {events.map((event, index) => (
          <ChatMessage key={index} event={event} />
        ))}

        {error && (
          <div className="flex items-center gap-2 text-destructive p-3 bg-destructive/10">
            <XCircle className="h-4 w-4" />
            <span className="text-sm">Error: {error}</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Discovered Sources Summary */}
      {sources.length > 0 && (
        <div className="border-t p-4 bg-muted/30">
          <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-success" />
            Sources Found ({sources.length})
            {gaps.length > 0 && (
              <Badge variant="outline" className="text-[10px] ml-2">
                {gaps.length} gaps detected
              </Badge>
            )}
          </h4>
          <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto mb-3">
            {sources.map((source, index) => (
              <SourceBadge
                key={index}
                url={source.url}
                sourceType={source.sourceType}
                label={source.label}
                priority={source.priority}
                verified
              />
            ))}
          </div>
          {gaps.length > 0 && (
            <p className="text-xs text-muted-foreground mb-3">
              Missing coverage: {gaps.join(", ")}
            </p>
          )}
          <div className="flex gap-2">
            <Button onClick={handleApply} size="sm">
              Apply Configuration
            </Button>
            <Button variant="outline" size="sm" onClick={handleDiscard}>
              Discard
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
