"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { TrendingUp, TrendingDown, Minus, Tag } from "lucide-react";
import { AdminEmptyState } from "@/components/admin/states";

interface ThemeData {
  id: string;
  label: string;
  description: string | null;
  status: string;
  momentum: number;
  firstSeen: Date;
  lastUpdated: Date;
  company: { id: string; name: string; ticker: string | null };
  _count: { signals: number; inferences: number };
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  EMERGING: "default",
  ACCELERATING: "default",
  PEAKED: "secondary",
  FADING: "outline",
  RESOLVED: "outline",
};

function MomentumIcon({ momentum }: { momentum: number }) {
  if (momentum > 0.3) return <TrendingUp className="h-4 w-4 text-success" />;
  if (momentum < -0.3) return <TrendingDown className="h-4 w-4 text-destructive" />;
  return <Minus className="h-4 w-4 text-muted-foreground" />;
}

export function ThemesClient({
  initialThemes,
}: {
  initialThemes: ThemeData[];
}) {
  const [themes] = useState(initialThemes);
  const [statusFilter, setStatusFilter] = useState<string>("");

  const filtered = statusFilter
    ? themes.filter((t) => t.status === statusFilter)
    : themes;

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v || "")}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All statuses</SelectItem>
                <SelectItem value="EMERGING">Emerging</SelectItem>
                <SelectItem value="ACCELERATING">Accelerating</SelectItem>
                <SelectItem value="PEAKED">Peaked</SelectItem>
                <SelectItem value="FADING">Fading</SelectItem>
                <SelectItem value="RESOLVED">Resolved</SelectItem>
              </SelectContent>
            </Select>
            <Badge variant="outline" className="text-xs">
              {filtered.length} themes
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Themes Table */}
      <Card className="border-2 border-foreground">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Label</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Momentum</TableHead>
              <TableHead>Signals</TableHead>
              <TableHead>Inferences</TableHead>
              <TableHead>First Seen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12">
                  <AdminEmptyState
                    icon={Tag}
                    title="No themes found"
                    description="Themes will appear here once they are detected in the data"
                  />
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((theme) => (
                <TableRow key={theme.id}>
                  <TableCell className="font-medium max-w-[250px]">
                    <p className="truncate">{theme.label}</p>
                    {theme.description && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {theme.description}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="text-sm">{theme.company.name}</p>
                      {theme.company.ticker && (
                        <p className="text-xs text-muted-foreground font-mono">
                          {theme.company.ticker}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={STATUS_VARIANT[theme.status] ?? "outline"}
                      className="text-xs"
                    >
                      {theme.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <MomentumIcon momentum={theme.momentum} />
                      <span className="text-sm font-mono">
                        {theme.momentum > 0 ? "+" : ""}
                        {theme.momentum.toFixed(1)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm font-mono">
                      {theme._count.signals}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm font-mono">
                      {theme._count.inferences}
                    </span>
                  </TableCell>
                  <TableCell>
                    <time className="text-xs font-mono text-muted-foreground">
                      {new Date(theme.firstSeen).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </time>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
