import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/EmptyState";
import { useDashboardStore } from "@/store/dashboard";
import { formatCost, formatTokens, formatRelativeTime } from "@/lib/format";

type SortKey = "last_active" | "total_cost_usd" | "total_tokens" | "message_count";

export default function Sessions() {
  const sessions = useDashboardStore((s) => s.sessions);
  const lastSnapshotAt = useDashboardStore((s) => s.lastSnapshotAt);
  const navigate = useNavigate();
  const [sortKey, setSortKey] = useState<SortKey>("last_active");
  const [sortAsc, setSortAsc] = useState(false);

  const sorted = useMemo(() => {
    const copy = [...sessions];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
    return copy;
  }, [sessions, sortKey, sortAsc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(false);
    }
  }

  function sortHeaderProps(key: SortKey) {
    return {
      role: "columnheader" as const,
      "aria-sort": (sortKey === key ? (sortAsc ? "ascending" : "descending") : "none") as
        "ascending" | "descending" | "none",
      tabIndex: 0,
      className: "cursor-pointer",
      onClick: () => toggleSort(key),
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggleSort(key);
        }
      },
    };
  }

  function sortIndicator(key: SortKey) {
    if (sortKey !== key) return null;
    return sortAsc ? " \u25B2" : " \u25BC";
  }

  if (sessions.length === 0) {
    return <EmptyState loading={!lastSnapshotAt} title="No active sessions" icon="◎" />;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Sessions</h1>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Chat</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Model</TableHead>
              <TableHead>Topic</TableHead>
              <TableHead {...sortHeaderProps("message_count")}>
                Messages{sortIndicator("message_count")}
              </TableHead>
              <TableHead {...sortHeaderProps("total_cost_usd")}>
                Cost{sortIndicator("total_cost_usd")}
              </TableHead>
              <TableHead {...sortHeaderProps("total_tokens")}>
                Tokens{sortIndicator("total_tokens")}
              </TableHead>
              <TableHead {...sortHeaderProps("last_active")}>
                Last Active{sortIndicator("last_active")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((s) => (
              <TableRow
                key={s.chat_id}
                className="cursor-pointer hover:bg-accent/50"
                onClick={() => navigate(`/sessions/${s.chat_id}`)}
                tabIndex={0}
                role="link"
                onKeyDown={(e) => {
                  if (e.key === "Enter") navigate(`/sessions/${s.chat_id}`);
                }}
              >
                <TableCell className="font-mono text-sm">{s.chat_id}</TableCell>
                <TableCell>
                  <Badge variant="outline">{s.provider}</Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{s.model}</TableCell>
                <TableCell>{s.topic_name ?? "\u2014"}</TableCell>
                <TableCell>{s.message_count}</TableCell>
                <TableCell>{formatCost(s.total_cost_usd)}</TableCell>
                <TableCell>{formatTokens(s.total_tokens)}</TableCell>
                <TableCell className="text-muted-foreground">
                  {formatRelativeTime(s.last_active)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
