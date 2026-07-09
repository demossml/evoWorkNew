import { motion } from "framer-motion";
import { Brain, AlertTriangle, Lightbulb, Target, ChevronRight } from "lucide-react";
import { useState } from "react";

interface AIInsight {
  product?: string;
  store?: string;
  issue?: string;
  opportunity?: string;
  severity?: "critical" | "warning" | "info";
  potential?: string;
}

interface AIInsightsPanelProps {
  title: string;
  executiveSummary: string;
  topIssues?: AIInsight[];
  topOpportunities?: AIInsight[];
  categoryInsight?: string;
  disciplineInsight?: string;
  actionableAdvice: string[];
  isLoading: boolean;
  onAskAI?: () => void;
}

export function AIInsightsPanel({
  title,
  executiveSummary,
  topIssues,
  topOpportunities,
  categoryInsight,
  disciplineInsight,
  actionableAdvice,
  isLoading,
  onAskAI,
}: AIInsightsPanelProps) {
  const [expanded, setExpanded] = useState(false);

  if (isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-gradient-to-r from-violet-50 to-indigo-50 dark:from-violet-950/30 dark:to-indigo-950/30 border border-violet-200 dark:border-violet-800 rounded-xl p-4"
      >
        <div className="flex items-center gap-3">
          <div className="animate-pulse w-8 h-8 rounded-full bg-violet-200 dark:bg-violet-700" />
          <div className="flex-1 space-y-2">
            <div className="animate-pulse h-3 bg-violet-200 dark:bg-violet-700 rounded w-1/3" />
            <div className="animate-pulse h-2 bg-violet-100 dark:bg-violet-800 rounded w-2/3" />
          </div>
        </div>
      </motion.div>
    );
  }

  if (!executiveSummary || executiveSummary.includes("Ошибка")) return null;

  const totalIssues = topIssues?.length ?? 0;
  const criticalIssues = topIssues?.filter(i => i.severity === "critical").length ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gradient-to-r from-violet-50 to-indigo-50 dark:from-violet-950/30 dark:to-indigo-950/30 border border-violet-200 dark:border-violet-800 rounded-xl overflow-hidden"
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-violet-100/50 dark:hover:bg-violet-900/20 transition-colors"
      >
        <div className="w-8 h-8 rounded-full bg-violet-500 flex items-center justify-center shrink-0">
          <Brain className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-violet-800 dark:text-violet-200">{title}</div>
          <div className="text-xs text-violet-600 dark:text-violet-400 line-clamp-2 mt-0.5">
            {executiveSummary}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {criticalIssues > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-bold">
              {criticalIssues} крит.
            </span>
          )}
          {totalIssues > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
              {totalIssues} пробл.
            </span>
          )}
          <ChevronRight className={`w-4 h-4 text-violet-400 transition-transform ${expanded ? "rotate-90" : ""}`} />
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          className="border-t border-violet-200 dark:border-violet-800 p-4 space-y-3"
        >
          {/* Issues */}
          {topIssues && topIssues.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400">
                <AlertTriangle className="w-3 h-3" /> Проблемы
              </div>
              {topIssues.map((item, i) => (
                <div
                  key={i}
                  className={`text-xs rounded-lg px-2.5 py-1.5 ${
                    item.severity === "critical"
                      ? "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800"
                      : item.severity === "warning"
                        ? "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
                        : "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
                  }`}
                >
                  <span className="font-medium">{item.product || item.store}</span>: {item.issue}
                </div>
              ))}
            </div>
          )}

          {/* Opportunities */}
          {topOpportunities && topOpportunities.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <Lightbulb className="w-3 h-3" /> Возможности
              </div>
              {topOpportunities.map((item, i) => (
                <div key={i} className="text-xs bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 rounded-lg px-2.5 py-1.5 border border-emerald-200 dark:border-emerald-800">
                  <span className="font-medium">{item.product || item.store}</span>: {item.opportunity}
                  {item.potential && <span className="block text-[10px] opacity-70 mt-0.5">{item.potential}</span>}
                </div>
              ))}
            </div>
          )}

          {/* Category / Discipline insight */}
          {categoryInsight && (
            <div className="text-xs text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-900/20 rounded-lg px-2.5 py-1.5 border border-violet-200 dark:border-violet-800">
              {categoryInsight}
            </div>
          )}
          {disciplineInsight && (
            <div className="text-xs text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-900/20 rounded-lg px-2.5 py-1.5 border border-violet-200 dark:border-violet-800">
              {disciplineInsight}
            </div>
          )}

          {/* Actions */}
          {actionableAdvice.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400">
                <Target className="w-3 h-3" /> Что делать
              </div>
              {actionableAdvice.map((advice, i) => (
                <div key={i} className="text-xs flex items-start gap-1.5">
                  <span className="text-indigo-400 font-bold shrink-0">{i + 1}.</span>
                  <span className="text-indigo-700 dark:text-indigo-300">{advice}</span>
                </div>
              ))}
            </div>
          )}

          {/* Ask AI button */}
          {onAskAI && (
            <button
              onClick={onAskAI}
              className="w-full text-xs font-medium text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-900/40 hover:bg-violet-200 dark:hover:bg-violet-900/60 rounded-lg px-3 py-2 transition-colors flex items-center justify-center gap-1.5"
            >
              <Brain className="w-3 h-3" /> Задать вопрос AI
            </button>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}
