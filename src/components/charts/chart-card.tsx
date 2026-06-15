import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface ChartCardProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  headerRight?: React.ReactNode;
}

export function ChartCard({ title, description, children, className, headerRight }: ChartCardProps) {
  return (
    <Card className={cn("border-2 border-foreground", className)}>
      <CardHeader className="border-b border-border pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg font-serif">{title}</CardTitle>
            {description && (
              <CardDescription className="mt-1 text-xs font-sans text-muted-foreground">
                {description}
              </CardDescription>
            )}
          </div>
          {headerRight && <div>{headerRight}</div>}
        </div>
      </CardHeader>
      <CardContent className="pt-4">{children}</CardContent>
    </Card>
  );
}
