import { useEffect, useRef } from "react";
import { useDashboardStore } from "@/store/dashboard";
import { connect } from "@/api/ws";
import { toast } from "sonner";

export default function ConnectionBanner() {
  const connected = useDashboardStore((s) => s.connected);
  const wasDisconnected = useRef(false);

  useEffect(() => {
    if (!connected) {
      wasDisconnected.current = true;
    } else if (wasDisconnected.current) {
      wasDisconnected.current = false;
      toast.success("Reconnected");
    }
  }, [connected]);

  if (connected) return null;

  return (
    <div
      role="alert"
      className="flex items-center justify-center gap-3 bg-destructive/15 px-4 py-2 text-sm text-destructive"
    >
      <span>Disconnected &mdash; reconnecting...</span>
      <button
        type="button"
        onClick={() => connect()}
        className="rounded-md border border-destructive/30 px-2 py-0.5 text-xs transition-colors hover:bg-destructive/10"
      >
        Retry now
      </button>
    </div>
  );
}
