"use client";

import { useCallback, useEffect, useState } from "react";
import { Label, Pie, PieChart } from "recharts";
import {
  Activity,
  CheckCircle2,
  Clock,
  RefreshCw,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatCard } from "@/components/dashboard/stat-card";
import { ThemeToggle } from "@/components/dashboard/theme-toggle";
import { cn } from "@/lib/utils";

interface Span {
  traceId: string;
  spanId: string;
  name: string;
  startTime: string;
  latencyMs: number;
  statusCode: string;
  httpStatus: number;
}

interface Metrics {
  days?: number;
  total: number;
  success: number;
  failure: number;
  successRate: number;
  avgLatencyMs: number;
  recent: Span[];
}

const RANGES = [
  { label: "24h", days: 1 },
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
];

const chartConfig = {
  success: { label: "Successful", color: "#10b981" }, // emerald-500
  failure: { label: "Failed", color: "#ef4444" }, // red-500
} satisfies ChartConfig;

export default function DashboardPage() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (d: number) => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/metrics?days=${d}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `Request failed (${r.status})`);
      setData(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(days);
  }, [days, load]);

  const ratePct = data ? (data.successRate * 100).toFixed(1) : "—";

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Request Metrics
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Payment request health from Arize AX spans
            <span className="mx-1.5 text-muted-foreground/40">·</span>
            <code className="font-mono text-xs">attributes.payment.http_status</code>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border bg-card p-0.5">
            {RANGES.map((r) => (
              <button
                key={r.days}
                onClick={() => setDays(r.days)}
                className={cn(
                  "rounded-md px-3 py-1 text-sm font-medium transition-colors",
                  days === r.days
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => load(days)}
            disabled={loading}
            aria-label="Refresh"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
          <ThemeToggle />
        </div>
      </div>

      {error && (
        <Card className="mt-6 border-destructive/40">
          <CardContent className="py-4 text-sm text-destructive">
            Failed to load metrics: {error}
          </CardContent>
        </Card>
      )}

      {/* KPI cards */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Requests"
          value={data?.total ?? 0}
          icon={Activity}
          accent="text-foreground"
          loading={loading}
          hint={`Last ${days === 1 ? "24 hours" : `${days} days`}`}
        />
        <StatCard
          title="Successful"
          value={data?.success ?? 0}
          icon={CheckCircle2}
          accent="text-emerald-500"
          loading={loading}
          hint="HTTP status < 400"
        />
        <StatCard
          title="Failed"
          value={data?.failure ?? 0}
          icon={XCircle}
          accent="text-red-500"
          loading={loading}
          hint="HTTP status ≥ 400"
        />
        <StatCard
          title="Success Rate"
          value={`${ratePct}%`}
          icon={TrendingUp}
          accent="text-emerald-500"
          loading={loading}
          hint={
            data ? (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" /> {data.avgLatencyMs} ms avg latency
              </span>
            ) : null
          }
        />
      </div>

      {/* Chart + recent */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Success vs Failure</CardTitle>
            <CardDescription>Share of requests by outcome</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-center">
            {data && data.total > 0 ? (
              <ChartContainer
                config={chartConfig}
                className="aspect-square max-h-[240px] w-full"
              >
                <PieChart>
                  <ChartTooltip
                    cursor={false}
                    content={<ChartTooltipContent hideLabel />}
                  />
                  <Pie
                    data={[
                      {
                        key: "success",
                        label: "Successful",
                        value: data.success,
                        fill: "var(--color-success)",
                      },
                      {
                        key: "failure",
                        label: "Failed",
                        value: data.failure,
                        fill: "var(--color-failure)",
                      },
                    ]}
                    dataKey="value"
                    nameKey="label"
                    innerRadius={62}
                    strokeWidth={4}
                  >
                    <Label
                      content={({ viewBox }) => {
                        if (!viewBox || !("cx" in viewBox)) return null;
                        return (
                          <text
                            x={viewBox.cx}
                            y={viewBox.cy}
                            textAnchor="middle"
                            dominantBaseline="middle"
                          >
                            <tspan
                              x={viewBox.cx}
                              y={viewBox.cy}
                              className="fill-foreground font-mono text-2xl font-semibold"
                            >
                              {ratePct}%
                            </tspan>
                            <tspan
                              x={viewBox.cx}
                              y={(viewBox.cy ?? 0) + 20}
                              className="fill-muted-foreground text-xs"
                            >
                              success
                            </tspan>
                          </text>
                        );
                      }}
                    />
                  </Pie>
                </PieChart>
              </ChartContainer>
            ) : (
              <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
                {loading ? "Loading…" : "No requests in this range"}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Recent Requests</CardTitle>
            <CardDescription>Latest payment spans</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Span</TableHead>
                  <TableHead className="text-right">Latency</TableHead>
                  <TableHead className="text-right">Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.recent?.length ? (
                  data.recent.map((s) => (
                    <TableRow key={s.spanId}>
                      <TableCell>
                        <Badge
                          variant={s.httpStatus < 400 ? "secondary" : "destructive"}
                          className={cn(
                            "font-mono",
                            s.httpStatus < 400 &&
                              "bg-emerald-500/10 text-emerald-500"
                          )}
                        >
                          {s.httpStatus}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {s.name}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {Math.round(s.latencyMs)} ms
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {new Date(s.startTime).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="h-24 text-center text-sm text-muted-foreground"
                    >
                      {loading ? "Loading…" : "No requests in this range"}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
