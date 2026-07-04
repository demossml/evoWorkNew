import z from "zod";
import { salesInfoSchema } from "../evotor/schema";
import { createTask } from "./helpers";

export const execAnalyzeDocsTask = createTask({
	task: "Проанализируй документы.",
	inputSchema: z.array(salesInfoSchema),
	outputSchema: z.object({
		total: z.number().describe("общая сумма продаж"),
		barCodeNames: z
			.array(z.string())
			.describe("use lookupBarCodeNames tool for lookup"),
	}),
	maxTokens: 2048,
	temperature: 0.7,
	// tools: [...] // УДАЛЕНО
});

// export const execAnalyzeDocsTask = createTask({
// 	task: "Analyze sales documents and calculate total sales",
// 	inputSchema: z.array(documentSchema),
// 	outputSchema: z.object({
// 		total: z.number().describe("Total sales amount"),
// 		average: z.number().optional().describe("Average sale amount"),
// 		count: z.number().describe("Number of documents processed"),
// 	}),
// 	model: "@cf/mistral/mistral-7b-instruct-v0.2" as keyof AiModels,
// 	maxTokens: 2048,
// 	temperature: 0.7,
// });

export const sum2Numbers = createTask({
	task: "Sum two numbers. Use calculator tool",
	inputSchema: z.object({ a: z.number(), b: z.number() }),
	outputSchema: z.object({ sum: z.number() }),
	maxTokens: 1024,
	temperature: 0,
	// tools: [
	// 	createTool({
	// 		name: "calculator",
	// 		description: "Calculator is used to sum pair for numbers",
	// 		input: z.object({ a: z.number(), b: z.number() }),
	// 		output: z.object({ result: z.number() }),
	// 		invoke: async (c, input) => {
	// 			return { result: input.a + input.b };
	// 		},
	// 	}),
	// ],
});

// 1. Выявление аномалий в продажах
export const analyzeDocsAnomaliesTask = createTask({
	task: "Проанализируй документы и найди аномалии или подозрительные операции. Объясни, почему они аномальны. Ответь на русском языке.",
	inputSchema: z.array(salesInfoSchema),
	outputSchema: z.object({
		anomalies: z
			.array(
				z.object({
					docId: z.string(),
					reason: z.string(),
					details: z.string().optional(),
				}),
			)
			.describe("Список аномалий с объяснением"),
	}),
	maxTokens: 2048,
	temperature: 0.7,
});

// 2. Генерация бизнес-выводов и рекомендаций
export const analyzeDocsInsightsTask = createTask({
	task: "Проанализируй документы и сформулируй бизнес-выводы и рекомендации для владельца магазина. Ответь на русском языке.",
	inputSchema: z.array(salesInfoSchema),
	outputSchema: z.object({
		insights: z
			.array(z.string())
			.describe("Краткие бизнес-выводы и рекомендации (на русском языке)"),
	}),
	maxTokens: 2048,
	temperature: 0.7,
});

// 3. Поиск скрытых паттернов и корреляций
export const analyzeDocsPatternsTask = createTask({
	task: "Проанализируй документы и найди скрытые паттерны или нетривиальные корреляции между товарами, временем, магазинами и сотрудниками. Ответь на русском языке.",
	inputSchema: z.array(salesInfoSchema),
	outputSchema: z.object({
		patterns: z
			.array(
				z.object({
					description: z.string(),
					evidence: z.string().optional(),
				}),
			)
			.describe("Найденные паттерны и корреляции"),
	}),
	maxTokens: 2048,
	temperature: 0.7,
});

// 4. Автоматический текстовый аналитический отчёт
export const analyzeDocsReportTask = createTask({
	task: "Составь подробный текстовый аналитический отчёт по документам: динамика, проблемы, успехи, рекомендации. Ответь на русском языке.",
	inputSchema: z.array(salesInfoSchema),
	outputSchema: z.object({
		report: z.string().describe("Текстовый аналитический отчёт"),
	}),
	maxTokens: 2048,
	temperature: 0.7,
});

