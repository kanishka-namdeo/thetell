"use client";

import { useEffect, useRef } from "react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Plus,
  Brain,
  Sparkles,
  BarChart3,
  Shield,
  FileText,
  Download,
  Share2,
  Trash2,
  MessageSquare,
  Terminal,
  Settings,
  Activity,
} from "lucide-react";

export interface CommandPaletteActions {
  onNewSession: () => void;
  onToggleMemory: () => void;
  onToggleSkills: () => void;
  onToggleMetrics: () => void;
  onToggleBatchApprovals: () => void;
  onToggleInterpreter: () => void;
  onToggleTrace: () => void;
  onOpenTemplates: () => void;
  onExportConversation: () => void;
  onShareConversation: () => void;
  onClearMessages: () => void;
  onFocusInput: () => void;
  onOpenSettings: () => void;
}

interface DeepAgentCommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actions: CommandPaletteActions;
}

export function DeepAgentCommandPalette({
  open,
  onOpenChange,
  actions,
}: DeepAgentCommandPaletteProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const execute = (action: () => void) => {
    onOpenChange(false);
    action();
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="DeepAgent Commands"
      description="Search for a command or action..."
    >
      <CommandInput ref={inputRef} placeholder="Type a command..." />
      <CommandList>
        <CommandEmpty>No commands found.</CommandEmpty>

        <CommandGroup heading="Session">
          <CommandItem onSelect={() => execute(actions.onNewSession)}>
            <Plus className="h-4 w-4" />
            New Session
            <CommandShortcut>Ctrl+N</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => execute(actions.onClearMessages)}>
            <Trash2 className="h-4 w-4" />
            Clear Messages
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Panels">
          <CommandItem onSelect={() => execute(actions.onToggleMemory)}>
            <Brain className="h-4 w-4" />
            Toggle Memory Browser
            <CommandShortcut>Ctrl+Shift+M</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => execute(actions.onToggleSkills)}>
            <Sparkles className="h-4 w-4" />
            Toggle Skill Browser
            <CommandShortcut>Ctrl+Shift+S</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => execute(actions.onToggleMetrics)}>
            <BarChart3 className="h-4 w-4" />
            Toggle Metrics Panel
          </CommandItem>
          <CommandItem onSelect={() => execute(actions.onToggleBatchApprovals)}>
            <Shield className="h-4 w-4" />
            Toggle Batch Approvals
          </CommandItem>
          <CommandItem onSelect={() => execute(actions.onToggleInterpreter)}>
            <Terminal className="h-4 w-4" />
            Toggle Code Interpreter
          </CommandItem>
          <CommandItem onSelect={() => execute(actions.onToggleTrace)}>
            <Activity className="h-4 w-4" />
            Toggle Execution Trace
          </CommandItem>
          <CommandItem onSelect={() => execute(actions.onOpenSettings)}>
            <Settings className="h-4 w-4" />
            Open Settings
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Templates & Export">
          <CommandItem onSelect={() => execute(actions.onOpenTemplates)}>
            <FileText className="h-4 w-4" />
            Open Templates
            <CommandShortcut>Ctrl+Shift+T</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => execute(actions.onExportConversation)}>
            <Download className="h-4 w-4" />
            Export Conversation
            <CommandShortcut>Ctrl+Shift+E</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => execute(actions.onShareConversation)}>
            <Share2 className="h-4 w-4" />
            Share Conversation
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Navigation">
          <CommandItem onSelect={() => execute(actions.onFocusInput)}>
            <MessageSquare className="h-4 w-4" />
            Focus Input Bar
            <CommandShortcut>Ctrl+Shift+I</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
