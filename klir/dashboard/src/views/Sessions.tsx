import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useDashboardStore } from "@/store/dashboard";
import { formatCost, formatTokens, formatRelativeTime } from "@/lib/format";

type SortKey = "last_active" | "total_cost_usd" | "total_tokens" | "message_count";

export default function Sessions() {
  const sessions = useDashboardStore((s) => s.sessions);
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

  if (sessions.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        No active sessions
      </div>
    );
  }

  return (
    <div className="space-y-3 md:space-y-4">
      <h1 className="hidden text-2xl font-bold md:block">Sessions</h1>

      {/* Mobile: card list */}
      <div className="space-y-2 md:hidden">
        {sorted.map((s) => (
          <Card
            key={s.chat_id}
            className="cursor-pointer hover:bg-accent/50 transition-colors"
            tabIndex={0}
            role="link"
            onClick={() => navigate(`/sessions/${s.chat_id}`)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate(`/sessions/${s.chat_id}`); } }}
          >
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm">{s.chat_id}</span>
                <Badge variant="outline">{s.provider}</Badge>
              </div>
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <span>{s.model}</span>
                {s.topic_name && <span>· {s.topic_name}</span>}
              </div>
              <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                <span>{s.message_count} msgs</span>
                <span>{formatCost(s.total_cost_usd)}</span>
                <span>{formatTokens(s.total_tokens)}</span>
                <span className="ml-auto">{formatRelativeTime(s.last_active)}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Desktop: sortable table */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Chat</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Model</TableHead>
              <TableHead>Topic</TableHead>
              <TableHead
                className="cursor-pointer select-none"
                role="columnheader"
                tabIndex={0}
                aria-sort={sortKey === "message_count" ? (sortAsc ? "ascending" : "descending") : "none"}
                onClick={() => toggleSort("message_count")}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleSort("message_count"); } }}
              >
                Messages {sortKey === "message_count" ? (sortAsc ? "▲" : "▼") : ""}
              </TableHead>
              <TableHead
                className="cursor-pointer select-none"
                role="columnheader"
                tabIndex={0}
                aria-sort={sortKey === "total_cost_usd" ? (sortAsc ? "ascending" : "descending") : "none"}
                onClick={() => toggleSort("total_cost_usd")}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleSort("total_cost_usd"); } }}
              >
                Cost {sortKey === "total_cost_usd" ? (sortAsc ? "▲" : "▼") : ""}
              </TableHead>
              <TableHead
                className="cursor-pointer select-none"
                role="columnheader"
                tabIndex={0}
                aria-sort={sortKey === "total_tokens" ? (sortAsc ? "ascending" : "descending") : "none"}
                onClick={() => toggleSort("total_tokens")}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleSort("total_tokens"); } }}
              >
                Tokens {sortKey === "total_tokens" ? (sortAsc ? "▲" : "▼") : ""}
              </TableHead>
              <TableHead
                className="cursor-pointer select-none"
                role="columnheader"
                tabIndex={0}
                aria-sort={sortKey === "last_active" ? (sortAsc ? "ascending" : "descending") : "none"}
                onClick={() => toggleSort("last_active")}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleSort("last_active"); } }}
              >
                Last Active {sortKey === "last_active" ? (sortAsc ? "▲" : "▼") : ""}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((s) => (
              <TableRow
                key={s.chat_id}
                className="cursor-pointer hover:bg-accent/50"
                tabIndex={0}
                role="link"
                onClick={() => navigate(`/sessions/${s.chat_id}`)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate(`/sessions/${s.chat_id}`); } }}
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
