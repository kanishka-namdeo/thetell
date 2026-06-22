"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AdminEmptyState } from "@/components/admin/states";
import { toast } from "sonner";
import { Brain, TrendingUp, CheckCircle, XCircle, Clock, HelpCircle } from "lucide-react";

interface InferenceData {
  id: string;
  title: string;
  hypothesis: string;
  confidence: number;
  status: string;
  predictedOutcome: string | null;
  createdAt: Date;
  company: { id: string; name: string; ticker: string | null };
  theme: { id: string; label: string; status: string } | null;
}

interface InferencesClientProps {
  initialInferences: InferenceData[];
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  EMERGING: "default",
  DEVELOPING: "default",
  CONFIRMED: "secondary",
  REFUTED: "destructive",
  RESOLVED: "outline",
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  EMERGING: <TrendingUp className="h-4 w-4" />,
  DEVELOPING: <Brain className="h-4 w-4" />,
  CONFIRMED: <CheckCircle className="h-4 w-4" />,
  REFUTED: <XCircle className="h-4 w-4" />,
  RESOLVED: <Clock className="h-4 w-4" />,
};

export function InferencesClient({ initialInferences }: InferencesClientProps) {
  const [inferences, setInferences] = useState(initialInferences);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [resolving, setResolving] = useState<string | null>(null);

  const filteredInferences = statusFilter === "all"
    ? inferences
    : inferences.filter((inf) => inf.status === statusFilter);

  const handleResolve = async (id: string, newStatus: "CONFIRMED" | "REFUTED" | "RESOLVED") => {
    setResolving(id);
    try {
      const res = await fetch(`/api/v1/admin/inferences/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) throw new Error("Failed to update inference");

      setInferences((prev) =>
        prev.map((inf) =>
          inf.id === id ? { ...inf, status: newStatus } : inf
        )
      );
      
      const action = newStatus === "CONFIRMED" ? "confirmed" : newStatus === "REFUTED" ? "refuted" : "resolved";
      toast.success(`Inference ${action}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update inference");
    } finally {
      setResolving(null);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            Inferences
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value || "all")}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="EMERGING">Emerging</SelectItem>
                <SelectItem value="DEVELOPING">Developing</SelectItem>
                <SelectItem value="CONFIRMED">Confirmed</SelectItem>
                <SelectItem value="REFUTED">Refuted</SelectItem>
                <SelectItem value="RESOLVED">Resolved</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Theme</TableHead>
                <TableHead>Confidence</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredInferences.map((inference) => (
                <TableRow key={inference.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {STATUS_ICON[inference.status]}
                      {inference.title}
                    </div>
                  </TableCell>
                  <TableCell>
                    {inference.company.ticker || inference.company.name}
                  </TableCell>
                  <TableCell>
                    {inference.theme ? (
                      <Badge variant="outline">{inference.theme.label}</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        inference.confidence >= 0.8
                          ? "default"
                          : inference.confidence >= 0.6
                          ? "secondary"
                          : "outline"
                      }
                    >
                      {(inference.confidence * 100).toFixed(0)}%
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[inference.status] || "outline"}>
                      {inference.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {new Date(inference.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    {inference.status !== "CONFIRMED" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleResolve(inference.id, "CONFIRMED")}
                        disabled={resolving === inference.id}
                      >
                        <CheckCircle className="h-4 w-4" />
                      </Button>
                    )}
                    {inference.status !== "REFUTED" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleResolve(inference.id, "REFUTED")}
                        disabled={resolving === inference.id}
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    )}
                    {inference.status !== "RESOLVED" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleResolve(inference.id, "RESOLVED")}
                        disabled={resolving === inference.id}
                      >
                        <HelpCircle className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {filteredInferences.length === 0 && (
            <AdminEmptyState
              icon={Brain}
              title="No inferences found"
              description="Strategic inferences from cross-signal analysis will appear here"
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
