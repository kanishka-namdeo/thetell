"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

interface AgentInfo {
  name: string;
  voice: string;
  sources: string;
  focus: string;
  variant: "default" | "accent";
}

const agents: AgentInfo[] = [
  {
    name: "The Analyst",
    voice: "Professional, data-driven Bloomberg Intelligence style",
    sources: "News, filings, transcripts",
    focus: "Specific numbers, dates, named sources, actionable intelligence",
    variant: "default",
  },
  {
    name: "Gossip Girl",
    voice: "Sharp-witted Page Six meets Wall Street Journal",
    sources: "Social media, blogs, job postings",
    focus: "Subtext, executive behavior, hidden patterns",
    variant: "accent",
  },
];

export function AgentInfoCard() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="border-2 border-foreground">
        <CollapsibleTrigger
          className="w-full cursor-pointer hover:bg-muted/50 transition-colors"
          render={<CardHeader />}
          nativeButton={false}
        >
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">About Our Agents</CardTitle>
            <ChevronDown
              className={`h-5 w-5 transition-transform ${isOpen ? "rotate-180" : ""}`}
            />
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-4 pt-4">
            {agents.map((agent) => (
              <div key={agent.name} className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant={agent.variant}>{agent.name}</Badge>
                </div>
                <div className="text-sm space-y-1 pl-2">
                  <div>
                    <span className="font-semibold">Voice:</span>{" "}
                    <span className="text-muted-foreground">{agent.voice}</span>
                  </div>
                  <div>
                    <span className="font-semibold">Sources:</span>{" "}
                    <span className="text-muted-foreground">{agent.sources}</span>
                  </div>
                  <div>
                    <span className="font-semibold">Focus:</span>{" "}
                    <span className="text-muted-foreground">{agent.focus}</span>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
