import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Users, Boxes, Store } from "lucide-react";
import { useNavigate } from "react-router-dom";
import SellerPerformancePage from "./SellerPerformance";
import ProductPerformancePage from "./reports/ProductPerformance";
import StorePerformancePage from "./reports/StorePerformance";

const TABS = [
  { key: "sellers", label: "Продавцы", icon: Users },
  { key: "products", label: "Товары", icon: Boxes },
  { key: "stores", label: "Магазины", icon: Store },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function SellerDnaPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabKey>("sellers");
  const [period, setPeriod] = useState(90);

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Shared Header */}
      <div className="app-safe-top sticky top-0 z-30 bg-card/80 backdrop-blur-md border-b border-border">
        <div className="px-4 py-2.5">
          {/* Top row: back + title + period */}
          <div className="flex items-center gap-3 mb-2">
            <button onClick={() => navigate(-1)} className="p-1 -ml-1">
              <ArrowLeft className="w-5 h-5 text-muted-foreground" />
            </button>
            <h1 className="text-sm font-bold text-foreground">Seller DNA</h1>
            <div className="ml-auto flex gap-1.5">
              {[30, 60, 90].map(d => (
                <button
                  key={d}
                  onClick={() => setPeriod(d)}
                  className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                    period === d
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-muted text-muted-foreground hover:bg-muted/70"
                  }`}
                >
                  {d}д
                </button>
              ))}
            </div>
          </div>

          {/* Tab bar */}
          <div className="flex gap-1 bg-muted rounded-lg p-0.5">
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md text-xs font-medium transition-all ${
                  activeTab === tab.key
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab content — lazy: render only active tab */}
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15 }}
        className="flex-1"
      >
        {activeTab === "sellers" && <SellerPerformancePage embedded period={period} />}
        {activeTab === "products" && <ProductPerformancePage embedded period={period} />}
        {activeTab === "stores" && <StorePerformancePage embedded period={period} />}
      </motion.div>
    </div>
  );
}