// 5. Оценка эффективности персонала (для всех сотрудников)
export const analyzeDocsStaffTask = createTask({
	task: `
Проведи детальный анализ эффективности каждого сотрудника за текущий день (2025-06-07) и рассчитай персонализированный рейтинг эффективности (0-1) по расширенным критериям.

**Ключевые метрики:**
1. Финансовые показатели (35%):
   - Выручка: ∑(SELL.transactions.sum) - ∑(PAYBACK.transactions.sum)
   - Средний чек: Выручка / Количество SELL-документов
   - Сравнение: >150% от среднего = высокий, <70% = низкий

2. Возвраты (25%):
   - Доля возвратов: (PAYBACK.count / SELL.count) × 100%
   - Критерии: ≤5% = норма, >10% = критично

3. Сопутствующие продажи (30%):
   - Конверсия: (Чеки с зажигалкой / Чеки с табаком) × 100%
   - Ключевые товары: 
     • Табак: productName содержит ("сигарет","табак","никотин")
     • Зажигалка: productName содержит "зажигалк*"
   - Цель: >60%

4. Рабочие паттерны (10%):
   - Стабильность: CV = (Стандартное отклонение по 4-часовым интервалам / Среднее) × 100%
     • <30% = высокая, >60% = низкая
   - Тренд чека: Δ = (Средний чек [12:00-24:00] - Средний чек [00:00-12:00]) / Средний чек [00:00-12:00]
     • >+10% = рост, <-10% = спад

**Формула рейтинга:**
Рейтинг = 
  0.35 × min(Выручка / Макс.Выручка, 1) +
  0.25 × (1 - min(Доля_возвратов / 0.15, 1)) + 
  0.30 × min(Конверсия_зажигалок / 0.8, 1) + 
  0.10 × (1 - min(CV / 0.6, 1))

**Формат вывода для каждого сотрудника:**
### Сотрудник: [employeeName]
**Рейтинг:** 0.XX
**Обоснование:**
- Продажи: XXX₽ (YY SELL), Средний чек: ZZZ₽ (Δ±X%)
- Возвраты: N (MM.M%)
- Сопутствующие: K/M чеков (PP.P%)
- Паттерны: 
  • Стабильность: [Уровень] (CV=XX.X%)
  • Тренд: [Изменение]

**Рекомендации:**
1. Конкретный совет #1
2. Конкретный совет #2

**Алгоритм:**
1. Фильтруем документы по closeDate (2025-06-07)
2. Группируем по employeeName
3. Для каждого сотрудника:
   - Разделяем документы на SELL/PAYBACK
   - Считаем метрики по формуле
   - Определяем интервалы [00-06), [06-12), [12-18), [18-24)
   - Вычисляем CV и тренд
4. Рассчитываем общие максимумы/средние по команде
5. Формируем рекомендации на основе слабых мест
`,
	inputSchema: z.array(salesInfoSchema),
	outputSchema: z.object({
		staffRatings: z
			.array(
				z.object({
					user_id: z.string().describe("Имя сотрудника из employeeName"),
					rating: z
						.number()
						.min(0)
						.max(1)
						.describe("Рассчитанный рейтинг эффективности"),
					comment: z
						.string()
						.describe(
							"Отчет в формате: Заголовок, Рейтинг, Обоснование, Рекомендации",
						),
				}),
			)
			.describe("Результаты оценки эффективности сотрудников"),
	}),
	maxTokens: 4096,
	temperature: 0.4,
});

/**
 * Анализирует документы и выявляет основные причины возвратов товаров,
 * оценивает их влияние на бизнес и предлагает рекомендации по снижению возвратов.
 * Использует возможности LLM для поиска скрытых закономерностей и формулировки рекомендаций.
 */
export const analyzeDocsReturnsTask = createTask({
	task: "Проанализируй документы и выяви основные причины возвратов товаров. Оцени, как возвраты влияют на бизнес, и предложи рекомендации по снижению их количества. Ответь на русском языке.",
	inputSchema: z.array(salesInfoSchema),
	outputSchema: z.object({
		returnReasons: z
			.array(
				z.object({
					reason: z.string(),
					count: z.number(),
					impact: z.string(),
				}),
			)
			.describe("Причины возвратов, их количество и влияние"),
		recommendations: z
			.array(z.string())
			.describe("Рекомендации по снижению возвратов"),
	}),
	maxTokens: 2048,
	temperature: 0.7,
});

