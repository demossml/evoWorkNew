import { useEffect, useState } from "react";
import { fetchLeads, normalizeLeads, type LeadEntity } from "@entities/lead";

export function useLoadLeads(status?: string) {
  const [items, setItems] = useState<LeadEntity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const payload = await fetchLeads({ status, limit: 100 });
        if (cancelled) return;
        setItems(normalizeLeads(payload));
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Ошибка загрузки лидов");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [status]);

  return { items, loading, error };
}
