import { toast } from "sonner";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDashboardStore } from "@/store/dashboard";
import { cancelTask } from "@/api/client";
import { formatDuration } from "@/lib/format";

export default function Tasks() {
  const tasks = useDashboardStore((s) => s.tasks);

  async function handleCancel(taskId: string) {
    try {
      await cancelTask(taskId);
    } catch (err) {
      toast.error(`Failed to cancel task: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  if (tasks.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        No tasks
      </div>
    );
  }

  const statusVariant = (s: string) =>
    s === "running" ? "default" : s === "done" ? "secondary" : "destructive";

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Tasks</h1>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Agent</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Provider</TableHead>
            <TableHead>Elapsed</TableHead>
            <TableHead>Prompt</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.map((t) => (
            <TableRow key={t.task_id}>
              <TableCell className="font-medium">{t.name}</TableCell>
              <TableCell>{t.parent_agent}</TableCell>
              <TableCell>
                <Badge variant={statusVariant(t.status)}>{t.status}</Badge>
              </TableCell>
              <TableCell>
                <Badge variant="outline">{t.provider}</Badge>
              </TableCell>
              <TableCell>{formatDuration(t.elapsed_seconds)}</TableCell>
              <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                {t.prompt_preview}
              </TableCell>
              <TableCell>
                {t.status === "running" && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleCancel(t.task_id)}
                  >
                    Cancel
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