/**
 * Анализирует документы и выявляет ассоциативные правила между товарами,
 * определяет, какие товары часто покупают вместе, а какие комбинации встречаются редко.
 * Формулирует ассоциативные правила и объясняет их значимость.
 */
export const analyzeDocsAssociationRulesTask = createTask({
	task: "Проанализируй документы и найди скрытые связи между товарами: какие товары часто покупают вместе, какие комбинации встречаются редко. Сформулируй ассоциативные правила и объясни их значимость. Ответь на русском языке.",
	inputSchema: z.array(salesInfoSchema),
	outputSchema: z.object({
		associations: z
			.array(
				z.object({
					rule: z.string(),
					support: z.number(),
					confidence: z.number(),
					explanation: z.string(),
				}),
			)
			.describe("Ассоциативные правила между товарами"),
	}),
	maxTokens: 2048,
	temperature: 0.7,
});

/**
 * Анализирует сезонные тренды и влияние внешних факторов (праздники, погода, события) на продажи,
 * формулирует выводы и рекомендации по учёту сезонности в бизнесе.
 */
export const analyzeDocsSeasonalityTask = createTask({
	task: "Проанализируй документы и выяви сезонные тренды, а также влияние внешних факторов (праздники, погода, события) на продажи. Сформулируй выводы и рекомендации. Ответь на русском языке.",
	inputSchema: z.array(salesInfoSchema),
	outputSchema: z.object({
		seasonalTrends: z
			.array(z.string())
			.describe("Сезонные тренды и их описание"),
		externalFactors: z
			.array(z.string())
			.describe("Внешние факторы и их влияние"),
		recommendations: z
			.array(z.string())
			.describe("Рекомендации по учёту сезонности"),
	}),
	maxTokens: 2048,
	temperature: 0.7,
});

/**
 * Оценивает уровень лояльности клиентов, выявляет признаки оттока (churn)
 * и предлагает меры по удержанию клиентов на основе анализа документов.
 */
export const analyzeDocsChurnTask = createTask({
	task: "Проанализируй документы и оцени уровень лояльности клиентов, выяви признаки оттока (churn) и предложи меры по удержанию клиентов. Ответь на русском языке.",
	inputSchema: z.array(salesInfoSchema),
	outputSchema: z.object({
		churnIndicators: z.array(z.string()).describe("Признаки оттока клиентов"),
		loyaltyScore: z
			.number()
			.min(0)
			.max(1)
			.describe("Оценка лояльности клиентов (0-1)"),
		retentionRecommendations: z
			.array(z.string())
			.describe("Меры по удержанию клиентов"),
	}),
	maxTokens: 2048,
	temperature: 0.7,
});

/**
 * Анализирует эффективность проведённых акций и скидок, определяет их влияние на продажи
 * и формулирует рекомендации по оптимизации промо-активностей.
 */
export const analyzeDocsPromoTask = createTask({
	task: "Проанализируй документы и оцени эффективность проведённых акций и скидок: какие из них привели к росту продаж, а какие нет. Дай рекомендации по оптимизации промо-активностей. Ответь на русском языке.",
	inputSchema: z.array(salesInfoSchema),
	outputSchema: z.object({
		promoAnalysis: z
			.array(
				z.object({
					promoName: z.string(),
					effect: z.string(),
					recommendation: z.string(),
				}),
			)
			.describe("Анализ акций и рекомендации"),
	}),
	maxTokens: 2048,
	temperature: 0.7,
});

/**
 * Глубокий анализ на предмет мошенничества и халатности.
 * AI выявляет все возможные схемы мошенничества, злоупотреблений, халатности, подозрительных действий сотрудников и покупателей,
 * анализирует нетипичные паттерны, сравнивает с известными сценариями и предлагает рекомендации по предотвращению.
 * В отчёте должны быть указаны конкретные подозрительные случаи, объяснения, почему они вызывают подозрение, и меры по предотвращению.
 */
