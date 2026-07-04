interface CashDiscrepancyData {
  amount: number | string;
  type: "+" | "-";
}

interface CashDiscrepancyFormProps {
  data: CashDiscrepancyData;
  setData: React.Dispatch<React.SetStateAction<CashDiscrepancyData>>;
}

export default function CashDiscrepancyForm({
  data,
  setData,
}: CashDiscrepancyFormProps) {
  return (
    <div className="space-y-3">
      <div>
        <label className="text-sm">Сумма расхождения</label>
        <input
          type="number"
          className="w-full p-2 rounded-lg bg-gray-100 dark:bg-gray-800"
          value={data.amount}
          onChange={(e) => setData((p) => ({ ...p, amount: e.target.value }))}
        />
      </div>

      <div>
        <label className="text-sm">Тип</label>
        <select
          className="w-full p-2 rounded-lg bg-gray-100 dark:bg-gray-800"
          value={data.type}
          onChange={(e) =>
            setData((p) => ({ ...p, type: e.target.value as "+" | "-" }))
          }
        >
          <option value="+">+ (излишек)</option>
          <option value="-">- (недостача)</option>
        </select>
      </div>
    </div>
  );
}
