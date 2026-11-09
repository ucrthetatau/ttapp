import { useEffect, useState } from "react";
import type { HealthResponse } from "@ttapp/shared";

// Placeholder home screen: proves the frontend can reach the backend using a shared type.
export default function HomePage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((res) => {
        if (!res.ok) throw new Error(`Backend responded ${res.status}`);
        return res.json() as Promise<HealthResponse>;
      })
      .then(setHealth)
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <main className="mx-auto max-w-2xl space-y-4 pt-5">
      <h1 className="text-[28px] font-bold text-ink">Theta Tau Hub</h1>
      <p className="card text-ink/70">
        {health && "Backend is running."}
        {error && `Can't reach the backend: ${error}`}
        {!health && !error && "Checking backend…"}
      </p>
    </main>
  );
}
