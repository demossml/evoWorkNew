import type { ProductProfile } from "@/hooks/useProductProfile";

/**
 * Тонкие точечные переопределения видимых подписей под профиль приложения.
 * Не i18n-фреймворк: vape — исходный текст, universal — нейтральный вариант.
 */
export function labelFor(
  profile: ProductProfile,
  vapeLabel: string,
  universalLabel: string,
): string {
  return profile === "universal" ? universalLabel : vapeLabel;
}
