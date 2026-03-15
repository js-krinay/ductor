import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { useDashboardStore } from "@/store/dashboard";

const STATUSES = ["all", "running", "idle", "ended"] as const;

export default function NamedSessions() {
  const namedSessions = useDashboardStore((s) => s.namedSessions);
  const lastSnapshotAt = useDashboardStore((s) => s.lastSnapshotAt);
  const [filter, setFilter] = useState<string>("all");

  const filtered =
    filter === "all" ? namedSessions : namedSessions.filter((ns) => ns.status === filter);

  if (namedSessions.length === 0) {
    return <EmptyState loading={!lastSnapshotAt} title="No named sessions" icon="◈" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Named Sessions</h1>
        <div className="flex gap-1" role="group" aria-label="Filter by status">
          {STATUSES.map((s) => (
            <Button
              key={s}
              variant={filter === s ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(s)}
            >
              {s}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((ns) => (
          <Card key={ns.name}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{ns.name}</CardTitle>
                <StatusBadge status={ns.status} />
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <Badge variant="outline">{ns.provider}</Badge>
                <span className="text-muted-foreground">{ns.model}</span>
              </div>
              <p className="text-muted-foreground line-clamp-2">{ns.prompt_preview}</p>
              <p className="text-xs text-muted-foreground">{ns.message_count} messages</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant = status === "running" ? "default" : status === "ended" ? "secondary" : "outline";
  return <Badge variant={variant}>{status}</Badge>;
}
