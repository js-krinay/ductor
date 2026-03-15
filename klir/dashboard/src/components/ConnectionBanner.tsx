import { useDashboardStore } from "@/store/dashboard";

export default function ConnectionBanner() {
  const connected = useDashboardStore((s) => s.connected);

  if (connected) return null;

  return (
    <div className="bg-destructive/15 px-4 py-2 text-center text-sm text-destructive">
      Disconnected — reconnecting...
    </div>
  );
}
