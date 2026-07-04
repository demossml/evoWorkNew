import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui";
import { Calendar } from "@/components/ui";
import type { DateRange } from "react-day-picker";

type DateMode = "today" | "yesterday" | "period";

export interface DateFilterValue {
  since: string;
  until: string;
  dateMode: DateMode;
}

interface DateFilterProps {
  value: DateFilterValue;
  onChange: (v: DateFilterValue) => void;
}

function getMSKDayRange(date: Date): [string, string] {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return [`${y}-${m}-${d}`, `${y}-${m}-${d}`];
}

export function DateFilter({ value, onChange }: DateFilterProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [tempRange, setTempRange] = useState<DateRange | undefined>();

  const setToday = () => {
    const today = new Date();
    const [s, u] = getMSKDayRange(today);
    onChange({ since: s, until: u, dateMode: "today" });
    setShowPicker(false);
  };

  const setYesterday = () => {
    const y = new Date();
    y.setDate(y.getDate() - 1);
    const [s, u] = getMSKDayRange(y);
    onChange({ since: s, until: u, dateMode: "yesterday" });
    setShowPicker(false);
  };

  const btn = (mode: DateMode, label: string) => (
    <button
      className={`rounded-lg border px-3 py-2 text-sm transition ${
        value.dateMode === mode
          ? "border-blue-600 bg-blue-600 text-white"
          : "border-gray-300 bg-white text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
      }`}
      onClick={mode === "today" ? setToday : mode === "yesterday" ? setYesterday : () => {
        setTempRange(undefined);
        setShowPicker(true);
        onChange({ ...value, dateMode: "period" });
      }}
    >
      {label}
    </button>
  );

  return (
    <div className="mb-4 grid grid-cols-3 gap-2">
      {btn("today", "Сегодня")}
      {btn("yesterday", "Вчера")}
      <Popover open={showPicker} onOpenChange={(o) => { setShowPicker(o); if (!o) setTempRange(undefined); }}>
        <PopoverTrigger asChild>
          {btn("period", value.dateMode === "period" && value.since !== value.until
            ? `${value.since.slice(5)} – ${value.until.slice(5)}`
            : "Период")}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar
            mode="range"
            selected={tempRange?.from ? tempRange : undefined}
            onSelect={setTempRange}
            numberOfMonths={1}
            disabled={(d) => d > new Date()}
            initialFocus
          />
          <div className="flex justify-end p-2">
            <button
              className="px-3 py-1 rounded bg-blue-600 text-white disabled:opacity-40"
              disabled={!(tempRange?.from && tempRange?.to)}
              onClick={() => {
                if (tempRange?.from && tempRange?.to) {
                  const [s] = getMSKDayRange(tempRange.from);
                  const [, u] = getMSKDayRange(tempRange.to);
                  onChange({ since: s, until: u, dateMode: "period" });
                  setShowPicker(false);
                }
              }}
            >
              Применить
            </button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
