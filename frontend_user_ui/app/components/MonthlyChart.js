import React from "react";

function renderWaitIcon() {
  return (
    <img
      src="/images/d.gif"
      alt="wait icon"
      height={24}
      width={24}
      className="inline-block"
    />
  );
}

function renderChartCell(cell) {
  if (!cell) {
    return "-";
  }

  if (typeof cell === "object" && !Array.isArray(cell)) {
    if (cell.has_result && !cell.result_visible) {
      return renderWaitIcon();
    }

    return cell.result_number || "-";
  }

  return cell || "-";
}

const MonthlyChart = ({ data, gameNames: providedGameNames = [] }) => {
  let gameNames = [];
  const dateMap = {};

  if (
    data?.chart &&
    typeof data.chart === "object" &&
    !Array.isArray(data.chart)
  ) {
    const chart = data.chart;
    const nameSet = new Set();

    Object.entries(chart).forEach(([day, games]) => {
      if (games && typeof games === "object") {
        Object.keys(games).forEach((g) => nameSet.add(g));
        dateMap[day] = games;
      }
    });

    gameNames = [...nameSet];
  } else {
    const results = Array.isArray(data?.results)
      ? data.results
      : Array.isArray(data)
        ? data
        : [];

    gameNames = [...new Set(results.map((r) => r.game_name).filter(Boolean))];

    results.forEach((r) => {
      const d = r.result_date || r.date;
      const dateStr = d
        ? new Date(d).toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "2-digit",
          })
        : "-";

      if (!dateMap[dateStr]) dateMap[dateStr] = {};
      dateMap[dateStr][r.game_name] = r.result_number;
    });
  }

  if (providedGameNames.length > 0) {
    const filtered = gameNames.filter((n) => providedGameNames.includes(n));
    gameNames = filtered.length > 0 ? filtered : providedGameNames;
  }

  const year = Number(data?.year) || new Date().getFullYear();
  const month = Number(data?.month) || new Date().getMonth() + 1;

  const now = new Date();

  const isCurrentMonth =
    year === now.getFullYear() && month === now.getMonth() + 1;

  const lastDayOfMonth = new Date(year, month, 0).getDate();

  const maxDay = isCurrentMonth ? now.getDate() : lastDayOfMonth;

  const dates = Array.from({ length: maxDay }, (_, index) => String(index + 1));

  const todayDay = isCurrentMonth ? String(now.getDate()) : null;

  const formatDateLabel = (day) => {
    const safeDay = String(day).padStart(2, "0");
    return `${safeDay}-${String(month).padStart(2, "0")}`;
  };

  return (
    <div className="w-full">
      <div className="relative mt-2 mb-2 flex justify-center px-3">
        <h2 className="relative w-full max-w-95 bg-[linear-gradient(94deg,#b6842d,#ebda8d_55%,#b7862f)] px-[clamp(52px,16vw,112px)] py-2 text-center text-xs font-bold text-black sm:text-sm">
          {/* left angled side */}
          <span className="absolute top-0 -left-1.5 h-full w-[clamp(20px,6vw,40px)] bg-[linear-gradient(94deg,#b6842d,#ebda8d_55%,#b7862f)] skew-x-[-25deg] sm:-left-2.5"></span>

          {/* right angled side */}
          <span className="absolute top-0 -right-1.5 h-full w-[clamp(20px,6vw,40px)] bg-[linear-gradient(94deg,#b6842d,#ebda8d_55%,#b7862f)] skew-x-25 sm:-right-2.5"></span>

          <p className="relative z-10 whitespace-nowrap tracking-wide">
             KING MONTHLY CHART
          </p>
        </h2>
      </div>

      <div className="overflow-x-auto border border-[#d6b774]">
        <table className="min-w-max w-full border-collapse text-xs text-center">
          {/* HEADER */}
          <thead>
            <tr className="bg-[#c99a3a] text-white font-bold">
              <th className="sticky left-0 z-20 bg-[#c99a3a] border border-[#d6b774] px-3 py-2">
                Date
              </th>

              {gameNames.map((g) => (
                <th key={g} className="border border-[#d6b774] px-3 py-2">
                  {g}
                </th>
              ))}
            </tr>
          </thead>

          {/* BODY */}
          <tbody>
            {dates.map((date, index) => {
              const rowBg = index % 2 === 0 ? "bg-[#efefef]" : "bg-[#e3e3e3]";

              return (
                <tr key={date} className={rowBg}>
                  {/* STICKY DATE COLUMN */}
                  <td className="sticky left-0 bg-[#c99a3a] text-white font-semibold border border-[#d6b774] px-3 py-2">
                    {formatDateLabel(date)}
                  </td>

                  {gameNames.map((g) => (
                    <td
                      key={g}
                      className="border border-[#d6b774] px-3 py-2 text-black w-32"
                    >
                      {renderChartCell(dateMap[date]?.[g])}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default MonthlyChart;
