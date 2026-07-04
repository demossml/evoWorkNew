import { z } from "zod";

export const DeepAnalysisDepthSchema = z.enum(["lite", "standard", "deep"]);
export const DeepRiskSensitivitySchema = z.enum(["low", "normal", "high"]);
export const DeepFocusAreaSchema = z.enum([
	"revenue_trend",
	"avg_check",
	"refunds",
	"traffic",
	"peer_comparison",
	"stability",
]);

export const AiDirectorDashboardRequestSchema = z
	.object({
		date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
		since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
		until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
		shopUuids: z.array(z.string().min(1)).min(1).optional(),
		deepAnalysisDepth: DeepAnalysisDepthSchema.optional(),
		deepRiskSensitivity: DeepRiskSensitivitySchema.optional(),
		deepFocusAreas: z.array(DeepFocusAreaSchema).min(1).optional(),
		historyLimit: z.coerce.number().int().min(1).max(200).optional(),
		shiftHistoryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
		shiftHistoryShopUuid: z.string().min(1).optional(),
		alertHistoryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
		alertHistoryShopUuid: z.string().min(1).optional(),
		alertHistoryType: z
			.enum(["tempo_alert", "anomaly", "dead_stock", "all"])
			.optional(),
	})
	.strict();

const RatingRowSchema = z
	.object({
		shopUuid: z.string().min(1),
		shopName: z.string().min(1),
		revenue: z.number().finite(),
		checks: z.number().int().nonnegative(),
		averageCheck: z.number().finite(),
	})
	.strict();

const EmployeeRowSchema = z
	.object({
		employeeUuid: z.string().min(1),
		name: z.string().min(1),
		revenue: z.number().finite(),
		checks: z.number().int().nonnegative(),
		averageCheck: z.number().finite(),
	})
	.strict();

const DeepEmployeeSchema = z
	.object({
		employeeUuid: z.string().min(1),
		name: z.string().min(1),
		revenue: z.number().finite(),
		checks: z.number().int().nonnegative(),
		averageCheck: z.number().finite(),
		refunds: z.number().finite(),
		refundRatePct: z.number().finite(),
		revenueTrendPct: z.number().finite().nullable(),
		riskScore: z.number().finite(),
		reasons: z.array(z.string()),
		recommendations: z.array(z.string()),
		shopCount: z.number().int().nonnegative(),
	})
	.passthrough();

const DeepMetaSchema = z
	.object({
		analysisDepth: DeepAnalysisDepthSchema,
		historyDays: z.number().int().nonnegative(),
		warning: z.string().nullable(),
		comparisonCoverage: z
			.object({
				totalEmployees: z.number().int().nonnegative(),
				comparableEmployees: z.number().int().nonnegative(),
			})
			.optional(),
	})
	.strict();

const ForecastSchema = z
	.object({
		forecast: z.number().finite(),
		weather: z
			.object({
				avgTemp: z.number().finite(),
				minTemp: z.number().finite(),
				maxTemp: z.number().finite(),
				precipSum: z.number().finite(),
				timezone: z.string().min(1),
			})
			.nullable()
			.optional(),
		weatherFactor: z.number().finite().optional(),
		warning: z.string().nullable().optional(),
		historySource: z.enum(["receipts", "index"]).optional(),
	})
	.strict();

const ShiftSummaryItemSchema = z
	.object({
		id: z.number().int(),
		shopUuid: z.string().min(1),
		date: z.string().min(1),
		generatedAt: z.string().min(1).optional(),
		summaryText: z.string(),
		revenueActual: z.number().finite().nullable(),
		revenuePlan: z.number().finite().nullable(),
		topEmployee: z.string().nullable(),
	})
	.strict();

const AlertItemSchema = z
	.object({
		id: z.number().int(),
		shopUuid: z.string().min(1),
		alertType: z.enum(["tempo_alert", "anomaly", "dead_stock"]),
		severity: z.enum(["info", "warning", "critical"]),
		triggeredAt: z.string().min(1),
		message: z.string(),
	})
	.strict();