export const analyzeDocsFraudAndNegligenceTask = createTask({
	task: `Выполни глубокий анализ всех документов на предмет любых возможных вариантов мошенничества, злоупотреблений, халатности, подозрительных действий сотрудников и покупателей. 
    Выяви любые нетипичные паттерны, сравни с известными сценариями мошенничества и халатности в ритейле. 
    Для каждого подозрительного случая укажи, почему он вызывает подозрение, и предложи конкретные меры по предотвращению подобных ситуаций в будущем. 
    Ответь на русском языке максимально подробно.`,
	inputSchema: z.array(salesInfoSchema),
	outputSchema: z.object({
		fraudFindings: z
			.array(
				z.object({
					description: z.string().describe("Описание подозрительной ситуации"),
					reason: z.string().describe("Почему это вызывает подозрение"),
					recommendation: z.string().describe("Меры по предотвращению"),
				}),
			)
			.describe("Возможные варианты мошенничества и халатности"),
		generalRecommendations: z
			.array(z.string())
			.describe(
				"Общие рекомендации по предотвращению мошенничества и халатности",
			),
	}),
	maxTokens: 4096,
	temperature: 0.7,
});

/**
 * Глубокий анализ халатности по времени — выявляет отсутствие сотрудника на рабочем месте.
 * AI анализирует временные промежутки между чеками, длительные простои, отсутствие продаж в рабочее время,
 * а также сравнивает расписание с фактическими действиями сотрудника.
 * Для каждого подозрительного случая укажи сотрудника, временной промежуток, причину подозрения и рекомендации.
 */
export const analyzeDocsNegligenceByTimeTask = createTask({
	task: `Выполни глубокий анализ всех документов на предмет халатности, связанной с отсутствием сотрудника на рабочем месте.
    Анализируй временные промежутки между чеками, длительные простои, отсутствие продаж в рабочее время, сравни расписание с фактическими действиями.
    Для каждого подозрительного случая укажи сотрудника, временной промежуток, причину подозрения и рекомендации по предотвращению подобных ситуаций.
    Ответь на русском языке максимально подробно.`,
	inputSchema: z.array(salesInfoSchema),
	outputSchema: z.object({
		negligenceFindings: z
			.array(
				z.object({
					employee: z.string().describe("Имя или идентификатор сотрудника"),
					period: z.string().describe("Временной промежуток отсутствия"),
					reason: z.string().describe("Почему это вызывает подозрение"),
					recommendation: z.string().describe("Рекомендации по предотвращению"),
				}),
			)
			.describe("Возможные случаи халатности по времени"),
		generalRecommendations: z
			.array(z.string())
			.describe("Общие рекомендации по контролю присутствия сотрудников"),
	}),
	maxTokens: 4096,
	temperature: 0.7,
});

/**
 * Анализ эффективности ассортимента — какие товары не продаются, что стоит убрать или добавить.
 * AI анализирует продажи по каждому товару, выявляет неликвиды, рекомендует убрать или добавить товары, чтобы повысить прибыль.
 */
export const analyzeAssortmentEfficiencyTask = createTask({
	task: "Проанализируй эффективность ассортимента: какие товары не продаются или продаются плохо, какие товары стоит убрать из ассортимента, а какие добавить для увеличения прибыли. Дай рекомендации по оптимизации ассортимента. Ответь на русском языке.",
	inputSchema: z.array(salesInfoSchema),
	outputSchema: z.object({
		underperformingProducts: z
			.array(z.string())
			.describe("Товары с низкими продажами"),
		recommendedToRemove: z
			.array(z.string())
			.describe("Товары, которые стоит убрать"),
		recommendedToAdd: z
			.array(z.string())
			.describe("Товары, которые стоит добавить"),
		generalRecommendations: z
			.array(z.string())
			.describe("Общие рекомендации по ассортименту"),
	}),
	maxTokens: 2048,
	temperature: 0.7,
});

/**
 * Анализ динамики цен и влияния на продажи.
 * AI анализирует изменения цен по товарам и их влияние на объём продаж, выявляет чувствительность к цене и даёт рекомендации.
 */
