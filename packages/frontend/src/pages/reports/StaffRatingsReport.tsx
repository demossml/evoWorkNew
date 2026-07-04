import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useTelegramBackButton } from "../../hooks/useSimpleTelegramBackButton";
import { client } from "../../helpers/api";

type StaffRating = {
  user_id: string;
  rating: number;
  comment: string;
};

export default function StaffRatingsReport() {
  const [data, setData] = useState<StaffRating[] | null>(null);
  const [loading, setLoading] = useState(true);

  useTelegramBackButton();

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const response = await client.api.ai.aiReport.$get();

        if (!response.ok) throw new Error("Ошибка загрузки отчёта");
        const json = await response.json();
        setData(json.result?.staffRatings || []);
      } catch {
        setData([]);
      }
      setLoading(false);
    };
    fetchData();
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      style={{ maxWidth: 700, margin: "40px auto", fontFamily: "sans-serif" }}
    >
      <h2 style={{ textAlign: "center" }}>
        AI-отчёт по эффективности сотрудников
      </h2>
      {loading ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          style={{ textAlign: "center", marginTop: 40 }}
        >
          <p style={{ fontSize: 18, color: "#888" }}>
            AI анализирует работу сотрудников за сегодня.
            <br />
            Оценка строится по объёму продаж, количеству чеков, среднему чеку,
            возвратам и умению предлагать сопутствующие товары.
            <br />
            Пожалуйста, подождите — идёт формирование отчёта...
          </p>
          <motion.div
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            style={{
              margin: "30px auto",
              width: 48,
              height: 48,
              border: "6px solid #eee",
              borderTop: "6px solid #1976d2",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
            }}
          />
          <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg);}
              100% { transform: rotate(360deg);}
            }
          `}</style>
        </motion.div>
      ) : (
        <div>
          {data && data.length > 0 ? (
            data.map((staff, idx) => (
              <motion.div
                key={staff.user_id}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.5,
                  delay: idx * 0.08,
                  ease: "easeOut",
                }}
                style={{
                  background: "#fafbfc",
                  border: "1px solid #e0e0e0",
                  borderRadius: 10,
                  padding: 24,
                  marginBottom: 28,
                  boxShadow: "0 2px 8px #0001",
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 20, marginBottom: 8 }}>
                  {staff.user_id}
                </div>
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 14, color: "#888", marginBottom: 2 }}>
                    Рейтинг эффективности
                  </div>
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <div
                      style={{
                        flex: 1,
                        height: 14,
                        background: "#e3eafc",
                        borderRadius: 7,
                        overflow: "hidden",
                        marginRight: 12,
                      }}
                    >
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{
                          width: `${Math.round(staff.rating * 100)}%`,
                        }}
                        transition={{ duration: 0.7, ease: "easeInOut" }}
                        style={{
                          height: "100%",
                          background: "#1976d2",
                        }}
                      />
                    </div>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: 16,
                        width: 40,
                        textAlign: "right",
                      }}
                    >
                      {(staff.rating * 100).toFixed(0)}
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    marginTop: 12,
                    fontSize: 15,
                    lineHeight: 1.6,
                    color: "#333",
                    whiteSpace: "pre-line",
                  }}
                >
                  {staff.comment}
                </div>
              </motion.div>
            ))
          ) : (
            <p style={{ textAlign: "center", color: "#888" }}>
              Нет данных для отображения.
            </p>
          )}
        </div>
      )}
    </motion.div>
  );
}
