import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { getAuthHeaders } from "@shared/api";
import { TIMEZONES, timezoneLabel } from "@/lib/timezones";

interface ShopTz {
	uuid: string;
	name: string;
	timezone: string | null;
	effective_timezone: string;
}

/**
 * TimezoneCard — настройка часового пояса сети и магазинов (Settings).
 * SUPERADMIN: default сети + «Применить ко всем» + override на магазин.
 */
export function TimezoneCard() {
	const [defaultTz, setDefaultTz] = useState("Europe/Moscow");
	const [applyAll, setApplyAll] = useState(true);
	const [shops, setShops] = useState<ShopTz[]>([]);
	const [saving, setSaving] = useState(false);
	const [message, setMessage] = useState<string | null>(null);

	useEffect(() => {
		(async () => {
			try {
				const tzRes = await fetch("/api/tenant/timezone", { headers: getAuthHeaders() });
				if (tzRes.ok) {
					const d = await tzRes.json();
					setDefaultTz(d.default_timezone || "Europe/Moscow");
				}
				const shopsRes = await fetch("/api/tenant/shops", { headers: getAuthHeaders() });
				if (shopsRes.ok) {
					const d = await shopsRes.json();
					setShops((d.shops ?? []) as ShopTz[]);
				}
			} catch {
				/* ignore */
			}
		})();
	}, []);

	const saveTenant = async () => {
		setSaving(true);
		setMessage(null);
		try {
			const res = await fetch("/api/tenant/timezone", {
				method: "PUT",
				headers: getAuthHeaders(),
				body: JSON.stringify({ default_timezone: defaultTz, apply_to_all_shops: applyAll }),
			});
			if (!res.ok) throw new Error(String(res.status));
			setMessage("Сохранено");
		} catch {
			setMessage("Ошибка сохранения");
		} finally {
			setSaving(false);
		}
	};

	const saveShop = async (uuid: string, tz: string | null) => {
		setShops((prev) => prev.map((s) => (s.uuid === uuid ? { ...s, timezone: tz } : s)));
		try {
			await fetch(`/api/tenant/shops/${uuid}/timezone`, {
				method: "PUT",
				headers: getAuthHeaders(),
				body: JSON.stringify({ timezone: tz }),
			});
		} catch {
			/* ignore */
		}
	};

	return (
		<div className="space-y-3">
			<div className="flex items-end gap-2 flex-wrap">
				<div className="flex-1 min-w-[200px]">
					<label className="text-xs text-muted-foreground">Часовой пояс сети</label>
					<select
						value={defaultTz}
						onChange={(e) => setDefaultTz(e.target.value)}
						className="mt-1 w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50"
					>
						{TIMEZONES.map((t) => (
							<option key={t.value} value={t.value}>{t.label}</option>
						))}
					</select>
				</div>
				<button
					onClick={saveTenant}
					disabled={saving}
					className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition disabled:opacity-50"
				>
					{saving && <Loader2 className="w-4 h-4 animate-spin" />}
					Сохранить
				</button>
			</div>

			<label className="flex items-center gap-2 text-xs text-muted-foreground">
				<input
					type="checkbox"
					checked={applyAll}
					onChange={(e) => setApplyAll(e.target.checked)}
					className="accent-primary"
				/>
				Применить ко всем магазинам
			</label>

			{message && (
				<div className={`text-xs ${message === "Сохранено" ? "text-emerald-400" : "text-red-400"}`}>
					{message}
				</div>
			)}

			{shops.length > 0 && (
				<div className="space-y-1.5 border-t border-border pt-2">
					<div className="text-xs text-muted-foreground">Магазины</div>
					{shops.map((s) => (
						<div key={s.uuid} className="flex items-center gap-2">
							<span className="text-sm flex-1 truncate">{s.name}</span>
							<select
								value={s.timezone ?? ""}
								onChange={(e) => saveShop(s.uuid, e.target.value || null)}
								className="bg-muted border border-border rounded-lg px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary/50"
							>
								<option value="">Наследовать ({timezoneLabel(s.effective_timezone)})</option>
								{TIMEZONES.map((t) => (
									<option key={t.value} value={t.value}>{t.label}</option>
								))}
							</select>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
