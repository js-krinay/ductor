import { toast } from "sonner";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
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
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Processes</h1>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>PID</TableHead>
            <TableHead>Label</TableHead>
            <TableHead>Chat</TableHead>
            <TableHead>Started</TableHead>
            <TableHead></TableHead>
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
  );
}
