import type { ReactNode } from "react";

interface AdminPageHeaderProps {
  eyebrow: string;
  title: string;
  count?: number;
  description?: string;
  actions?: ReactNode;
}

export function AdminPageHeader({
  eyebrow,
  title,
  count,
  description,
  actions,
}: AdminPageHeaderProps) {
  const subtitle =
    description ??
    (count !== undefined
      ? `${count} item${count !== 1 ? "s" : ""}`
      : undefined);

  return (
    <div className="border-b-2 border-foreground pb-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-widest font-sans text-muted-foreground mb-1">
            {eyebrow}
          </p>
          <h1 className="text-3xl font-serif font-bold">{title}</h1>
          {subtitle && (
            <p className="text-sm text-muted-foreground font-body mt-1">
              {subtitle}
            </p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
