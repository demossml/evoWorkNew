/**
 * Seller DNA — типы для глубокого анализа продавцов.
 * Расширяет SellerMetrics из useSellerEffectiveness.
 */

/** Состояние мёртвого времени — периоды без продаж */
export interface DeadTimeSlot {
  from: string; // HH:mm
  to: string;   // HH:mm
  minutes: number;
}

/** Пиковый час — интервал с максимальной выручкой */
export interface PeakHour {
  from: string; // HH:mm
  to: string;   // HH:mm
  revenue: number;
  shareOfDay: number; // 0–1, доля дневной выручки
}

/** Качество обслуживания — баллы по шкале 0–100 */
export interface ServiceQuality {
  avgCheckScore: number;   // относительно среднего по магазину
  conversionScore: number; // чеки / посетители (если есть трафик)
  liquidShareScore: number; // баланс жидкости / железо
  total: number;           // средневзвешенный балл
}

/** Метрики стабильности */
export interface StabilityMetrics {
  revenueCV: number;       // коэффициент вариации дневной выручки (%)
  checkCV: number;         // CV среднего чека (%)
  attendanceRate: number;  // % отработанных дней от плановых смен
  lateOpenRate: number;    // % опозданий при открытии
}

/** DNA-лейбл — типовая роль продавца */
export type DNALabel = 'Охотник' | 'Стабильный' | 'Одиночка' | 'Восходящий' | 'Проблемный';

/** Дневная выручка для графиков */
export interface DailyPoint {
  date: string;   // YYYY-MM-DD
  value: number;
}

/** Почасовая активность для графиков */
export interface HourlyPoint {
  hour: number;      // 0–23
  revenue: number;    // выручка за этот час
  checks: number;     // количество чеков
}

/** Полный DNA-профиль продавца */
export interface SellerDNAProfile {
  // --- базовые (из SellerMetrics) ---
  uuid: string;
  name: string;
  daysWorked: number;
  totalRevenue: number;
  avgCheck: number;
  accShare: number;        // % аксессуаров в выручке
  rubPerHour: number | null;
  avgHours: number | null;
  trend: 'up' | 'down' | 'stable';
  trendSlope: number;
  rank: number;
  overallScore: number;    // 0–100, интегральный DNA-балл

  // --- новые DNA-метрики ---
  deadTimePct: number;      // % времени смены без продаж (0–100)
  deadTimeSlots: DeadTimeSlot[];
  peakHours: PeakHour[];    // топ-2 пиковых часа
  peakHourK: number;        // коэффициент: доля выручки в пик / доля часов в пик (>1 = концентрация)
  peakHourEfficiency: number; // 0–1: насколько эффективно используются пиковые часы
  revenuPerSquareMeter: number | null; // ₽/м² (если известна площадь)
  serviceQuality: ServiceQuality;
  stability: StabilityMetrics;
  strengths: string[];      // ключевые сильные стороны (текст)
  weaknesses: string[];     // зоны роста (текст)
  dnaLabel: DNALabel;
  dailyRevenue: DailyPoint[]; // 2–3 дня для мини-графика
  hourlyRevenue: HourlyPoint[];       // почасовая выручка продавца
  storeAvgHourlyRevenue: HourlyPoint[]; // средняя почасовая выручка магазина
  aiInsights: string[];                // 2–3 предложения от AI
}

/** Фильтры для DNA-виджета */
export interface SellerDNAFilter {
  since: string;
  until: string;
}

/** Lite profile returned by /api/sellers/weekday-compare */
export interface WeekdayCompareProfile {
  uuid: string;
  name: string;
  daysWorked: number;
  totalRevenue: number;
  avgCheck: number;
  accShare: number;
  rubPerHour: number | null;
  avgHours: number | null;
  deadTimePct: number;
  hourlyRevenue: HourlyPoint[];
}

export interface WeekdayCompareResult {
  weekday: number;
  dates: string[];
  sellers: WeekdayCompareProfile[];
}
