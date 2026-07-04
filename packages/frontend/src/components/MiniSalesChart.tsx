"use client";

import { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer } from "recharts";
import { Card, CardHeader, CardTitle, CardContent } from "./ui/card";
import type { ChartConfig } from "./ui/chart";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "./ui/chart";

interface ChartPoint {
  time: string;
  value: number;
}

interface ShopChartData {
  shopName: string;
  data: ChartPoint[];
}

interface MiniSalesChartProps {
  nowData: ShopChartData;
  sevenDaysData: ShopChartData;
}

export default function MiniSalesChart({
  nowData,
  sevenDaysData,
}: MiniSalesChartProps) {
  const chartData = useMemo(() => {
    const nowMap = new Map<string, number>();
    nowData.data.forEach((p) => {
      const time = new Date(p.time).toLocaleTimeString("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
      });
      nowMap.set(time, p.value);
    });
    const sevenMap = new Map<string, number>();
    sevenDaysData.data.forEach((p) => {
      const time = new Date(p.time).toLocaleTimeString("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
      });
      sevenMap.set(time, p.value);
    });
    const times = Array.from(
      new Set([...nowMap.keys(), ...sevenMap.keys()])
    ).sort();
    return times.map((t) => ({
      time: t,
      today: nowMap.get(t) || 0,
      sevenDaysAgo: sevenMap.get(t) || 0,
    }));
  }, [nowData, sevenDaysData]);

  // chartConfig без theme/darkColor
  const chartConfig: ChartConfig = {
    today: {
      label: "Сегодня",
      color: "hsl(var(--chart-1))", // #d81b60 в светлом режиме
    },
    sevenDaysAgo: {
      label: "7 дней назад",
      color: "hsl(var(--chart-2))", // #0288d1 в светлом режиме
    },
  };

  return (
    <Card className="w-full bg-card text-card-foreground rounded-md">
      <CardHeader>
        <CardTitle className="text-sm font-semibold font-chart">
          Продажи: {nowData.shopName}
        </CardTitle>
      </CardHeader>
      <CardContent className="h-24 px-2 pt-2">
        <ChartContainer
          config={chartConfig}
          className="min-h-[96px] w-full bg-background font-chart"
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
            >
              <XAxis
                dataKey="time"
                tick={{ fontSize: 10, fill: "hsl(var(--foreground))" }}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 10, fill: "hsl(var(--foreground))" }}
                width={40}
                tickFormatter={(v) => `${v}₽`}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent className="bg-background text-foreground font-chart" />
                }
              />
              <Line
                dataKey="today"
                name="Сегодня"
                strokeWidth={2}
                dot={false}
                className="stroke-[hsl(var(--chart-1))] dark:stroke-[hsl(var(--chart-1-dark))]"
              />
              <Line
                dataKey="sevenDaysAgo"
                name="7 дней назад"
                strokeWidth={2}
                dot={false}
                className="stroke-[hsl(var(--chart-2))] dark:stroke-[hsl(var(--chart-2-dark))]"
              />
              <ChartLegend
                content={
                  <ChartLegendContent className="text-foreground font-chart" />
                }
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
