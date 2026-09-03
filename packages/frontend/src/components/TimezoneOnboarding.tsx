import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Globe, Loader2 } from "lucide-react";
import { getAuthHeaders, queryClient } from "@shared/api";
import { TIMEZONES } from "@/lib/timezones";

interface MeResponse {
	timezone_setup_needed?: boolean;
}

/**
 * TimezoneOnboarding — показывается один раз после login/connect,
 * если backend сообщает timezone_setup_needed: true.
 * Выбор пояса сети → PUT /api/tenant/timezone (apply_to_all_shops).
 */
export function TimezoneOnboarding() {
	const [needed, setNeeded] = useState(false);
	const [checking, setChecking] = useState(true);
	const [tz, setTz] = useState("Europe/Moscow");
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		let cancelled = false;
		fetch("/api/auth/me", { headers: getAuthHeaders() })
			.then((r) => (r.ok ? (r.json() as Promise<MeResponse>) : null))
			.then((me) => {
				if (cancelled) return;
				setNeeded(Boolean(me?.timezone_setup_needed));
			})
			.catch(() => {})
			.finally(() => {
				if (!cancelled) setChecking(false);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	const save = async (value: string) => {
		setSaving(true);
		try {
			await fetch("/api/tenant/timezone", {
				method: "PUT",
				headers: getAuthHeaders(),
				body: JSON.stringify({ default_timezone: value, apply_to_all_shops: true }),
			});
			queryClient.invalidateQueries({ queryKey: ["tenant-timezone"] });
			setNeeded(false);
		} catch {
			/* оставляем модалку */
		} finally {
			setSaving(false);
		}
	};

	if (checking || !needed) return null;

	return (
		<div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
			<motion.div
				initial={{ opacity: 0, y: 20 }}
				animate={{ opacity: 1, y: 0 }}
				className="w-full max-w-md rounded-t-2xl sm:rounded-2xl bg-card border border-border p-5 space-y-4"
			>
				<div className="flex items-center gap-3">
					<span className="text-primary"><Globe className="w-6 h-6" /></span>
					<div>
						<h2 className="text-base font-bold text-foreground">Часовой пояс сети</h2>
						<p className="text-xs text-muted-foreground">
							Отчёты и «сегодня» будут считаться в выбранном поясе.
						</p>
					</div>
				</div>

				<select
					value={tz}
					onChange={(e) => setTz(e.target.value)}
					className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50"
				>
					{TIMEZONES.map((t) => (
						<option key={t.value} value={t.value}>{t.label}</option>
					))}
				</select>

				<div className="flex gap-2">
					<button
						onClick={() => save("Europe/Moscow")}
						disabled={saving}
						className="flex-1 py-2 text-sm rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 transition disabled:opacity-50"
					>
						Москва
					</button>
					<button
						onClick={() => save(tz)}
						disabled={saving}
						className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition disabled:opacity-50"
					>
						{saving && <Loader2 className="w-4 h-4 animate-spin" />}
						Сохранить
					</button>
				</div>
				<p className="text-[11px] text-muted-foreground">
					Применится ко всем магазинам сети. Позже пояс можно изменить в Настройках.
				</p>
			</motion.div>
		</div>
	);
}
