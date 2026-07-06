import React from "react";
import { motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  CheckSquare,
  LineChart,
  NotebookText,
  Package,
  TrendingDown,
  type LucideIcon,
} from "lucide-react";
import { fetchDashboardSummaryInsights } from "@features/dashboard/api";

export type DashboardSummaryAiInsights = {
  risk: {
    networkProbability: number;
    redShops: Array<{
      shopName: string;
      risk: number;
      progress: number;
      plan: number;
      fact: number;
      missing: number;
    }>;
  };
  actions: {
    top3: string[];
    checklist: Array<{ shopName: string; items: string[] }>;
  };
  forecast: {
    value: number;
    lower: number;
    upper: number;
    confidence: number;
    factors: Array<{
      label: string;
      value: string;
      impact: "plus" | "minus" | "neutral";
    }>;
  };
  drop: {
    salesDeltaPct: number;
    mainReason: string;
    byShop: Array<{ shopName: string; deltaPct: number; current: number; previous: number }>;
  };
  anomalies: {
    incidents: Array<{
      shopName: string;
      type: string;
      details: string;
      severity: number;
    }>;
  };
  losses: {
    totalLoss: number;
    skus: Array<{
      productName: string;
      planQty: number;
      actualQty: number;
      lostQty: number;
      lostRevenue: number;
    }>;
  };
  context: {
    checksDeltaPct: number;
    avgCheckDeltaPct: number;
    refundRate: number;
    refundDeltaPp: number;
  };
};

type DashboardSummary2AiText = {
  riskSummary: string;
  actions: string[];
  forecastSummary: string;
  dropMainReason: string;
  anomaliesSummary: string;
  lossesSummary: string;
  dailyDigest: string;
};

type DashboardSummary2AiResponse = {
  model: string;
  fallbackUsed: boolean;
  generatedAt: string;
  aiError?: string;
  insights: DashboardSummary2AiText;
};

export type DashboardSummaryAiSectionProps = {
  loading: boolean;
  hasData: boolean;
  since: string;
  until: string;
  aiInsights: DashboardSummaryAiInsights;
};

const formatMoney = (value: number) => {
  if (value == null || !Number.isFinite(value)) return "0";
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 0,
  }).format(Math.round(value));
};

const toPct = (value: number) => `${value.toFixed(1)}%`;

function LoadingTile({
  title,
  Icon,
}: {
  title: string;
  Icon: LucideIcon;
}) {
  return (
    <div className="rounded-lg border border-white/60 bg-indigo-100 p-4 text-indigo-600 shadow-sm dark:border-white/10 dark:bg-indigo-900/60 dark:text-indigo-300">
      <div className="flex h-[120px] flex-col items-center justify-center">
        <Icon className="h-10 w-10 animate-pulse" />
        <div className="mt-2 text-center text-sm font-semibold">{title}</div>
        <div className="text-xs opacity-80">Загрузка...</div>
      </div>
    </div>
  );
}

function AITileCard({
  title,
  metric,
  subtitle,
  Icon,
  tone,
  showNonAiBadge,
  onClick,
}: {
  title: string;
  metric: string;
  subtitle: string;
  Icon: LucideIcon;
  tone: "red" | "emerald" | "blue" | "amber" | "rose" | "violet";
  showNonAiBadge?: boolean;
  onClick: () => void;
}) {
  const tones: Record<string, string> = {
    red: "from-red-500 to-rose-600 text-red-50",
    emerald: "from-emerald-500 to-teal-600 text-emerald-50",
    blue: "from-blue-500 to-indigo-600 text-blue-50",
    amber: "from-amber-500 to-orange-600 text-amber-50",
    rose: "from-rose-500 to-pink-600 text-rose-50",
    violet: "from-violet-500 to-fuchsia-600 text-violet-50",
  };

  return (
    <motion.div
      whileHover={{ scale: 1.03, y: -2 }}
      whileTap={{ scale: 0.98 }}
      className={`relative h-[120px] cursor-pointer rounded-lg bg-gradient-to-br ${tones[tone]} p-4 shadow-sm`}
      onClick={onClick}
    >
      {showNonAiBadge ? (
        <span className="absolute right-2 top-2 rounded-full bg-white/25 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-white/95 backdrop-blur">
          не AI
        </span>
      ) : null}
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-semibold">{title}</div>
        <Icon className="h-5 w-5 opacity-90" />
      </div>
      <div className="text-2xl font-bold leading-none">{metric}</div>
      <div className="mt-2 line-clamp-2 text-xs leading-4 opacity-90">
        {subtitle}
      </div>
    </motion.div>
  );
}

