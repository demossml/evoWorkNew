import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Users, Boxes, Store } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import SellerPerformancePage from "./SellerPerformance";
import ProductPerformancePage from "./reports/ProductPerformance";
import StorePerformancePage from "./reports/StorePerformance";

const TABS = [
  { key: "sellers", label: "Продавцы", icon: Users },
  { key: "products", label: "Товары", icon: Boxes },
  { key: "stores", label: "Магазины", icon: Store },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function Analytics() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab") as TabKey | null;
  const [activeTab, setActiveTab] = useState<TabKey>(
    TABS.some(t => t.key === tabParam) ? tabParam! : "sellers",
  );

  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Tab bar */}
      <div className="app-safe-top sticky top-0 z-30 bg-card/80 backdrop-blur-md border-b border-border">
        <div className="px-4 py-2.5">
          <div className="flex items-center gap-3 mb-2">
            <button onClick={() => navigate(-1)} className="p-1 -ml-1">
              <ArrowLeft className="w-5 h-5 text-muted-foreground" />
            </button>
            <h1 className="text-sm font-bold text-foreground">Аналитика</h1>
          </div>
          <div className="flex gap-1 bg-muted rounded-lg p-0.5">
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
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

      {/* Tab content */}
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, x: activeTab === "sellers" ? -20 : activeTab === "stores" ? 20 : 0 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.2 }}
        className="flex-1"
      >
        {activeTab === "sellers" && <SellerPerformancePage embedded />}
        {activeTab === "products" && <ProductPerformancePage embedded />}
        {activeTab === "stores" && <StorePerformancePage embedded />}
      </motion.div>
    </div>
  );
}
