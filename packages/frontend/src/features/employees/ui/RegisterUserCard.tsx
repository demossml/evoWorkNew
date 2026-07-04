import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { client } from "@/helpers/api";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateUserQueries } from "@shared/api";

interface RegisterUserCardProps {
  onRegister: (id: string) => void;
}

export function RegisterUserCard({ onRegister }: RegisterUserCardProps) {
  const queryClient = useQueryClient();
  const [telegramId, setTelegramId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!telegramId.trim()) {
      setError("Пожалуйста, введите ваш Telegram ID");
      return;
    }

    try {
      setLoading(true);

      const response = await client.api.employees.register.$post({
        json: { userId: telegramId },
      });
      const data = await response.json();

      if (data.success) {
        localStorage.setItem("telegramId", telegramId);
        await invalidateUserQueries(queryClient);
        onRegister(telegramId);
        window.location.href = "/";
      } else {
        setError("Ошибка при регистрации");
      }
    } catch (err) {
      console.error("Ошибка при регистрации:", err);
      setError("Ошибка соединения с сервером");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md shadow-lg dark:bg-gray-800 text-black dark:text-gray-200">
      <CardHeader>
        <CardTitle className="text-center text-lg font-semibold">
          Регистрация нового пользователя
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            type="text"
            placeholder="Введите Telegram ID"
            value={telegramId}
            onChange={(e) => setTelegramId(e.target.value)}
            disabled={loading}
          />

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <Button
            type="submit"
            className="w-full"
            disabled={!telegramId.trim() || loading}
          >
            {loading ? "Регистрация..." : "Зарегистрировать"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
