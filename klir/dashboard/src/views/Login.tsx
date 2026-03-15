import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuthStore } from "@/store/auth";

export default function Login() {
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const storeToken = useAuthStore((s) => s.setToken);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const trimmed = token.trim();
    try {
      const res = await fetch("/api/health", {
        headers: { Authorization: `Bearer ${trimmed}` },
      });
      if (res.ok) {
        storeToken(trimmed);
        navigate("/", { replace: true });
      } else {
        setError("Invalid token");
      }
    } catch {
      setError("Connection failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-center text-2xl">klir</CardTitle>
          <p className="text-center text-sm text-muted-foreground">Mission Control</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="token">API Token</Label>
              <Input
                id="token"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste your API token"
                autoFocus
                aria-describedby={error ? "token-error" : undefined}
              />
              <p className="text-xs text-muted-foreground">
                Found in your klir config or shown during setup
              </p>
            </div>
            {error && (
              <p id="token-error" role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={loading || !token.trim()}>
              {loading ? "Connecting..." : "Connect"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