function AIDetailsPanel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg bg-white p-4 shadow dark:bg-gray-800">
      <h2 className="mb-3 text-sm font-semibold text-foreground">
        {title}
      </h2>
      {children}
    </div>
  );
}

export function DashboardSummaryAiSection({
  loading,
  hasData,
  since,
  until,
  aiInsights,
}: DashboardSummaryAiSectionProps) {
  const [expandedCard, setExpandedCard] = React.useState<string | null>(null);
  const [cloudflareAiData, setCloudflareAiData] =
    React.useState<DashboardSummary2AiResponse | null>(null);
  const [cloudflareAiLoading, setCloudflareAiLoading] = React.useState(false);
  const [cloudflareAiError, setCloudflareAiError] = React.useState<string | null>(
    null
  );
  const lastCloudflarePayloadKeyRef = React.useRef<string>("");

  const cloudflareAiPayload = React.useMemo(
    () => ({
      since,
      until,
      metrics: {
        networkRisk: Number(aiInsights.risk.networkProbability.toFixed(2)),
        redShops: aiInsights.risk.redShops.slice(0, 10).map((shop) => ({
          shopName: shop.shopName,
          risk: Number(shop.risk.toFixed(2)),
          progress: Number(shop.progress.toFixed(2)),
          missing: Number(shop.missing.toFixed(2)),
        })),
        salesDeltaPct: Number(aiInsights.drop.salesDeltaPct.toFixed(2)),
        checksDeltaPct: Number(aiInsights.context.checksDeltaPct.toFixed(2)),
        avgCheckDeltaPct: Number(aiInsights.context.avgCheckDeltaPct.toFixed(2)),
        refundRate: Number(aiInsights.context.refundRate.toFixed(2)),
        refundDeltaPp: Number(aiInsights.context.refundDeltaPp.toFixed(2)),
        forecast: {
          value: Number(aiInsights.forecast.value.toFixed(2)),
          lower: Number(aiInsights.forecast.lower.toFixed(2)),
          upper: Number(aiInsights.forecast.upper.toFixed(2)),
          confidence: aiInsights.forecast.confidence,
        },
        incidents: aiInsights.anomalies.incidents.slice(0, 12).map((incident) => ({
          shopName: incident.shopName,
          type: incident.type,
          details: incident.details,
          severity: incident.severity,
        })),
        losses: aiInsights.losses.skus.slice(0, 10).map((sku) => ({
          productName: sku.productName,
          lostQty: Number(sku.lostQty.toFixed(2)),
          lostRevenue: Number(sku.lostRevenue.toFixed(2)),
        })),
      },
    }),
    [since, until, aiInsights]
  );

  const cloudflarePayloadKey = React.useMemo(
    () => JSON.stringify(cloudflareAiPayload),
    [cloudflareAiPayload]
  );

  React.useEffect(() => {
    if (loading || !hasData) return;
    if (lastCloudflarePayloadKeyRef.current === cloudflarePayloadKey) return;
    lastCloudflarePayloadKeyRef.current = cloudflarePayloadKey;
    let cancelled = false;
    setCloudflareAiLoading(true);
    setCloudflareAiError(null);

    const run = async () => {
      try {
        const json = await fetchDashboardSummaryInsights(cloudflareAiPayload);
        if (!cancelled) {
          setCloudflareAiData(json as DashboardSummary2AiResponse);
        }
      } catch (error) {
        if (!cancelled) {
          setCloudflareAiError(
            error instanceof Error ? error.message : "Cloudflare AI недоступен"
          );
        }
      } finally {
        if (!cancelled) {
          setCloudflareAiLoading(false);
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [cloudflareAiPayload, cloudflarePayloadKey, hasData, loading]);

  const aiText: DashboardSummary2AiText = React.useMemo(() => {
    const defaultText: DashboardSummary2AiText = {
      riskSummary:
        aiInsights.risk.redShops.length > 0
          ? `Красных точек: ${aiInsights.risk.redShops.length}.`
          : "Критичных точек не выявлено.",
      actions: aiInsights.actions.top3,
      forecastSummary: `Диапазон ${formatMoney(aiInsights.forecast.lower)} - ${formatMoney(
        aiInsights.forecast.upper
      )} ₽, уверенность ${aiInsights.forecast.confidence}%.`,
      dropMainReason: aiInsights.drop.mainReason,
      anomaliesSummary:
        aiInsights.anomalies.incidents.length > 0
          ? `Найдено инцидентов: ${aiInsights.anomalies.incidents.length}.`
          : "Аномалии не обнаружены.",
      lossesSummary:
        aiInsights.losses.skus.length > 0
          ? `SKU к пополнению: ${aiInsights.losses.skus.length}.`
          : "Критичных потерь не выявлено.",
      dailyDigest: `Риск сети ${toPct(
        aiInsights.risk.networkProbability
      )}. Прогноз ${formatMoney(aiInsights.forecast.value)} ₽. Фокус: ${
        aiInsights.drop.mainReason
      }`,
    };

    if (!cloudflareAiData?.insights) return defaultText;
    const mergedActions =
      cloudflareAiData.insights.actions && cloudflareAiData.insights.actions.length > 0
        ? cloudflareAiData.insights.actions
        : defaultText.actions;

    return {
      riskSummary: cloudflareAiData.insights.riskSummary || defaultText.riskSummary,
      actions: mergedActions.slice(0, 3),
      forecastSummary:
        cloudflareAiData.insights.forecastSummary || defaultText.forecastSummary,
      dropMainReason:
        cloudflareAiData.insights.dropMainReason || defaultText.dropMainReason,
      anomaliesSummary:
        cloudflareAiData.insights.anomaliesSummary || defaultText.anomaliesSummary,
      lossesSummary: cloudflareAiData.insights.lossesSummary || defaultText.lossesSummary,
      dailyDigest: cloudflareAiData.insights.dailyDigest || defaultText.dailyDigest,
    };
  }, [aiInsights, cloudflareAiData]);

  const cloudflareAiStatus = cloudflareAiLoading
    ? "Cloudflare AI: анализ..."
    : cloudflareAiData
    ? `Cloudflare AI: ${cloudflareAiData.fallbackUsed ? "fallback" : "online"} (${cloudflareAiData.model})`
    : cloudflareAiError
    ? "Cloudflare AI: недоступен, используем fallback"
    : "Cloudflare AI: ожидание данных";
  const showNonAiBadge =
    !cloudflareAiLoading &&
    (!cloudflareAiData || cloudflareAiData.fallbackUsed || Boolean(cloudflareAiError));

  const aiTopTiles = [
    {
      id: "aiRisk",
      title: "AI-риск плана",
      metric: toPct(aiInsights.risk.networkProbability),
      subtitle: aiText.riskSummary,
      icon: AlertTriangle,
      tone: "red" as const,
    },
    {
      id: "aiActions",
      title: "AI-действия сейчас",
      metric: `${aiText.actions.length} шага`,
      subtitle: aiText.actions[0] || "План действий формируется",
      icon: CheckSquare,
      tone: "emerald" as const,
    },
    {
      id: "aiForecast",
      title: "AI-прогноз выручки",
      metric: `${formatMoney(aiInsights.forecast.value)} ₽`,
      subtitle: aiText.forecastSummary,
      icon: LineChart,
      tone: "blue" as const,
    },
    {
      id: "aiDrop",
      title: "AI-анализ просадки",
      metric: `${aiInsights.drop.salesDeltaPct >= 0 ? "+" : ""}${aiInsights.drop.salesDeltaPct.toFixed(1)}%`,
      subtitle: aiText.dropMainReason,
      icon: TrendingDown,
      tone: "amber" as const,
    },
  ];

  const aiBottomTiles = [
    {
      id: "aiAnomalies",
      title: "AI-аномалии чеков",
      metric: `${aiInsights.anomalies.incidents.length}`,
      subtitle: aiText.anomaliesSummary,
      icon: Activity,
      tone: "rose" as const,
    },
    {
      id: "aiLosses",
      title: "AI-потери из-за OOS",
      metric: `${formatMoney(aiInsights.losses.totalLoss)} ₽`,
      subtitle: aiText.lossesSummary,
      icon: Package,
      tone: "violet" as const,
    },
    {
      id: "aiDigest",
      title: "AI-дайджест дня",
      metric: since === until ? "Сегодня" : "Период",
      subtitle: aiText.dailyDigest,
      icon: NotebookText,
      tone: "blue" as const,
    },
  ];

  const renderAIDetails = (cardId: string) => {
    switch (cardId) {
      case "aiRisk":
        return (
          <AIDetailsPanel title="Риск невыполнения плана">
            <div className="mb-2 text-xs text-muted-foreground">
              Вероятность срыва по сети: {toPct(aiInsights.risk.networkProbability)}
            </div>
            <div className="space-y-2">
              {aiInsights.risk.redShops.length > 0 ? (
                aiInsights.risk.redShops.map((shop) => (
                  <div
                    key={shop.shopName}
                    className="rounded-md border border-red-200 bg-red-50 p-2 text-xs dark:border-red-900/40 dark:bg-red-900/20"
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <span className="font-semibold text-red-800 dark:text-red-200">
                        {shop.shopName}
                      </span>
                      <span className="font-semibold text-red-700 dark:text-red-300">
                        риск {toPct(shop.risk)}
                      </span>
                    </div>
                    <div className="text-red-700 dark:text-red-300">
                      План {formatMoney(shop.plan)} ₽ • Факт {formatMoney(shop.fact)} ₽ •
                      Отставание {formatMoney(shop.missing)} ₽
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-md bg-emerald-50 p-2 text-xs text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
                  Все магазины в безопасной зоне по выполнению плана.
                </div>
              )}
            </div>
          </AIDetailsPanel>
        );
      case "aiActions":
        return (
          <AIDetailsPanel title="AI-действия на ближайший час">
            <ol className="mb-3 list-decimal space-y-1 pl-4 text-sm text-foreground">
              {aiText.actions.map((action, idx) => (
                <li key={`${idx}-${action}`}>{action}</li>
              ))}
            </ol>
            <div className="space-y-2">
              {aiInsights.actions.checklist.map((shop) => (
                <div
                  key={shop.shopName}
                  className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs dark:border-emerald-900/40 dark:bg-emerald-900/20"
                >
                  <div className="mb-1 font-semibold text-emerald-800 dark:text-emerald-300">
                    {shop.shopName}
                  </div>
                  <ul className="space-y-1 text-emerald-700 dark:text-emerald-200">
                    {shop.items.map((item) => (
                      <li key={item}>• {item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </AIDetailsPanel>
        );
      case "aiForecast":
        return (
          <AIDetailsPanel title="Прогноз выручки до конца дня">
            <div className="mb-3 rounded-md bg-blue-50 p-2 text-xs text-blue-800 dark:bg-blue-900/20 dark:text-blue-200">
              Forecast: {formatMoney(aiInsights.forecast.value)} ₽ • Диапазон:{" "}
              {formatMoney(aiInsights.forecast.lower)} -{" "}
              {formatMoney(aiInsights.forecast.upper)} ₽ • Уверенность:{" "}
              {aiInsights.forecast.confidence}%
            </div>
            <div className="space-y-2">
              {aiInsights.forecast.factors.map((factor) => (
                <div
                  key={factor.label}
                  className="flex items-center justify-between rounded-md border border-blue-200 bg-white p-2 text-xs dark:border-blue-900/40 dark:bg-background"
                >
                  <span className="text-foreground">{factor.label}</span>
                  <span
                    className={`font-semibold ${
                      factor.impact === "plus"
                        ? "text-emerald-600 dark:text-emerald-300"
                        : factor.impact === "minus"
                        ? "text-red-600 dark:text-red-300"
                        : "text-muted-foreground"
                    }`}
                  >
                    {factor.value}
                  </span>
                </div>
              ))}
            </div>
          </AIDetailsPanel>
        );
      case "aiDrop":
        return (
          <AIDetailsPanel title="Разбор просадки день-к-дню">
            <div className="mb-2 text-xs text-foreground">
              Главная причина: <span className="font-semibold">{aiText.dropMainReason}</span>
            </div>
            <div className="space-y-2">
              {aiInsights.drop.byShop.length > 0 ? (
                aiInsights.drop.byShop.map((shop) => (
                  <div
                    key={shop.shopName}
                    className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs dark:border-amber-900/40 dark:bg-amber-900/20"
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <span className="font-semibold text-amber-800 dark:text-amber-200">
                        {shop.shopName}
                      </span>
                      <span className="font-semibold text-amber-700 dark:text-amber-300">
                        {shop.deltaPct >= 0 ? "+" : ""}
                        {shop.deltaPct.toFixed(1)}%
                      </span>
                    </div>
                    <div className="text-amber-700 dark:text-amber-300">
                      Сейчас {formatMoney(shop.current)} ₽ • Было {formatMoney(shop.previous)} ₽
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-md bg-gray-100 p-2 text-xs text-gray-600 dark:bg-gray-700 dark:text-foreground">
                  Нет сравнимых данных по предыдущему периоду.
                </div>
              )}
            </div>
          </AIDetailsPanel>
        );
      case "aiAnomalies":
        return (
          <AIDetailsPanel title="Аномалии чеков и возвратов">
            <div className="space-y-2">
              {aiInsights.anomalies.incidents.length > 0 ? (
                aiInsights.anomalies.incidents.map((incident, idx) => (
                  <div
                    key={`${incident.shopName}-${incident.type}-${idx}`}
                    className="rounded-md border border-rose-200 bg-rose-50 p-2 text-xs dark:border-rose-900/40 dark:bg-rose-900/20"
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <span className="font-semibold text-rose-800 dark:text-rose-200">
                        {incident.shopName}
                      </span>
                      <span className="font-semibold text-rose-700 dark:text-rose-300">
                        {incident.type}
                      </span>
                    </div>
                    <div className="text-rose-700 dark:text-rose-300">{incident.details}</div>
                  </div>
                ))
              ) : (
                <div className="rounded-md bg-emerald-50 p-2 text-xs text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
                  Инциденты за сегодня не обнаружены.
                </div>
              )}
            </div>
          </AIDetailsPanel>
        );
      case "aiLosses":
        return (
          <AIDetailsPanel title="Потери из-за отсутствия товара">
            <div className="mb-2 text-xs text-foreground">
              Оценка упущенной выручки:{" "}
              <span className="font-semibold">{formatMoney(aiInsights.losses.totalLoss)} ₽</span>
            </div>
            <div className="space-y-2">
              {aiInsights.losses.skus.length > 0 ? (
                aiInsights.losses.skus.map((sku) => (
                  <div
                    key={sku.productName}
                    className="rounded-md border border-violet-200 bg-violet-50 p-2 text-xs dark:border-violet-900/40 dark:bg-violet-900/20"
                  >
                    <div className="mb-1 font-semibold text-violet-800 dark:text-violet-200">
                      {sku.productName}
                    </div>
                    <div className="text-violet-700 dark:text-violet-300">
                      План: {sku.planQty} шт • Факт: {sku.actualQty} шт • Не хватает:{" "}
                      {sku.lostQty} шт • Потеря: {formatMoney(sku.lostRevenue)} ₽
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-md bg-gray-100 p-2 text-xs text-gray-600 dark:bg-gray-700 dark:text-foreground">
                  Данных по потерям недостаточно.
                </div>
              )}
            </div>
          </AIDetailsPanel>
        );
      case "aiDigest":
        return (
          <AIDetailsPanel title="AI-дайджест за день">
            <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm leading-6 text-blue-900 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-100">
              {aiText.dailyDigest}
            </div>
          </AIDetailsPanel>
        );
      default:
        return null;
    }
  };

  return (
    <>
      <div className="mb-2">
        <div className="text-sm font-semibold text-foreground">
          AI-аналитика
        </div>
        <div className="text-xs text-muted-foreground">
          Риски, действия, прогноз и инциденты по сети и магазинам.
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {cloudflareAiStatus}
        </div>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-4">
        {aiTopTiles.map((tile, index) => {
          const rowStart = Math.floor(index / 2) * 2;
          const rowIds = aiTopTiles
            .slice(rowStart, rowStart + 2)
            .map((rowTile) => rowTile.id);
          const isRowEnd = index % 2 === 1 || index === aiTopTiles.length - 1;
          const activeInRow = rowIds.find((id) => id === expandedCard) || null;
          return (
            <React.Fragment key={tile.id}>
              <div>
                {loading || !hasData ? (
                  <LoadingTile title={tile.title} Icon={tile.icon} />
                ) : (
                  <AITileCard
                    title={tile.title}
                    metric={tile.metric}
                    subtitle={tile.subtitle}
                    Icon={tile.icon}
                    tone={tile.tone}
                    showNonAiBadge={showNonAiBadge}
                    onClick={() =>
                      setExpandedCard((prev) => (prev === tile.id ? null : tile.id))
                    }
                  />
                )}
              </div>
              {isRowEnd && activeInRow && (
                <div className="col-span-2">{renderAIDetails(activeInRow)}</div>
              )}
            </React.Fragment>
          );
        })}
      </div>
      <div className="mb-6 grid grid-cols-2 gap-4">
        {aiBottomTiles.map((tile, index) => {
          const rowStart = Math.floor(index / 2) * 2;
          const rowIds = aiBottomTiles
            .slice(rowStart, rowStart + 2)
            .map((rowTile) => rowTile.id);
          const isRowEnd = index % 2 === 1 || index === aiBottomTiles.length - 1;
          const activeInRow = rowIds.find((id) => id === expandedCard) || null;
          return (
            <React.Fragment key={tile.id}>
              <div>
                {loading || !hasData ? (
                  <LoadingTile title={tile.title} Icon={tile.icon} />
                ) : (
                  <AITileCard
                    title={tile.title}
                    metric={tile.metric}
                    subtitle={tile.subtitle}
                    Icon={tile.icon}
                    tone={tile.tone}
                    showNonAiBadge={showNonAiBadge}
                    onClick={() =>
                      setExpandedCard((prev) => (prev === tile.id ? null : tile.id))
                    }
                  />
                )}
              </div>
              {isRowEnd && activeInRow && (
                <div className="col-span-2">{renderAIDetails(activeInRow)}</div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </>
  );
}