export const analyzePriceDynamicsTask = createTask({
	task: "Проаализируй динамику цен по товарам и их влияние на объём продаж. Выяви, какие товары чувствительны к изменению цены, и дай рекомендации по ценообразованию. Ответь на русском языке.",
	inputSchema: z.array(salesInfoSchema),
	outputSchema: z.object({
		priceSensitiveProducts: z
			.array(z.string())
			.describe("Товары, чувствительные к цене"),
		priceChangeEffects: z
			.array(z.string())
			.describe("Влияние изменения цены на продажи"),
		recommendations: z
			.array(z.string())
			.describe("Рекомендации по ценообразованию"),
	}),
	maxTokens: 2048,
	temperature: 0.7,
});

export const createGrammarTask = createTask({
	task: "Составь простое задание по грамматике slovenski языка для ученика. Укажи само задание и правильный ответ. Пример задания: 'Укажи правильную форму слова 'глаголати' в настоящем времени для местоимения 'я'.'",
	inputSchema: z.object({
		topic: z
			.string()
			.describe(
				"Тема грамматического задания, например: 'спряжение глаголов', 'склонение существительных', 'падежи', 'прилагательные' и т.д.",
			),
		level: z
			.enum(["начальный", "средний", "продвинутый"])
			.describe("Уровень сложности задания"),
	}),
	outputSchema: z.object({
		question: z.string().describe("Формулировка задания для ученика"),
		answer: z.string().describe("Правильный ответ на задание"),
		explanation: z
			.string()
			.optional()
			.describe("Пояснение к правильному ответу (опционально)"),
	}),
	temperature: 0.5,
	maxTokens: 1024,
});

export const createSloveneGrammarTask = createTask({
	task: "Составь  грамматические задание по словенскому языку. Укажи формулировку задания, правильный ответ и  пояснение.",
	inputSchema: z.object({
		topic: z
			.string()
			.describe(
				"Грамматическая тема, например: 'спряжение глаголов', 'склонение существительных', 'род прилагательных', 'употребление предлогов' и т.д.",
			),
		level: z
			.enum(["начальный", "средний", "продвинутый"])
			.describe("Уровень сложности задания"),
		count: z
			.number()
			.min(1)
			.max(50)
			.default(1)
			.describe("Количество заданий, которые нужно сгенерировать"),
	}),
	outputSchema: z.array(
		z.object({
			question: z.string().describe("Формулировка задания на русском языке"),
			answer: z.string().describe("Правильный ответ"),
			explanation: z
				.string()
				.describe(
					"Краткое объяснение, почему это правильный ответ (опционально)",
				),
		}),
	),
	temperature: 1,
	maxTokens: 12000,
});

export const knightsLogicTask = createTask({
	task: "В городе живут два типа жителей: дневные рыцари (днем говорят правду, ночью лгут) и ночные рыцари (ночью говорят правду, днем лгут). Посетитель не знает, день сейчас или ночь, и не может определить это по внешним признакам. Какое минимальное количество вопросов с ответом 'да' или 'нет' нужно задать случайному жителю, чтобы точно узнать, день сейчас или ночь? Приведи формулировку вопроса (или вопросов), объясни логику и укажи минимальное число вопросов.",
	inputSchema: z.object({}),
	outputSchema: z.object({
		minQuestions: z.number().describe("Минимальное количество вопросов"),
		question: z.string().describe("Формулировка вопроса или вопросов"),
		explanation: z.string().describe("Пояснение, почему этого достаточно"),
	}),
	maxTokens: 40000,
	temperature: 0.7,
});

/**
 * Получает гороскоп по дате рождения.
 * На входе дата в формате dd-mm-yyyy, на выходе — текст гороскопа на этот день.
 */
export const getHoroscopeByDateTask = createTask({
	task: "Определи знак зодиака по дате рождения в формате dd-mm-yyyy и составь краткий гороскоп на этот день. Ответь на русском языке.",
	inputSchema: z.object({
		date: z.string().describe("Дата в формате dd-mm-yyyy"),
	}),
	outputSchema: z.array(
		z.object({
			sign: z.string().describe("Знак зодиака"),
			horoscope: z.string().describe("Гороскоп на выбранную дату"),
		}),
	),
	maxTokens: 8000,
	temperature: 1,
});
