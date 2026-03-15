import { Fragment, useState } from "react";
import { toast } from "sonner";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useDashboardStore } from "@/store/dashboard";
import { toggleCronJob, fetchCronHistory } from "@/api/client";
import type { CronRunEntry } from "@/types/api";
import { formatDuration, formatRelativeTime } from "@/lib/format";

export default function Cron() {
  const cronJobs = useDashboardStore((s) => s.cronJobs);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [runHistory, setRunHistory] = useState<CronRunEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  async function handleToggle(jobId: string, enabled: boolean) {
    try {
      await toggleCronJob(jobId, enabled);
    } catch (err) {
      toast.error(`Failed to toggle job: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  async function handleExpand(jobId: string) {
    if (expandedId === jobId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(jobId);
    setRunHistory([]);
    setHistoryError(null);
    setLoadingHistory(true);
    try {
      const res = await fetchCronHistory(jobId);
      setRunHistory(res.runs);
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : "Failed to load history");
    } finally {
      setLoadingHistory(false);
    }
  }

  if (cronJobs.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        No cron jobs configured
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Cron Jobs</h1>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Schedule</TableHead>
            <TableHead>Enabled</TableHead>
            <TableHead>Last Duration</TableHead>
            <TableHead>Errors</TableHead>
            <TableHead>Provider</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {cronJobs.map((job) => (
            <Fragment key={job.id}>
              <TableRow
                className="cursor-pointer hover:bg-accent/50"
                onClick={() => handleExpand(job.id)}
              >
                <TableCell className="font-medium">{job.title}</TableCell>
                <TableCell className="font-mono text-sm">{job.schedule}</TableCell>
                <TableCell>
                  <Switch
                    checked={job.enabled}
                    onCheckedChange={(v) => handleToggle(job.id, v)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </TableCell>
                <TableCell>
                  {job.last_duration_ms != null
                    ? formatDuration(job.last_duration_ms / 1000)
                    : "\u2014"}
                </TableCell>
                <TableCell>
                  {job.consecutive_errors > 0 ? (
                    <Badge variant="destructive">{job.consecutive_errors}</Badge>
                  ) : (
                    "0"
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{job.provider}</Badge>
                </TableCell>
              </TableRow>

              {/* Expanded run history */}
              {expandedId === job.id && (
                <TableRow>
                  <TableCell colSpan={6} className="bg-accent/20 p-4">
                    {loadingHistory ? (
                      <p className="text-sm text-muted-foreground">Loading...</p>
                    ) : historyError ? (
                      <p className="text-sm text-destructive">{historyError}</p>
                    ) : runHistory.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No run history</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Time</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Duration</TableHead>
                            <TableHead>Summary</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {runHistory.map((run) => (
                            <TableRow key={run.ts}>
                              <TableCell className="text-sm">
                                {formatRelativeTime(run.ts)}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={run.status === "success" ? "default" : "destructive"}
                                >
                                  {run.status}
                                </Badge>
                              </TableCell>
                              <TableCell>{formatDuration(run.duration_ms / 1000)}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {run.error ?? run.summary}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
