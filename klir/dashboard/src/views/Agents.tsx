import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useDashboardStore } from "@/store/dashboard";
import { formatDuration } from "@/lib/format";

export default function Agents() {
  const agents = useDashboardStore((s) => s.agents);

  if (agents.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        No agents configured
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Agents</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {agents.map((a) => (
          <Card key={a.name}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{a.name}</CardTitle>
                <Badge variant={a.status === "running" ? "default" : "destructive"}>
                  {a.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Uptime</span>
                <span>{formatDuration(a.uptime_seconds)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Restarts</span>
                <span>{a.restart_count}</span>
              </div>
              {a.last_crash_error && (
                <div className="rounded bg-destructive/10 p-2 text-xs text-destructive">
                  {a.last_crash_error}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
