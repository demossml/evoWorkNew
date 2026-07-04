import { useGetShops } from "../../hooks/useApi";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useTelegramBackButton } from "../../hooks/useSimpleTelegramBackButton";
import { client } from "../../helpers/api";

// Определяем тип данных, которые мы ожидаем от сервера
interface ResponseData {
  dataReport?: Record<string, string>;
  dataUrlPhoto?: string[];
  [key: string]: unknown;
}

export default function StoreOpeningReport() {
  const [selectedShop, setSelectedShop] = useState<string | null>(null);
  const [date, setDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [responseData, setResponseData] = useState<ResponseData>({});
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isReportGenerated, setIsReportGenerated] = useState<boolean>(false);

  const { data, error } = useGetShops();

  useTelegramBackButton();

  useEffect(() => {
    // Можно проверить, если нужно что-то делать с полученными данными
  }, [data]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setResponseData({});
    setIsLoading(true);
    setIsReportGenerated(false);

    if (!selectedShop) {
      alert("Выберите магазин");
      setIsLoading(false);
      return;
    }

    const requestData = { shop: selectedShop, date };

    try {
      const response = await client.api.uploads.getFile.$post({
        json: requestData,
      });

      if (response.ok) {
        const data = await response.json();
        setResponseData(data);
        setIsReportGenerated(true);
      } else {
        alert(`Ошибка при запросе данных: ${response.statusText}`);
      }
    } catch (err: unknown) {
      console.error("Ошибка при выполнении запроса:", err);
      alert("Произошла ошибка. Попробуйте снова.");
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="app-page flex flex-col items-center justify-center bg-gray-100 p-4">
        <motion.div
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="flex items-center mb-4"
        >
          <div className="w-24 h-24 border-8 border-t-transparent border-blue-500 border-solid rounded-full animate-spin" />
          <h1 className="ml-4 text-xl sm:text-2xl text-gray-800 font-bold" />
        </motion.div>
      </div>
    );
  }

  if (error) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="app-page flex flex-col items-center justify-center bg-gray-100 p-4"
      >
        <h1 className="mb-4 text-xl sm:text-2xl text-gray-800 font-bold">
          Ошибка: {error.message}
        </h1>
      </motion.div>
    );
  }

  if (!data || !data.shopsNameAndUuid.length) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="app-page flex flex-col items-center justify-center bg-gray-100 p-4"
      >
        <h1 className="mb-4 text-xl sm:text-2xl text-gray-800 font-bold">
          Нет данных для отображения.
        </h1>
        <div className="text-left mt-6">
          <a
            href="/"
            className="bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-600 active:bg-blue-700 transition duration-300"
          >
            На главную
          </a>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="bg-custom-gray shadow-md rounded-lg p-4 mt-4"
    >
      {!isReportGenerated && (
        <motion.form
          onSubmit={handleSubmit}
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        >
          <div className="mb-4">
            <label
              htmlFor="shop"
              className="block text-sm font-medium text-gray-700"
            >
              Выберите магазин:
            </label>
            <select
              id="shop"
              name="shop"
              value={selectedShop || ""}
              onChange={(e) => setSelectedShop(e.target.value)}
              className="mt-1 block w-full p-2 border border-gray-300 rounded-md"
            >
              <option value="">Выберите магазин</option>
              {data.shopsNameAndUuid.map((shop) => (
                <option key={shop.uuid} value={shop.uuid}>
                  {shop.name}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-4">
            <label
              htmlFor="date"
              className="block text-sm font-medium text-gray-700"
            >
              Выберите дату:
            </label>
            <input
              type="date"
              id="date"
              name="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 block w-full p-2 border border-gray-300 rounded-md"
            />
          </div>

          <motion.button
            type="submit"
            className="w-full bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600"
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          >
            Получить отчет
          </motion.button>
        </motion.form>
      )}

      {isReportGenerated && (
        <>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="mt-6 bg-custom-gray p-4 rounded-md"
          >
            <h3 className="text-xl font-semibold">Информация о магазине:</h3>
            <ul className="mt-4">
              {Object.entries(responseData.dataReport || {}).map(
                ([key, value]) => (
                  <li key={key} className="flex justify-between py-2 border-b">
                    <span className="font-medium">{key}:</span>
                    <span>{value}</span>
                  </li>
                )
              )}
            </ul>
          </motion.div>

          {responseData.dataUrlPhoto &&
            responseData.dataUrlPhoto.length > 0 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className="mt-6"
              >
                <h3 className="text-xl font-semibold">Фотографии:</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mt-4">
                  {responseData.dataUrlPhoto.map((url, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, delay: index * 0.08 }}
                      className="bg-gray-200 rounded-md p-2"
                    >
                      <img
                        src={url}
                        alt={`Фото ${index + 1}`}
                        className="w-full h-auto rounded-md"
                      />
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
        </>
      )}

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="text-left mt-4"
      >
        <a
          href="/"
          className="bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-700 active:bg-blue-800 transition duration-300"
        >
          На главную
        </a>
      </motion.div>
    </motion.div>
  );
}
