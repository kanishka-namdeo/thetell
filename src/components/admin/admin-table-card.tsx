"use client";

import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AdminEmptyState } from "@/components/admin/states";
import type { LucideIcon } from "lucide-react";

export interface AdminTableColumn {
  key: string;
  label: string;
  className?: string;
}

interface AdminTableCardProps<T> {
  columns: AdminTableColumn[];
  data: T[];
  isLoading: boolean;
  emptyIcon?: LucideIcon;
  emptyTitle?: string;
  emptyDescription?: string;
  error?: string | null;
  rowKey: (row: T) => string;
  renderRow: (row: T) => ReactNode;
  skeletonColumnCount?: number;
  checkboxes?: boolean;
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  footer?: ReactNode;
}

export function AdminTableCard<T>({
  columns,
  data,
  isLoading,
  emptyIcon,
  emptyTitle = "No items found",
  emptyDescription,
  error,
  rowKey,
  renderRow,
  checkboxes = false,
  selectedIds,
  onSelectionChange,
  footer,
}: AdminTableCardProps<T>) {
  const isAllSelected =
    checkboxes && selectedIds && data.length > 0 && selectedIds.size === data.length;

  function toggleSelectAll() {
    if (!onSelectionChange || !selectedIds) return;
    if (selectedIds.size === data.length) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(data.map((row) => rowKey(row))));
    }
  }

  function toggleSelect(id: string) {
    if (!onSelectionChange || !selectedIds) return;
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    onSelectionChange(next);
  }

  return (
    <Card className="border-2 border-foreground overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {checkboxes && (
                <TableHead className="w-[50px]">
                  <Checkbox
                    checked={isAllSelected}
                    onCheckedChange={toggleSelectAll}
                  />
                </TableHead>
              )}
              {columns.map((col) => (
                <TableHead key={col.key} className={col.className}>
                  {col.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && data.length === 0 ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {checkboxes && (
                    <TableCell>
                      <Skeleton className="h-4 w-4" />
                    </TableCell>
                  )}
                  {columns.map((col) => (
                    <TableCell key={col.key}>
                      <Skeleton className="h-4 w-full max-w-[120px]" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              data.map((row) => {
                const key = rowKey(row);
                return (
                  <TableRow key={key}>
                    {checkboxes && (
                      <TableCell>
                        <Checkbox
                          checked={selectedIds?.has(key)}
                          onCheckedChange={() => toggleSelect(key)}
                        />
                      </TableCell>
                    )}
                    {renderRow(row)}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {footer}

      {!isLoading && data.length === 0 && !error && emptyIcon && (
        <AdminEmptyState
          icon={emptyIcon}
          title={emptyTitle}
          description={emptyDescription}
        />
      )}
    </Card>
  );
}
