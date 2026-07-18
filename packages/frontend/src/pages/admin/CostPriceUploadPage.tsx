import { useState, useCallback, useRef, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useTelegramBackButton } from "../../hooks/useSimpleTelegramBackButton";
import { client } from "../../helpers/api";
import { LoadingState, ErrorState } from "@shared/ui/states";
import { Trash2, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, X, Calendar, Info } from "lucide-react";
import { telegram } from "../../helpers/telegram";

interface CostPriceRecord {
	productName: string;
	costPrice: number;
	updatedAt: string;
	effectiveFrom: string;
	effectiveTo: string | null;
}

interface UploadResult {
	ok: boolean;
	inserted: number;
	updated: number;
	skipped: number;
	effectiveDate: string;
	meta: {
		totalRows: number;
		parsedRows: number;
		skippedRows: number;
		columnsFound: string[];
	};
	warnings?: string[];
}

/** Формат today как YYYY-MM-DD для input[type=date] */
function todayStr(): string {
	return new Date().toISOString().slice(0, 10);
}

export default function CostPriceUploadPage() {
	useTelegramBackButton();

	const queryClient = useQueryClient();
	const fileInputRef = useRef<HTMLInputElement>(null);

	// Дата вступления в силу (по умолчанию сегодня)
	const [effectiveDate, setEffectiveDate] = useState<string>(todayStr());
	const isPastDate = effectiveDate < todayStr();

	// Состояния загрузки файла
	const [isUploading, setIsUploading] = useState(false);
	const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
	const [uploadError, setUploadError] = useState<string | null>(null);
	const [deleteError, setDeleteError] = useState<string | null>(null);

	// Запрос списка себестоимостей
	const {
		data: costPricesData,
		isLoading,
		error,
		refetch,
	} = useQuery({
		queryKey: ["admin", "cost-prices"],
		queryFn: async () => {
			const res = await client["api"]["admin"]["cost-prices"].$get();
			if (!res.ok) throw new Error(`Ошибка ${res.status}`);
			return res.json() as Promise<{ rows: CostPriceRecord[]; total: number }>;
		},
		staleTime: 30_000,
	});

	// Группируем по productName, берём только активные (effectiveTo IS NULL)
	const activeRows = useMemo(() => {
		const all = costPricesData?.rows ?? [];
		// Показываем текущие цены: effectiveTo IS NULL
		const active = all.filter(r => r.effectiveTo === null);
		// Убираем дубликаты (один товар — одна активная запись)
		const seen = new Set<string>();
		return active.filter(r => {
			if (seen.has(r.productName)) return false;
			seen.add(r.productName);
			return true;
		});
	}, [costPricesData]);

	// Загрузка файла
	const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;

		setIsUploading(true);
		setUploadResult(null);
		setUploadError(null);

		try {
			const formData = new FormData();
			formData.append("file", file);
			formData.append("effectiveDate", effectiveDate);

			// Авторизация: в Telegram Mini App — реальный initData (криптоподпись),
			// в браузере — guest + telegram-id из localStorage
			const tgInitData = telegram?.WebApp?.initData || "";
			const storedId = localStorage.getItem("telegramId") || "";
			const initDataHeader = tgInitData || (storedId ? "guest" : "");

			const res = await fetch("/api/admin/cost-prices/upload", {
				method: "POST",
				headers: {
					initData: initDataHeader || "guest",
					"telegram-id": storedId,
				},
				body: formData,
			});

			if (!res.ok) {
				const errData = await res.json() as any;
				const msg = errData?.error || `Ошибка ${res.status}`;
				if (errData?.details?.length) {
					throw new Error(`${msg}\n${errData.details.slice(0, 5).join("\n")}`);
				}
				throw new Error(msg);
			}

			const data = await res.json() as UploadResult;
			setUploadResult(data);
			queryClient.invalidateQueries({ queryKey: ["admin", "cost-prices"] });
		} catch (err: any) {
			setUploadError(err?.message || String(err));
		} finally {
			setIsUploading(false);
			if (fileInputRef.current) fileInputRef.current.value = "";
		}
	}, [effectiveDate, queryClient]);

	// Удаление записи
	const handleDelete = useCallback(async (productName: string) => {
		setDeleteError(null);
		try {
			const res = await client["api"]["admin"]["cost-prices"][":productName"].$delete({
				param: { productName: encodeURIComponent(productName) },
			} as any);

			if (!res.ok) {
				const errData = await res.json() as any;
				throw new Error(errData?.error || `Ошибка ${res.status}`);
			}

			queryClient.invalidateQueries({ queryKey: ["admin", "cost-prices"] });
		} catch (err: any) {
			setDeleteError(err?.message || String(err));
		}
	}, [queryClient]);

	const formatDate = (dateStr: string) => {
		if (!dateStr) return "—";
		const d = new Date(dateStr + "Z");
		return d.toLocaleDateString("ru-RU", {
			day: "2-digit", month: "2-digit", year: "numeric",
			hour: "2-digit", minute: "2-digit",
		});
	};

	const formatDateShort = (dateStr: string) => {
		if (!dateStr) return "—";
		return new Date(dateStr + "Z").toLocaleDateString("ru-RU", {
			day: "2-digit", month: "2-digit", year: "numeric",
		});
	};

	return (
		<div className="app-safe-top min-h-screen bg-background">
			{/* Заголовок */}
			<div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border px-4 py-4 app-safe-top">
				<h1 className="text-lg font-semibold text-foreground">
					Загрузка себестоимости
				</h1>
				<p className="text-sm text-muted-foreground mt-1">
					Загрузите CSV-файл с колонками «Название товара» и «Себестоимость»
				</p>
			</div>

			<div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
				{/* Зона загрузки */}
				<div className="bg-card border border-border rounded-xl p-6">
					{/* Выбор даты */}
					<div className="mb-4">
						<label className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
							<Calendar className="w-4 h-4 text-muted-foreground" />
							Дата вступления в силу
						</label>
						<div className="flex items-center gap-3">
							<input
								type="date"
								value={effectiveDate}
								max={todayStr()}
								onChange={(e) => setEffectiveDate(e.target.value)}
								className="flex-1 max-w-[200px] px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
							/>
							{isPastDate && (
								<span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
									<Info className="w-3.5 h-3.5" />
									Продажи с {formatDateShort(effectiveDate)} по сегодня будут пересчитаны
								</span>
							)}
						</div>
						<p className="text-xs text-muted-foreground mt-1.5">
							По умолчанию — сегодня. Измените, если себестоимость начала действовать раньше.
						</p>
					</div>

					{/* Drag & drop зона */}
					<label
						className={`
							flex flex-col items-center justify-center gap-3
							border-2 border-dashed rounded-lg p-8 cursor-pointer
							transition-colors duration-200
							${isUploading
								? "border-primary/50 bg-primary/5 pointer-events-none"
								: "border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/50"
							}
						`}
					>
						<input
							ref={fileInputRef}
							type="file"
							accept=".csv,.txt,.tsv"
							onChange={handleFileChange}
							disabled={isUploading}
							className="hidden"
						/>

						{isUploading ? (
							<>
								<div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
								<span className="text-sm text-muted-foreground">Загрузка...</span>
							</>
						) : (
							<>
								<div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
									<FileSpreadsheet className="w-6 h-6 text-primary" />
								</div>
								<div className="text-center">
									<p className="text-sm font-medium text-foreground">
										Нажмите для выбора файла
									</p>
									<p className="text-xs text-muted-foreground mt-1">
										CSV, TXT — до 10 МБ
									</p>
								</div>
							</>
						)}
					</label>

					{/* Результат загрузки */}
					<AnimatePresence>
						{uploadResult && (
							<motion.div
								initial={{ opacity: 0, y: 8 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0 }}
								className="mt-4 p-4 bg-success/10 border border-success/30 rounded-lg"
							>
								<div className="flex items-start gap-3">
									<CheckCircle2 className="w-5 h-5 text-success mt-0.5 shrink-0" />
									<div>
										<p className="text-sm font-medium text-foreground">
											Добавлено: {uploadResult.inserted}
											{uploadResult.updated > 0 && ` · Обновлено: ${uploadResult.updated}`}
											{uploadResult.skipped > 0 && ` · Пропущено: ${uploadResult.skipped}`}
										</p>
										<p className="text-xs text-muted-foreground mt-1">
											Дата: {formatDateShort(uploadResult.effectiveDate)}
											{" · "}Всего строк: {uploadResult.meta.totalRows}
											{" · "}Распознано: {uploadResult.meta.parsedRows}
										</p>
										<p className="text-xs text-muted-foreground">
											Колонки: {uploadResult.meta.columnsFound.join(", ")}
										</p>
									</div>
									<button
										type="button"
										onClick={() => setUploadResult(null)}
										className="ml-auto p-1 text-muted-foreground hover:text-foreground"
									>
										<X className="w-4 h-4" />
									</button>
								</div>
							</motion.div>
						)}

						{uploadError && (
							<motion.div
								initial={{ opacity: 0, y: 8 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0 }}
								className="mt-4 p-4 bg-destructive/10 border border-destructive/30 rounded-lg"
							>
								<div className="flex items-start gap-3">
									<AlertTriangle className="w-5 h-5 text-destructive mt-0.5 shrink-0" />
									<div>
										<p className="text-sm font-medium text-destructive">Ошибка загрузки</p>
										<pre className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{uploadError}</pre>
									</div>
									<button
										type="button"
										onClick={() => setUploadError(null)}
										className="ml-auto p-1 text-muted-foreground hover:text-foreground"
									>
										<X className="w-4 h-4" />
									</button>
								</div>
							</motion.div>
						)}
					</AnimatePresence>
				</div>

				{/* Ошибка удаления */}
				<AnimatePresence>
					{deleteError && (
						<motion.div
							initial={{ opacity: 0, y: 8 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0 }}
							className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg flex items-start gap-2"
						>
							<AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
							<p className="text-sm text-destructive">{deleteError}</p>
							<button
								type="button"
								onClick={() => setDeleteError(null)}
								className="ml-auto p-1 text-muted-foreground hover:text-foreground"
							>
								<X className="w-4 h-4" />
							</button>
						</motion.div>
					)}
				</AnimatePresence>

				{/* Таблица себестоимостей */}
				<div className="bg-card border border-border rounded-xl overflow-hidden">
					<div className="px-4 py-3 border-b border-border flex items-center justify-between">
						<h2 className="text-sm font-semibold text-foreground">
							Текущие себестоимости
							{activeRows.length > 0 && (
								<span className="ml-2 text-muted-foreground font-normal">({activeRows.length})</span>
							)}
						</h2>
					</div>

					{isLoading ? (
						<div className="py-12"><LoadingState /></div>
					) : error ? (
						<div className="py-8"><ErrorState onRetry={() => refetch()} /></div>
					) : activeRows.length === 0 ? (
						<div className="py-12 text-center">
							<div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
								<Upload className="w-6 h-6 text-muted-foreground" />
							</div>
							<p className="text-sm text-muted-foreground">Нет загруженных себестоимостей</p>
							<p className="text-xs text-muted-foreground mt-1">Загрузите CSV-файл, чтобы увидеть данные</p>
						</div>
					) : (
						<div className="overflow-x-auto">
							<table className="w-full text-sm">
								<thead>
									<tr className="border-b border-border bg-muted/50">
										<th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Товар</th>
										<th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Себестоимость</th>
										<th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider w-28">Действует с</th>
										<th className="w-12 px-2 py-3" />
									</tr>
								</thead>
								<tbody className="divide-y divide-border">
									{activeRows.map((row, i) => (
										<tr key={row.productName} className={`transition-colors hover:bg-muted/30 ${i % 2 === 0 ? "bg-card" : "bg-muted/10"}`}>
											<td className="px-4 py-3 text-foreground max-w-[300px] truncate">{row.productName}</td>
											<td className="px-4 py-3 text-right font-mono text-foreground tabular-nums">{row.costPrice.toFixed(2)} ₽</td>
											<td className="px-4 py-3 text-right text-muted-foreground text-xs">{formatDateShort(row.effectiveFrom)}</td>
											<td className="px-2 py-3 text-center">
												<button
													type="button"
													onClick={() => handleDelete(row.productName)}
													className="p-1.5 text-muted-foreground hover:text-destructive rounded-md hover:bg-destructive/10 transition-colors"
													title="Удалить текущую цену"
												>
													<Trash2 className="w-4 h-4" />
												</button>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</div>

				{/* Подсказка по формату */}
				<div className="bg-muted/30 border border-border rounded-lg p-4">
					<h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Формат CSV-файла</h3>
					<pre className="text-xs text-muted-foreground bg-background rounded p-3 overflow-x-auto">
						{`Название товара;Себестоимость
Сигареты Winston Blue;145.50
Пиво Heineken 0.5л;89.00
Вода BonAqua 0.5л;35.00`}
					</pre>
					<p className="text-xs text-muted-foreground mt-2">
						Разделители: запятая, точка с запятой или табуляция. Названия колонок определяются автоматически.
					</p>
				</div>
			</div>
		</div>
	);
}
