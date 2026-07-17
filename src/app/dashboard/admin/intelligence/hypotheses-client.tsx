"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Plus,
  Archive,
  ArchiveRestore,
  Loader2,
  Lightbulb,
} from "lucide-react";

interface Company {
  id: string;
  name: string;
  slug: string;
}

interface Hypothesis {
  id: string;
  companyId: string;
  title: string;
  description: string;
  status: "ACTIVE" | "ARCHIVED" | "CONFIRMED" | "REFUTED";
  confidence: number;
  evidence: unknown[];
  createdAt: string;
  updatedAt: string;
  company: Company;
}

interface HypothesesClientProps {
  initialHypotheses: Hypothesis[];
  companies: Company[];
}

const statusColors: Record<string, string> = {
  ACTIVE: "default",
  ARCHIVED: "secondary",
  CONFIRMED: "success",
  REFUTED: "destructive",
};

export function HypothesesClient({
  initialHypotheses,
  companies,
}: HypothesesClientProps) {
  const [hypotheses, setHypotheses] = useState<Hypothesis[]>(initialHypotheses);
  const [isLoading, setIsLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newCompanyId, setNewCompanyId] = useState("");
  const [newConfidence, setNewConfidence] = useState("0.5");
  const [isCreating, setIsCreating] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  const fetchHypotheses = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setIsLoading(true);
    try {
      const res = await fetch("/api/v1/admin/hypotheses", {
credentials: "include", signal: controller.signal });
      if (!res.ok) throw new Error("Failed to fetch hypotheses");
      const data = await res.json();
      setHypotheses(data.data);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      toast.error("Failed to load hypotheses");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const filteredHypotheses = useMemo(() => {
    if (statusFilter === "ALL") return hypotheses;
    return hypotheses.filter((h) => h.status === statusFilter);
  }, [hypotheses, statusFilter]);

  const groupedByCompany = useMemo(() => {
    const groups: Record<string, { company: Company; hypotheses: Hypothesis[] }> = {};
    for (const h of filteredHypotheses) {
      if (!groups[h.companyId]) {
        groups[h.companyId] = { company: h.company, hypotheses: [] };
      }
      groups[h.companyId].hypotheses.push(h);
    }
    return Object.values(groups);
  }, [filteredHypotheses]);

  async function handleCreate() {
    if (!newTitle.trim() || !newDescription.trim() || !newCompanyId) {
      toast.error("Please fill in all required fields");
      return;
    }

    setIsCreating(true);
    try {
      const res = await fetch("/api/v1/admin/hypotheses", {
credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: newCompanyId,
          title: newTitle,
          description: newDescription,
          priority: parseFloat(newConfidence),
        }),
      });

      if (!res.ok) throw new Error("Failed to create hypothesis");

      toast.success("Hypothesis created");
      setNewTitle("");
      setNewDescription("");
      setNewCompanyId("");
      setNewConfidence("0.5");
      setShowCreateForm(false);
      await fetchHypotheses();
    } catch {
      toast.error("Failed to create hypothesis");
    } finally {
      setIsCreating(false);
    }
  }

  async function handleStatusChange(id: string, status: string) {
    try {
      const res = await fetch(`/api/v1/admin/hypotheses/${id}`, {
credentials: "include",
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      if (!res.ok) throw new Error("Failed to update hypothesis");

      setHypotheses((prev) =>
        prev.map((h) => (h.id === id ? { ...h, status: status as Hypothesis["status"] } : h))
      );
      toast.success(`Hypothesis ${status.toLowerCase()}`);
    } catch {
      toast.error("Failed to update hypothesis");
    }
  }

  async function handleArchive(id: string) {
    try {
      const res = await fetch(`/api/v1/admin/hypotheses/${id}`, {
credentials: "include",
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Failed to archive hypothesis");

      setHypotheses((prev) =>
        prev.map((h) => (h.id === id ? { ...h, status: "ARCHIVED" as const } : h))
      );
      toast.success("Hypothesis archived");
    } catch {
      toast.error("Failed to archive hypothesis");
    }
  }

  return (
    <div className="space-y-6">
      {/* Header with actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Select value={statusFilter} onValueChange={(v) => v && setStatusFilter(v)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Statuses</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="ARCHIVED">Archived</SelectItem>
              <SelectItem value="CONFIRMED">Confirmed</SelectItem>
              <SelectItem value="REFUTED">Refuted</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => setShowCreateForm(!showCreateForm)}>
          <Plus className="h-4 w-4 mr-2" />
          New Hypothesis
        </Button>
      </div>

      {/* Create form */}
      {showCreateForm && (
        <Card className="border-2 border-foreground">
          <CardHeader>
            <CardTitle className="text-lg">Create New Hypothesis</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="company">Company</Label>
              <Select value={newCompanyId} onValueChange={(v) => v && setNewCompanyId(v)}>
                <SelectTrigger id="company">
                  <SelectValue placeholder="Select a company" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g., Company is planning a major acquisition"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Detailed description of the hypothesis"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confidence">Initial Confidence (0.0 - 1.0)</Label>
              <Input
                id="confidence"
                type="number"
                min="0"
                max="1"
                step="0.05"
                value={newConfidence}
                onChange={(e) => setNewConfidence(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setShowCreateForm(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={isCreating}>
                {isCreating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Hypothesis"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Hypotheses grouped by company */}
      {isLoading ? (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : groupedByCompany.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Lightbulb className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">No hypotheses found</p>
              <p className="text-sm text-muted-foreground">
                Create a hypothesis to start tracking strategic questions about companies.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        groupedByCompany.map((group) => (
          <Card key={group.company.id} className="border-2 border-foreground">
            <CardHeader>
              <CardTitle className="text-lg">{group.company.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Hypothesis</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead>Evidence</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.hypotheses.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{h.title}</p>
                          <p className="text-sm text-muted-foreground line-clamp-1">
                            {h.description}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusColors[h.status] as "default" | "secondary" | "destructive"}>
                          {h.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-sm">
                          {(h.confidence * 100).toFixed(0)}%
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {Array.isArray(h.evidence) ? h.evidence.length : 0} items
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(h.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {h.status === "ACTIVE" && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleStatusChange(h.id, "CONFIRMED")}
                              >
                                Confirm
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleStatusChange(h.id, "REFUTED")}
                              >
                                Refute
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleArchive(h.id)}
                              >
                                <Archive className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          {h.status === "ARCHIVED" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleStatusChange(h.id, "ACTIVE")}
                            >
                              <ArchiveRestore className="h-4 w-4 mr-1" />
                              Restore
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
