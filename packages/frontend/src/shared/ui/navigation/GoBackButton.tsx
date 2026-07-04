import type React from "react";
import { motion } from "framer-motion";

type GoBackButtonProps = {
  error?: string; // Ошибка, которая будет отображаться (опционально)
};

export const GoBackButton: React.FC<GoBackButtonProps> = ({ error }) => {
  // Функция для возврата назад
  const goBack = () => {
    window.history.back(); // Возврат на предыдущую страницу через историю браузера
  };

  return (
    <div>
      {/* Кнопка "Назад" с анимацией */}
      <motion.button
        type="button"
        onClick={goBack}
        className="text-blue-500 dark:text-blue-400 text-sm font-semibold flex items-center"
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      >
        <span className="mr-2">←</span> Назад
      </motion.button>

      {/* Отображение ошибки, если она передана */}
      {error && (
        <motion.div
          className="text-red-500 dark:text-red-400 text-center mt-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        >
          Ошибка: {error}
        </motion.div>
      )}
    </div>
  );
};
