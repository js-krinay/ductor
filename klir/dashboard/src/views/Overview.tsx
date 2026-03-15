import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/EmptyState";
import { useDashboardStore } from "@/store/dashboard";
import { formatCost, formatTokens } from "@/lib/format";

export default function Overview() {
  const sessions = useDashboardStore((s) => s.sessions);
  const namedSessions = useDashboardStore((s) => s.namedSessions);
  const agents = useDashboardStore((s) => s.agents);
  const tasks = useDashboardStore((s) => s.tasks);
  const processes = useDashboardStore((s) => s.processes);
  const observers = useDashboardStore((s) => s.observers);
  const config = useDashboardStore((s) => s.config);
  const lastSnapshotAt = useDashboardStore((s) => s.lastSnapshotAt);

  const activeNamedSessions = useMemo(
    () => namedSessions.filter((ns) => ns.status !== "ended").length,
    [namedSessions],
  );

  const runningTasks = useMemo(
    () => tasks.filter((t) => t.status === "running").length,
    [tasks],
  );

  const totalCost = useMemo(
    () => sessions.reduce((sum, s) => sum + s.total_cost_usd, 0),
    [sessions],
  );

  const totalTokens = useMemo(
    () => sessions.reduce((sum, s) => sum + s.total_tokens, 0),
    [sessions],
  );

  if (lastSnapshotAt === null) {
    return <EmptyState loading title="Loading..." />;
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <h1 className="hidden text-2xl font-bold md:block">Mission Control</h1>

      {/* Stat cards */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        <Link to="/sessions" aria-label="View active sessions">
          <StatCard title="Active Sessions" value={sessions.length} />
        </Link>
        <Link to="/named-sessions" aria-label="View named sessions">
          <StatCard
            title="Named Sessions"
            value={activeNamedSessions}
          />
        </Link>
        <Link to="/tasks" aria-label="View running tasks">
          <StatCard
            title="Running Tasks"
            value={runningTasks}
          />
        </Link>
        <Link to="/processes" aria-label="View active processes">
          <StatCard title="Active Processes" value={processes.length} />
        </Link>
        <Link to="/sessions" aria-label="View total cost">
          <StatCard title="Total Cost" value={formatCost(totalCost)} />
        </Link>
        <Link to="/sessions" aria-label="View total tokens">
          <StatCard title="Total Tokens" value={formatTokens(totalTokens)} />
        </Link>
      </div>

      {/* Observers */}
      <Card>
        <CardHeader className="pb-2 md:pb-4">
          <CardTitle className="text-base md:text-lg">Observers</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {Object.entries(observers).map(([name, status]) => (
              <Badge
                key={name}
                variant={status ? "default" : "secondary"}
                className="text-xs"
              >
                {name}: {status ? "running" : "stopped"}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Agents */}
      {agents.length > 0 && (
        <Card>
          <CardHeader className="pb-2 md:pb-4">
            <CardTitle className="text-base md:text-lg">Agents</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {agents.map((a) => (
                <Badge
                  key={a.name}
                  variant={a.status === "running" ? "default" : "destructive"}
                >
                  {a.name}: {a.status}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Config summary */}
      <Card>
        <CardHeader className="pb-2 md:pb-4">
          <CardTitle className="text-base md:text-lg">Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {Object.entries(config).map(([key, value]) => (
              <span key={key}>
                {key}: <span className="text-foreground">{String(value)}</span>
              </span>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

const StatCard = React.memo(function StatCard({ title, value }: { title: string; value: number | string }) {
  return (
    <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
      <CardHeader className="p-3 pb-1 md:p-6 md:pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground md:text-sm">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
        <p className="text-2xl font-bold md:text-3xl">{value}</p>
      </CardContent>
    </Card>
  );
});
