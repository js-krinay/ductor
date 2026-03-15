import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchCommands, sendMessage } from "@/api/client";
import { useDashboardStore } from "@/store/dashboard";
import type { CommandDTO } from "@/types/api";

const CATEGORY_ORDER = ["core", "agent", "skill"] as const;

const CATEGORY_LABELS: Record<string, string> = {
  core: "Core",
  agent: "Multi-Agent",
  skill: "Skills & Plugins",
};

const DESTRUCTIVE_COMMANDS = new Set([
  "restart", "stop", "stop_all", "upgrade", "agent_stop", "leave",
]);

export default function Commands() {
  const [commands, setCommands] = useState<CommandDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCmd, setActiveCmd] = useState<string | null>(null);
  const [args, setArgs] = useState("");
  const [executing, setExecuting] = useState(false);
  const [results, setResults] = useState<Record<string, string>>({});
  const sessions = useDashboardStore((s) => s.sessions);

  useEffect(() => {
    fetchCommands()
      .then((res) => setCommands(res.commands))
      .catch((err) => toast.error(`Failed to load commands: ${err.message}`))
      .finally(() => setLoading(false));
  }, []);

  const sortedSessions = [...sessions].sort((a, b) => b.last_active - a.last_active);
  const chatId = sortedSessions[0]?.chat_id;

  async function handleRun(name: string) {
    if (!chatId) {
      toast.error("No active session — send a message first");
      return;
    }
    if (DESTRUCTIVE_COMMANDS.has(name)) {
      if (!window.confirm(`Run /${name}? This is a destructive command.`)) return;
    }
    setExecuting(true);
    try {
      const text = args.trim() ? `/${name} ${args.trim()}` : `/${name}`;
      const res = await sendMessage(chatId, text);
      if (res.ok && res.result) {
        setResults((prev) => ({ ...prev, [name]: res.result!.text }));
      } else {
        toast.error(res.error ?? "Command failed");
      }
    } catch (err) {
      toast.error(`Failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setExecuting(false);
      setActiveCmd(null);
      setArgs("");
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        Loading commands…
      </div>
    );
  }

  if (commands.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        No commands available
      </div>
    );
  }

  const grouped = CATEGORY_ORDER
    .map((cat) => ({
      category: cat,
      label: CATEGORY_LABELS[cat],
      items: commands.filter((c) => c.category === cat),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="space-y-3 md:space-y-6">
      <h1 className="hidden text-2xl font-bold md:block">Commands</h1>

      {!chatId && (
        <div className="rounded border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-200">
          No active session. Commands require an active chat session to execute.
        </div>
      )}

      {grouped.map(({ category, label, items }) => (
        <div key={category} className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            {label}
          </h2>

          {/* Mobile: card list */}
          <div className="space-y-2 md:hidden">
            {items.map((cmd) => (
              <Card key={cmd.name}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <span className="font-mono text-sm font-medium">/{cmd.name}</span>
                      {cmd.quick && (
                        <Badge variant="outline" className="ml-2 text-[10px]">⚡</Badge>
                      )}
                      <p className="mt-0.5 text-xs text-muted-foreground truncate">
                        {cmd.description}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="xs"
                      disabled={!chatId || executing}
                      onClick={() => {
                        if (activeCmd === cmd.name) {
                          handleRun(cmd.name);
                        } else {
                          setActiveCmd(cmd.name);
                          setArgs("");
                        }
                      }}
                    >
                      Run
                    </Button>
                  </div>
                  {activeCmd === cmd.name && (
                    <div className="mt-2 flex gap-2">
                      <Input
                        placeholder="args (optional)"
                        value={args}
                        onChange={(e) => setArgs(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRun(cmd.name);
                          if (e.key === "Escape") {
                            setActiveCmd(null);
                            setArgs("");
                          }
                        }}
                        className="h-7 text-xs"
                        autoFocus
                      />
                      <Button size="xs" onClick={() => handleRun(cmd.name)} disabled={executing}>
                        {executing ? "…" : "▸"}
                      </Button>
                    </div>
                  )}
                  {results[cmd.name] && (
                    <pre className="mt-2 max-h-40 overflow-auto rounded bg-accent/20 p-2 text-xs font-mono whitespace-pre-wrap">
                      {results[cmd.name]}
                    </pre>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-48">Command</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-16 text-center">Quick</TableHead>
                  <TableHead className="w-24"><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((cmd) => (
                  <TableRow key={cmd.name}>
                    <TableCell className="font-mono text-sm">/{cmd.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{cmd.description}</TableCell>
                    <TableCell className="text-center">{cmd.quick ? "⚡" : ""}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="xs"
                        disabled={!chatId || executing}
                        onClick={() => {
                          if (activeCmd === cmd.name) {
                            handleRun(cmd.name);
                          } else {
                            setActiveCmd(cmd.name);
                            setArgs("");
                          }
                        }}
                      >
                        Run
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {items.map((cmd) => {
                  const isActive = activeCmd === cmd.name;
                  const hasResult = results[cmd.name];
                  if (!isActive && !hasResult) return null;
                  return (
                    <TableRow key={`${cmd.name}-detail`}>
                      <TableCell colSpan={4} className="bg-accent/20 p-3">
                        {isActive && (
                          <div className="flex gap-2 items-center">
                            <span className="font-mono text-sm text-muted-foreground">
                              /{cmd.name}
                            </span>
                            <Input
                              placeholder="args (optional)"
                              value={args}
                              onChange={(e) => setArgs(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleRun(cmd.name);
                                if (e.key === "Escape") {
                                  setActiveCmd(null);
                                  setArgs("");
                                }
                              }}
                              className="h-7 max-w-xs text-xs"
                              autoFocus
                            />
                            <Button
                              size="xs"
                              onClick={() => handleRun(cmd.name)}
                              disabled={executing}
                            >
                              {executing ? "…" : "Execute"}
                            </Button>
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() => {
                                setActiveCmd(null);
                                setArgs("");
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        )}
                        {hasResult && (
                          <pre className="mt-2 max-h-60 overflow-auto rounded bg-background/50 p-2 text-xs font-mono whitespace-pre-wrap">
                            {results[cmd.name]}
                          </pre>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      ))}
    </div>
  );
}
