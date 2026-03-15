import { toast } from "sonner";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useDashboardStore } from "@/store/dashboard";
import { abortChat } from "@/api/client";
import { formatRelativeTime } from "@/lib/format";

export default function Processes() {
  const processes = useDashboardStore((s) => s.processes);

  async function handleAbort(chatId: number) {
    try {
      await abortChat(chatId);
    } catch (err) {
      toast.error(`Failed to abort: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  if (processes.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        No active processes
      </div>
    );
  }

  return (
    <div className="space-y-3 md:space-y-4">
      <h1 className="hidden text-2xl font-bold md:block">Processes</h1>

      {/* Mobile: card list */}
      <div className="space-y-2 md:hidden">
        {processes.map((p) => (
          <Card key={p.pid}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <span className="font-medium">{p.label}</span>
                <span className="font-mono text-xs text-muted-foreground">PID {p.pid}</span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-mono">{p.chat_id}</span>
                <span>{formatRelativeTime(p.registered_at)}</span>
              </div>
              <Button
                variant="destructive"
                size="sm"
                className="mt-2 w-full"
                onClick={() => handleAbort(p.chat_id)}
              >
                Abort
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Desktop: table (unchanged) */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>PID</TableHead>
              <TableHead>Label</TableHead>
              <TableHead>Chat</TableHead>
              <TableHead>Started</TableHead>
              <TableHead><span className="sr-only">Actions</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {processes.map((p) => (
              <TableRow key={p.pid}>
                <TableCell className="font-mono">{p.pid}</TableCell>
                <TableCell>{p.label}</TableCell>
                <TableCell className="font-mono text-sm">{p.chat_id}</TableCell>
                <TableCell className="text-muted-foreground">
                  {formatRelativeTime(p.registered_at)}
                </TableCell>
                <TableCell>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleAbort(p.chat_id)}
                  >
                    Abort
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
