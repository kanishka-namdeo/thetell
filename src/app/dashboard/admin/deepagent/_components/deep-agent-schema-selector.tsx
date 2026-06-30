"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileJson, X, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DeepAgentStructuredSchema } from "@/lib/deepagent/types";

const BUILT_IN_SCHEMAS: DeepAgentStructuredSchema[] = [
  {
    id: "code-review",
    name: "Code Review",
    description: "Structured code review with severity, file, and recommendations",
    fields: [
      { name: "severity", type: "string", description: "critical, warning, info, or suggestion", required: true },
      { name: "file", type: "string", description: "File path being reviewed", required: true },
      { name: "line", type: "number", description: "Line number of the issue", required: false },
      { name: "message", type: "string", description: "Description of the issue", required: true },
      { name: "suggestion", type: "string", description: "Suggested fix", required: false },
    ],
  },
  {
    id: "task-list",
    name: "Task List",
    description: "List of tasks with priority and status",
    fields: [
      { name: "title", type: "string", description: "Task title", required: true },
      { name: "priority", type: "string", description: "high, medium, or low", required: true },
      { name: "status", type: "string", description: "pending, in_progress, or completed", required: true },
      { name: "assignee", type: "string", description: "Who is responsible", required: false },
    ],
  },
  {
    id: "analysis",
    name: "Analysis Report",
    description: "Structured analysis with findings and recommendations",
    fields: [
      { name: "summary", type: "string", description: "Brief summary of findings", required: true },
      { name: "confidence", type: "number", description: "Confidence score 0.0-1.0", required: true },
      { name: "findings", type: "array", description: "List of key findings", required: true },
      { name: "recommendations", type: "array", description: "List of recommendations", required: false },
    ],
  },
];

interface DeepAgentSchemaSelectorProps {
  selectedSchemaId: string | null;
  onSelectSchema: (schema: DeepAgentStructuredSchema | null) => void;
  disabled?: boolean;
  className?: string;
}

export function DeepAgentSchemaSelector({
  selectedSchemaId,
  onSelectSchema,
  disabled,
  className,
}: DeepAgentSchemaSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  const selectedSchema = BUILT_IN_SCHEMAS.find((s) => s.id === selectedSchemaId) ?? null;

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(true)}
        disabled={disabled}
        className={cn("h-8", className)}
        title="Select output schema"
      >
        <FileJson className="h-3.5 w-3.5 sm:mr-1.5" />
        <span className="hidden sm:inline">
          {selectedSchema ? selectedSchema.name : "Schema"}
        </span>
        {selectedSchema && (
          <Badge variant="secondary" className="ml-1 hidden lg:inline-flex text-xs">
            Active
          </Badge>
        )}
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Structured Output Schema</DialogTitle>
            <DialogDescription>
              Select a schema to receive structured output from DeepAgent. When a schema is active, responses will be validated against it.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 min-h-0 pr-3">
            <div className="space-y-3 py-2">
              {/* No schema option */}
              <div
                className={cn(
                  "flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors hover:bg-accent",
                  !selectedSchemaId && "ring-2 ring-primary"
                )}
                onClick={() => {
                  onSelectSchema(null);
                  setIsOpen(false);
                }}
              >
                <div className="flex-1">
                  <div className="font-medium text-sm">Freeform Text</div>
                  <div className="text-xs text-muted-foreground">
                    No schema validation — standard text responses
                  </div>
                </div>
                {!selectedSchemaId && <Check className="h-4 w-4 text-primary" />}
              </div>

              {/* Built-in schemas */}
              {BUILT_IN_SCHEMAS.map((schema) => (
                <div
                  key={schema.id}
                  className={cn(
                    "p-3 border rounded-lg cursor-pointer transition-colors hover:bg-accent",
                    selectedSchemaId === schema.id && "ring-2 ring-primary"
                  )}
                  onClick={() => {
                    onSelectSchema(schema);
                    setIsOpen(false);
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm">{schema.name}</span>
                        {selectedSchemaId === schema.id && (
                          <Badge variant="default" className="text-xs">Active</Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mb-2">
                        {schema.description}
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs h-7">Field</TableHead>
                            <TableHead className="text-xs h-7">Type</TableHead>
                            <TableHead className="text-xs h-7">Description</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {schema.fields.map((field) => (
                            <TableRow key={field.name}>
                              <TableCell className="text-xs py-1">
                                <code className="text-xs">{field.name}</code>
                                {field.required && <span className="text-destructive ml-0.5">*</span>}
                              </TableCell>
                              <TableCell className="text-xs py-1">
                                <Badge variant="outline" className="text-xs">
                                  {field.type}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs py-1 text-muted-foreground">
                                {field.description}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

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
