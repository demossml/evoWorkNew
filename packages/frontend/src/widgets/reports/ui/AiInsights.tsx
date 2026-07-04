import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Lightbulb,
  AlertTriangle,
  TrendingUp,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

export type Insight = {
  priority: "high" | "medium" | "low";
  action: string;
  reason: string;
  expectedResult: string;
};

export type Anomaly = {
  type: string;
  reason: string;
  details?: string;
  priority: "high" | "medium" | "low";
};

export type Pattern = {
  category: "product" | "time" | "employee" | "trend" | "other";
  pattern: string;
  data: string;
  recommendation?: string;
};

export type AiInsightsData = {
  insights: Insight[];
  anomalies: Anomaly[];
  patterns: Pattern[];
  documentsCount?: number;
};

type Props = {
  data: AiInsightsData | null;
  isLoading: boolean;
  onAnalyze: () => void;
};

export default function AiInsights({ data, isLoading, onAnalyze }: Props) {
  const [expandedSections, setExpandedSections] = useState({
    insights: true,
    anomalies: true,
    patterns: true,
  });

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  if (!data && !isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-2xl p-6 border border-purple-200"
      >
        <div className="flex flex-col items-center text-center space-y-4">
          <div className="bg-white p-4 rounded-full shadow-lg">
            <Sparkles className="w-8 h-8 text-purple-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-800">
            AI Анализ продаж
          </h3>
          <p className="text-sm text-gray-600 max-w-md">
            Получите умные рекомендации, найдите аномалии и скрытые паттерны в
            данных о продажах с помощью ИИ
          </p>
          <button
            onClick={onAnalyze}
            className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-6 py-3 rounded-xl font-medium hover:shadow-lg transition-all transform hover:scale-105"
          >
            Запустить AI анализ
          </button>
        </div>
      </motion.div>
    );
  }

  if (isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-white rounded-2xl p-6 border border-gray-200"
      >
        <div className="flex items-center space-x-3">
          <div className="relative">
            <div className="w-10 h-10 bg-gradient-to-r from-purple-600 to-blue-600 rounded-full animate-spin">
              <div className="absolute inset-2 bg-white rounded-full" />
            </div>
            <Sparkles className="w-5 h-5 text-purple-600 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
          </div>
          <div>
            <p className="font-medium text-gray-800">
              AI анализирует данные...
            </p>
            <p className="text-sm text-gray-500">Это может занять минуту</p>
          </div>
        </div>
      </motion.div>
    );
  }

  const hasData =
    data &&
    (data.insights.length > 0 ||
      data.anomalies.length > 0 ||
      data.patterns.length > 0);

  if (!hasData) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-yellow-50 rounded-2xl p-6 border border-yellow-200"
      >
        <div className="flex items-start space-x-3">
          <AlertTriangle className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-1" />
          <div>
            <h3 className="font-semibold text-yellow-900">
              Нет данных за выбранный период
            </h3>
            <p className="text-sm text-yellow-700 mt-1">
              Попробуйте выбрать другой период для анализа
            </p>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* Insights Section */}
      {data.insights.length > 0 && (
        <motion.div
          layout
          className="bg-white rounded-2xl border border-gray-200 overflow-hidden"
        >
          <button
            onClick={() => toggleSection("insights")}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center space-x-3">
              <div className="bg-green-100 p-2 rounded-lg">
                <Lightbulb className="w-5 h-5 text-green-600" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold text-gray-800">
                  Рекомендации ({data.insights.length})
                </h3>
                <p className="text-xs text-gray-500">
                  Умные советы для бизнеса
                </p>
              </div>
            </div>
            {expandedSections.insights ? (
              <ChevronUp className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            )}
          </button>

          <AnimatePresence>
            {expandedSections.insights && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="border-t border-gray-100"
              >
                <div className="px-6 py-4 space-y-3">
                  {data.insights.map((insight, idx) => {
                    const priorityIcon =
                      insight.priority === "high"
                        ? "🔴"
                        : insight.priority === "medium"
                          ? "🟡"
                          : "🟢";

                    return (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.1 }}
                        className="flex items-start space-x-3 bg-green-50 p-4 rounded-xl"
                      >
                        <span className="text-xl flex-shrink-0">
                          {priorityIcon}
                        </span>
                        <div className="flex-1 space-y-1">
                          <p className="font-medium text-gray-900">
                            {insight.action}
                          </p>
                          <p className="text-sm text-gray-600">
                            {insight.reason}
                          </p>
                          <p className="text-sm text-green-700 font-medium">
                            💰 {insight.expectedResult}
                          </p>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Anomalies Section */}
      {data.anomalies.length > 0 && (
        <motion.div
          layout
          className="bg-white rounded-2xl border border-gray-200 overflow-hidden"
        >
          <button
            onClick={() => toggleSection("anomalies")}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center space-x-3">
              <div className="bg-red-100 p-2 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold text-gray-800">
                  Аномалии ({data.anomalies.length})
                </h3>
                <p className="text-xs text-gray-500">Подозрительные операции</p>
              </div>
            </div>
            {expandedSections.anomalies ? (
              <ChevronUp className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            )}
          </button>

          <AnimatePresence>
            {expandedSections.anomalies && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="border-t border-gray-100"
              >
                <div className="px-6 py-4 space-y-3">
                  {data.anomalies.map((anomaly, idx) => {
                    const priorityIcon =
                      anomaly.priority === "high"
                        ? "🔴"
                        : anomaly.priority === "medium"
                          ? "🟡"
                          : "🟢";

                    return (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.1 }}
                        className="bg-red-50 p-4 rounded-xl space-y-2"
                      >
                        <div className="flex items-start space-x-2">
                          <span className="text-xl flex-shrink-0">
                            {priorityIcon}
                          </span>
                          <div className="flex-1">
                            <p className="font-medium text-sm text-red-900">
                              {anomaly.type}
                            </p>
                            <p className="text-sm text-red-700 mt-1">
                              {anomaly.reason}
                            </p>
                            {anomaly.details && (
                              <p className="text-xs text-red-600 mt-2 bg-red-100 p-2 rounded">
                                💡 {anomaly.details}
                              </p>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Patterns Section */}
      {data.patterns.length > 0 && (
        <motion.div
          layout
          className="bg-white rounded-2xl border border-gray-200 overflow-hidden"
        >
          <button
            onClick={() => toggleSection("patterns")}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center space-x-3">
              <div className="bg-blue-100 p-2 rounded-lg">
                <TrendingUp className="w-5 h-5 text-blue-600" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold text-gray-800">
                  Паттерны ({data.patterns.length})
                </h3>
                <p className="text-xs text-gray-500">Скрытые корреляции</p>
              </div>
            </div>
            {expandedSections.patterns ? (
              <ChevronUp className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            )}
          </button>

          <AnimatePresence>
            {expandedSections.patterns && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="border-t border-gray-100"
              >
                <div className="px-6 py-4 space-y-3">
                  {data.patterns.map((pattern, idx) => {
                    const categoryIcon =
                      pattern.category === "product"
                        ? "📦"
                        : pattern.category === "time"
                          ? "⏰"
                          : pattern.category === "employee"
                            ? "👤"
                            : pattern.category === "trend"
                              ? "📈"
                              : "📊";

                    return (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.1 }}
                        className="bg-blue-50 p-4 rounded-xl space-y-2"
                      >
                        <div className="flex items-start space-x-2">
                          <span className="text-xl flex-shrink-0">
                            {categoryIcon}
                          </span>
                          <div className="flex-1">
                            <p className="text-sm text-gray-900 font-medium">
                              {pattern.pattern}
                            </p>
                            <p className="text-xs text-blue-700 mt-1">
                              📊 {pattern.data}
                            </p>
                            {pattern.recommendation && (
                              <p className="text-xs text-green-700 mt-2 bg-green-50 p-2 rounded">
                                💡 {pattern.recommendation}
                              </p>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {data.documentsCount !== undefined && (
        <p className="text-xs text-gray-500 text-center">
          Проанализировано документов: {data.documentsCount}
        </p>
      )}
    </motion.div>
  );
}
