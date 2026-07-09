"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sparkles,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";

interface SkillInfo {
  name: string;
  path: string;
  description?: string;
  triggers?: string[];
}

export function DeepAgentSkillBrowser({ className }: { className?: string }) {
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [selectedSkill, setSelectedSkill] = useState<SkillInfo | null>(null);
  const [skillContent, setSkillContent] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(true);
  const controllerRef = useRef<AbortController | null>(null);

  const loadSkills = async () => {
    setIsLoading(true);
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const res = await fetch("/api/v1/admin/deepagent/skills", { signal: controller.signal });
      if (res.ok) {
        const data = await res.json();
        setSkills(data.data);
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      logger.error("deepagent.skills_load_failed", { error: String(error) });
    } finally {
      setIsLoading(false);
    }
  };

  const loadSkillContent = async (skill: SkillInfo) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const res = await fetch(
        `/api/v1/admin/deepagent/skills?path=${encodeURIComponent(skill.path)}`,
        { signal: controller.signal }
      );
      if (res.ok) {
        const data = await res.json();
        setSkillContent(data.data.content);
        setSelectedSkill(skill);
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      logger.error("deepagent.skill_content_load_failed", { skill: skill.path, error: String(error) });
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadSkills();
    return () => controllerRef.current?.abort();
  }, []);

  if (isCollapsed) {
    return (
      <div className={cn("border-t border-border bg-card", className)}>
        <button
          type="button"
          onClick={() => setIsCollapsed(false)}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <ChevronRight className="h-4 w-4" />
          <Sparkles className="h-4 w-4" />
          <span>Skills ({skills.length})</span>
        </button>
      </div>
    );
  }

  return (
    <div className={cn("border-t border-border bg-card flex flex-col", className)}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <button
          type="button"
          onClick={() => setIsCollapsed(true)}
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors flex-1"
        >
          <ChevronDown className="h-4 w-4" />
          <Sparkles className="h-4 w-4" />
          <span>Skills</span>
          <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
            {skills.length}
          </Badge>
        </button>
        <Button
          variant="ghost"
          size="sm"
          onClick={loadSkills}
          disabled={isLoading}
          className="h-7 w-7 p-0"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
        </Button>
      </div>

      <div className="flex flex-1 min-h-0 max-h-[400px]">
        {/* Skill list */}
        <div className="w-56 border-r border-border">
          <ScrollArea className="h-full">
            <div className="p-2 space-y-1">
              {skills.length === 0 ? (
                <div className="text-center text-xs text-muted-foreground py-4">
                  {isLoading ? "Loading..." : "No skills available"}
                </div>
              ) : (
                skills.map((skill) => (
                  <div
                    key={skill.path}
                    role="button"
                    tabIndex={0}
                    className={cn(
                      "group flex items-start gap-2 rounded-md px-2 py-1.5 text-xs cursor-pointer hover:bg-accent transition-colors",
                      selectedSkill?.path === skill.path && "bg-accent border border-border"
                    )}
                    onClick={() => loadSkillContent(skill)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        loadSkillContent(skill);
                      }
                    }}
                  >
                    <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{skill.name}</div>
                      {skill.description && (
                        <div className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">
                          {skill.description}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Skill content */}
        <div className="flex-1 flex flex-col min-w-0">
          {!selectedSkill ? (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
              Select a skill to view
            </div>
          ) : (
            <>
              <div className="px-3 py-2 border-b border-border">
                <div className="text-sm font-medium">{selectedSkill.name}</div>
                {selectedSkill.description && (
                  <div className="text-xs text-muted-foreground mt-1">
                    {selectedSkill.description}
                  </div>
                )}
                {selectedSkill.triggers && selectedSkill.triggers.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {selectedSkill.triggers.map((trigger) => (
                      <Badge
                        key={trigger}
                        variant="outline"
                        className="text-[10px] h-4 px-1.5"
                      >
                        {trigger}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              <ScrollArea className="flex-1">
                <pre className="p-4 text-xs font-mono whitespace-pre-wrap break-words text-foreground">
                  {skillContent}
                </pre>
              </ScrollArea>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
