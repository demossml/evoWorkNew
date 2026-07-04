import type React from "react";
import { motion } from "framer-motion";

export const LoadingState: React.FC = () => {
  return (
    <div className="app-page flex flex-col items-center justify-center bg-custom-gray dark:bg-gray-800 p-4">
      <div className="flex items-center mb-4">
        {/* Spinner с анимацией появления */}
        <motion.div
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="w-24 h-24 border-8 border-t-transparent border-blue-500 dark:border-blue-400 border-solid rounded-full animate-spin"
        />
      </div>
    </div>
  );
};
