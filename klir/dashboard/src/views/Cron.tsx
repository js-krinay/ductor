import { Fragment, useState } from "react";
import { toast } from "sonner";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
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
    <div className="space-y-3 md:space-y-4">
      <h1 className="hidden text-2xl font-bold md:block">Cron Jobs</h1>

      {/* Mobile: card list */}
      <div className="space-y-2 md:hidden">
        {cronJobs.map((job) => (
          <Card key={job.id}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <span
                  className="font-medium cursor-pointer text-primary hover:underline"
                  role="button"
                  tabIndex={0}
                  onClick={() => handleExpand(job.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleExpand(job.id);
                    }
                  }}
                >
                  {job.title} {expandedId === job.id ? "\u25be" : "\u25b8"}
                </span>
                <Switch
                  checked={job.enabled}
                  onCheckedChange={(v) => handleToggle(job.id, v)}
                />
              </div>
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-mono">{job.schedule}</span>
                <Badge variant="outline">{job.provider}</Badge>
                {job.consecutive_errors > 0 && (
                  <Badge variant="destructive">{job.consecutive_errors} errors</Badge>
                )}
              </div>
              {job.last_duration_ms != null && (
                <div className="mt-1 text-xs text-muted-foreground">
                  Last: {formatDuration(job.last_duration_ms / 1000)}
                </div>
              )}

              {/* Expanded run history */}
              {expandedId === job.id && (
                <div className="mt-3 rounded bg-accent/20 p-2">
                  {loadingHistory ? (
                    <p className="text-xs text-muted-foreground">Loading...</p>
                  ) : historyError ? (
                    <p className="text-xs text-destructive">{historyError}</p>
                  ) : runHistory.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No run history</p>
                  ) : (
                    <div className="space-y-2">
                      {runHistory.map((run) => (
                        <div key={run.ts} className="flex items-center gap-2 text-xs">
                          <Badge
                            variant={run.status === "success" ? "default" : "destructive"}
                          >
                            {run.status}
                          </Badge>
                          <span>{formatRelativeTime(run.ts)}</span>
                          <span>{formatDuration(run.duration_ms / 1000)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Desktop: table (unchanged) */}
      <div className="hidden md:block">
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
                  tabIndex={0}
                  role="button"
                  aria-expanded={expandedId === job.id}
                  onClick={() => handleExpand(job.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleExpand(job.id);
                    }
                  }}
                >
                  <TableCell className="font-medium">{job.title}</TableCell>
                  <TableCell className="font-mono text-sm">{job.schedule}</TableCell>
                  <TableCell>
                    <Switch
                      checked={job.enabled}
                      onCheckedChange={(v) => handleToggle(job.id, v)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Toggle ${job.title}`}
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
                        <Table aria-label="Run history">
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
    </div>
  );
}
