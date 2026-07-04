import { motion } from "framer-motion";
import { formatCurrency } from "../../../utils/formatCurrency";

export const AnimatedNumber = ({ value }: { value: number }) => (
  <motion.span
    key={value}
    initial={{ opacity: 0, y: -10 }}
    animate={{ opacity: 1, y: 0 }}
  >
    {formatCurrency(value)}
  </motion.span>
);