const HeatmapCellSchema = z
	.object({
		dayOfWeek: z.number().int().min(0).max(6),
		hour: z.number().int().min(0).max(23),
		revenue: z.number().finite(),
		checks: z.number().finite().optional(),
	})
	.strict();

const UiSystemStatusSchema = z
	.object({
		state: z.enum(["critical", "warning", "stable"]),
		label: z.string(),
		criticalAlerts: z.number().int().nonnegative(),
		warningAlerts: z.number().int().nonnegative(),
		riskyEmployees: z.number().int().nonnegative(),
	})
	.strict();

const UiTopKpiSchema = z
	.object({
		totalRevenue: z.number().finite(),
		totalChecks: z.number().int().nonnegative(),
		avgCheck: z.number().finite(),
		weakShops: z.number().int().nonnegative(),
	})
	.strict();

const UiDecisionSchema = z
	.object({
		employeeName: z.string(),
		problem: z.string(),
		action: z.string(),
		risk: z.number().int().min(0).max(100),
	})
	.strict();

const UiDecisionLogItemSchema = z
	.object({
		id: z.number().int(),
		when: z.string(),
		type: z.enum(["tempo_alert", "anomaly", "dead_stock"]),
		severity: z.enum(["info", "warning", "critical"]),
		text: z.string(),
	})
	.strict();

const UiProblemsSummarySchema = z
	.object({
		criticalAlerts: z.array(
			z.object({
				id: z.number().int(),
				message: z.string(),
			}),
		),
		warningAlerts: z.array(
			z.object({
				id: z.number().int(),
				message: z.string(),
			}),
		),
		riskyEmployees: z.array(
			z.object({
				employeeUuid: z.string().min(1),
				name: z.string().min(1),
			}),
		),
		highRefundEmployees: z.array(
			z.object({
				employeeUuid: z.string().min(1),
				name: z.string().min(1),
			}),
		),
	})
	.strict();

export const AiDirectorDashboardResponseSchema = z
	.object({
		period: z
			.object({
				since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
				until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
				date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
			})
			.strict(),
		filters: z
			.object({
				deepAnalysisDepth: DeepAnalysisDepthSchema,
				deepRiskSensitivity: DeepRiskSensitivitySchema,
				deepFocusAreas: z.array(DeepFocusAreaSchema),
			})
			.strict(),
		rating: z.array(RatingRowSchema),
		employees: z.array(EmployeeRowSchema),
		deepEmployees: z.array(DeepEmployeeSchema),
		deepMeta: DeepMetaSchema.nullable(),
		forecast: ForecastSchema.nullable(),
		heatmap: z
			.object({
				maxRevenue: z.number().finite(),
				cells: z.array(HeatmapCellSchema),
				matrix: z
					.array(z.array(z.number().finite()).length(24))
					.length(7),
				dayLabels: z.array(z.string()).length(7),
				stops: z.array(z.number().finite()).min(2),
			})
			.strict(),
		shiftHistory: z
			.object({
				items: z.array(ShiftSummaryItemSchema),
				shopOptions: z.array(z.string()),
				total: z.number().int().nonnegative(),
			})
			.strict(),
		alertsHistory: z
			.object({
				items: z.array(AlertItemSchema),
				shopOptions: z.array(z.string()),
				total: z.number().int().nonnegative(),
			})
			.strict(),
		uiSummary: z
			.object({
				systemStatus: UiSystemStatusSchema,
				topKpi: UiTopKpiSchema,
				problemsSummary: UiProblemsSummarySchema,
				directorDecisions: z.array(UiDecisionSchema).max(3),
				decisionsLog: z.array(UiDecisionLogItemSchema).max(5),
			})
			.strict(),
	})
	.strict();

export type AiDirectorDashboardRequest = z.infer<
	typeof AiDirectorDashboardRequestSchema
>;
export type AiDirectorDashboardResponse = z.infer<
	typeof AiDirectorDashboardResponseSchema
>;
