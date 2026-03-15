import { toast } from "sonner";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { useDashboardStore } from "@/store/dashboard";
import { abortChat } from "@/api/client";
import { formatRelativeTime } from "@/lib/format";

export default function Processes() {
  const processes = useDashboardStore((s) => s.processes);
  const lastSnapshotAt = useDashboardStore((s) => s.lastSnapshotAt);

  async function handleAbort(chatId: number) {
    try {
      await abortChat(chatId);
    } catch (err) {
      toast.error(`Failed to abort: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  if (processes.length === 0) {
    return <EmptyState loading={!lastSnapshotAt} title="No active processes" icon="⬧" />;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Processes</h1>
      <div className="overflow-x-auto">
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
