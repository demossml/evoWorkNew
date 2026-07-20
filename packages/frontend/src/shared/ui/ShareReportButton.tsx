import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Share2, Copy, Check, Loader2, X } from "lucide-react";

interface ShareReportButtonProps {
	/** Дата-фильтр: since, until */
	since: string;
	until: string;
	/** Тип отчёта для бэкенда */
	reportType?: string;
	/** Доп. параметры */
	shopId?: string;
}

/**
 * Кнопка «Поделиться отчётом» — вызывает /api/reports/share и показывает ссылку.
 * Используется на главной и в отчётах рядом с DateFilter.
 */
export function ShareReportButton({ since, until, reportType = "revenue", shopId }: ShareReportButtonProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [shareUrl, setShareUrl] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);

	const handleShare = useCallback(async () => {
		setIsLoading(true);
		setError(null);
		try {
			const res = await fetch("/api/reports/share", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					reportType,
					params: { since, until, shopId: shopId || "all" },
				}),
			});
			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				throw new Error((err as any).error || `Ошибка ${res.status}`);
			}
			const data = await res.json();
			setShareUrl(data.shareUrl);
			setIsOpen(true);
		} catch (err: any) {
			setError(err.message || "Не удалось создать ссылку");
			setIsOpen(true);
		} finally {
			setIsLoading(false);
		}
	}, [since, until, reportType, shopId]);

	const handleCopy = useCallback(async () => {
		if (!shareUrl) return;
		try {
			await navigator.clipboard.writeText(shareUrl);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			// fallback
			const ta = document.createElement("textarea");
			ta.value = shareUrl;
			document.body.appendChild(ta);
			ta.select();
			document.execCommand("copy");
			document.body.removeChild(ta);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		}
	}, [shareUrl]);

	const handleClose = () => {
		setIsOpen(false);
		setShareUrl(null);
		setError(null);
	};

	return (
		<div className="relative">
			<button
				type="button"
				onClick={handleShare}
				disabled={isLoading}
				className="rounded-lg border border-border px-3 py-2 text-sm transition bg-card text-foreground hover:bg-muted/50 disabled:opacity-50"
				title="Поделиться отчётом"
			>
				{isLoading ? (
					<Loader2 className="w-4 h-4 animate-spin" />
				) : (
					<Share2 className="w-4 h-4" />
				)}
			</button>

			<AnimatePresence>
				{isOpen && (
					<motion.div
						initial={{ opacity: 0, scale: 0.95 }}
						animate={{ opacity: 1, scale: 1 }}
						exit={{ opacity: 0, scale: 0.95 }}
						className="absolute right-0 top-full mt-2 w-80 bg-card border border-border rounded-xl shadow-lg p-4 z-50"
					>
						<div className="flex items-start justify-between mb-2">
							<span className="text-sm font-semibold text-foreground">
								Поделиться отчётом
							</span>
							<button onClick={handleClose} className="text-muted-foreground hover:text-foreground">
								<X className="w-4 h-4" />
							</button>
						</div>

						{error ? (
							<p className="text-sm text-destructive">{error}</p>
						) : shareUrl ? (
							<div className="space-y-2">
								<p className="text-xs text-muted-foreground">
									Ссылка действительна 14 дней. Открывается на любом устройстве.
								</p>
								<div className="flex items-center gap-2">
									<input
										type="text"
										value={shareUrl}
										readOnly
										className="flex-1 text-xs bg-muted border border-border rounded-lg px-2 py-1.5 text-foreground truncate"
										onFocus={(e) => e.target.select()}
									/>
									<button
										onClick={handleCopy}
										className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
											copied
												? "bg-success text-success-foreground"
												: "bg-primary text-primary-foreground hover:bg-primary/90"
										}`}
									>
										{copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
									</button>
								</div>
							</div>
						) : null}
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}
