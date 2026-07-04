import { useState } from "react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";

export function ChangeTelegramId() {
  const [newId, setNewId] = useState("");
  const [message, setMessage] = useState("");

  const handleChange = () => {
    if (!newId) {
      setMessage("Введите новый Telegram ID");
      return;
    }

    // сохраняем новый ID
    localStorage.setItem("telegramId", newId);

    setMessage("Telegram ID успешно обновлён!");
    setTimeout(() => {
      window.location.reload(); // перегружаем страницу, чтобы начать работать под новым ID
    }, 1000);
  };

  return (
    <div className="space-y-4">
      <Input
        type="text"
        placeholder="Новый Telegram ID"
        value={newId}
        onChange={(e) => setNewId(e.target.value)}
      />
      {message && <p className="text-green-500 text-sm">{message}</p>}
      <Button onClick={handleChange} className="w-full">
        Сменить Telegram ID
      </Button>
    </div>
  );
}
