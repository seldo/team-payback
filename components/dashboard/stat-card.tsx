import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: React.ReactNode;
  icon: LucideIcon;
  hint?: React.ReactNode;
  /** Tailwind text-color class for the icon accent, e.g. "text-emerald-500". */
  accent?: string;
  loading?: boolean;
}

export function StatCard({
  title,
  value,
  icon: Icon,
  hint,
  accent = "text-muted-foreground",
  loading,
}: StatCardProps) {
  return (
    <Card className="gap-2">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className={cn("h-4 w-4", accent)} />
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-9 w-24 animate-pulse rounded-md bg-muted" />
        ) : (
          <div className="font-mono text-3xl font-semibold tracking-tight tabular-nums">
            {value}
          </div>
        )}
        {hint && !loading && (
          <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        )}
      </CardContent>
    </Card>
  );
}
