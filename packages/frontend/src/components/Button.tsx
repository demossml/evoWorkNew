import { Link } from "react-router-dom";
import { motion } from "framer-motion";

// Define button class with responsive styling
const buttonClass =
  "w-full h-10 sm:h-12 py-2 px-4 bg-card text-foreground text-sm sm:text-base text-center rounded-lg border border-border hover:bg-muted flex items-center justify-center transition-colors duration-200";

export const CashierButtons = () => (
  <div className="flex flex-col gap-2 sm:gap-3 w-full max-w-md mx-auto mt-auto mb-6 px-4 sm:px-6">
    <motion.div
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 300 }}
    >
      <Link to="/evotor/salary-user-report" className={buttonClass}>
        Зарплата
      </Link>
    </motion.div>
    <motion.div
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 300 }}
    >
      <Link to="/" className={buttonClass}>
        План продаж
      </Link>
    </motion.div>
    <motion.div
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 300 }}
    >
      <Link to="/evotor/orders" className={buttonClass}>
        Заказ товара (SMA)
      </Link>
    </motion.div>
    <motion.div
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 300 }}
    >
      <Link to="/evotor/sales-report" className={buttonClass}>
        Отчёт по продажам
      </Link>
    </motion.div>
    <motion.div
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 300 }}
    >
      <Link to="/evotor/stock-realization-report" className={buttonClass}>
        Товарные остатки
      </Link>
    </motion.div>
  </div>
);

export const AdminButtons = () => (
  <div className="flex flex-col gap-2 sm:gap-3 w-full max-w-md mx-auto mt-auto mb-6 px-4 sm:px-6">
    <motion.div
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 300 }}
    >
      <Link to="/evotor/settings" className={buttonClass}>
        Настроить
      </Link>
    </motion.div>
    <motion.div
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 300 }}
    >
      <Link to="/evotor/salary-report" className={buttonClass}>
        Зарплата
      </Link>
    </motion.div>
    <motion.div
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 300 }}
    >
      <Link to="/evotor/orders" className={buttonClass}>
        Заказ товара (SMA)
      </Link>
    </motion.div>
    <motion.div
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 300 }}
    >
      <Link to="/evotor/sales-report" className={buttonClass}>
        Отчёт по продажам
      </Link>
    </motion.div>
    <motion.div
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 300 }}
    >
      <Link to="/evotor/sales-for-the-period" className={buttonClass}>
        Сводный финансовый отчет
      </Link>
    </motion.div>
    <motion.div
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 300 }}
    >
      <Link to="/evotor/store-opening-report" className={buttonClass}>
        Отчёт об открытии магазинов
      </Link>
    </motion.div>
    <motion.div
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 300 }}
    >
      <Link to="/evotor/stock-realization-report" className={buttonClass}>
        Товарные остатки
      </Link>
    </motion.div>
  </div>
);

export const SuperAdminButtons = () => (
  <div className="flex flex-col gap-2 sm:gap-3 w-full max-w-md mx-auto mt-auto mb-6 px-4 sm:px-6">
    <motion.div
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 300 }}
    >
      <Link to="/evotor/profit" className={buttonClass}>
        Расчеты прибыли
      </Link>
    </motion.div>
    <motion.div
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 300 }}
    >
      <Link to="/evotor/settings" className={buttonClass}>
        Настроить
      </Link>
    </motion.div>
    <motion.div
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 300 }}
    >
      <Link to="/evotor/salary-report" className={buttonClass}>
        Зарплата
      </Link>
    </motion.div>
    <motion.div
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 300 }}
    >
      <Link to="/evotor/orders" className={buttonClass}>
        Заказ товара (SMA)
      </Link>
    </motion.div>
    <motion.div
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 300 }}
    >
      <Link to="/evotor/sales-report" className={buttonClass}>
        Отчёт по продажам
      </Link>
    </motion.div>
    <motion.div
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 300 }}
    >
      <Link to="/evotor/sales-for-the-period" className={buttonClass}>
        Сводный финансовый отчет
      </Link>
    </motion.div>
    <motion.div
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 300 }}
    >
      <Link to="/evotor/store-opening-report" className={buttonClass}>
        Отчёт об открытии магазинов
      </Link>
    </motion.div>
    <motion.div
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 300 }}
    >
      <Link to="/evotor/stock-realization-report" className={buttonClass}>
        Товарные остатки
      </Link>
    </motion.div>
  </div>
);
