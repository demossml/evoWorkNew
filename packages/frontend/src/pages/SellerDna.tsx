import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import SellerPerformancePage from "./SellerPerformance";

export default function SellerDnaPage() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState(90);

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <div className="app-safe-top sticky top-0 z-30 bg-card/80 backdrop-blur-md border-b border-border">
        <div className="px-4 py-2.5">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="p-1 -ml-1">
              <ArrowLeft className="w-5 h-5 text-muted-foreground" />
            </button>
            <h1 className="text-sm font-bold text-foreground">Аналитика продавцов</h1>
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
        </div>
      </div>

      <SellerPerformancePage embedded period={period} />
    </div>
  );
}
