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

function renderYearlyCell(cell) {
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

const YearlyChart = ({ data, year, selectedGameName = "" }) => {
  const months = [
    "JAN","FEB","MAR","APR","MAY","JUN",
    "JUL","AUG","SEP","OCT","NOV","DEC"
  ];

  const days = Array.from({ length: 31 }, (_, i) => i + 1);
  const displayYear = year || new Date().getFullYear();

  const lookup = {};

  if (data?.chart && typeof data.chart === "object" && !Array.isArray(data.chart)) {
    Object.entries(data.chart).forEach(([day, val]) => {
      if (Array.isArray(val)) {
        val.forEach((res, monthIdx) => {
          if (res) {
            lookup[`${day}-${monthIdx + 1}`] = res;
          }
        });
      } else if (val && typeof val === "object") {
        Object.entries(val).forEach(([m, res]) => {
          if (res) {
            lookup[`${day}-${parseInt(m) + 1}`] = res;
          }
        });
      }
    });
  } else {
    const results = Array.isArray(data?.results)
      ? data.results
      : Array.isArray(data)
      ? data
      : [];

    results.forEach((r) => {
      const d = r.day || new Date(r.result_date || r.date).getDate();
      const m =
        r.month != null
          ? r.month
          : new Date(r.result_date || r.date).getMonth() + 1;

      lookup[`${d}-${m}`] = r.result_number;
    });
  }

  return (
    <div className="w-full max-w-107.5">

      {/* GOLD HEADER SAME AS MONTHLY */}
      <div className="relative mt-2 mb-2 flex justify-center px-3">
        <h2 className="relative w-full max-w-95 bg-[linear-gradient(94deg,#b6842d,#ebda8d_55%,#b7862f)] px-[clamp(52px,16vw,112px)] py-2 text-center text-xs font-bold text-black sm:text-sm">

          <span className="absolute top-0 -left-1.5 h-full w-[clamp(20px,6vw,40px)] bg-[linear-gradient(94deg,#b6842d,#ebda8d_55%,#b7862f)] skew-x-[-25deg] sm:-left-2.5"></span>

          <span className="absolute top-0 -right-1.5 h-full w-[clamp(20px,6vw,40px)] bg-[linear-gradient(94deg,#b6842d,#ebda8d_55%,#b7862f)] skew-x-25 sm:-right-2.5"></span>

          <p className="relative z-10 whitespace-nowrap tracking-wide">
           {selectedGameName} YEARLY CHART {displayYear}
          </p>
        </h2>
      </div>

      {/* TABLE */}
      <div className="overflow-x-auto border border-[#d6b774]">
        <table className="min-w-max w-full border-collapse text-xs text-center">

          {/* HEADER */}
          <thead>
            <tr className="bg-[#c99a3a] text-white font-bold">

              {/* sticky first column */}
              <th className="sticky left-0 z-20 bg-[#c99a3a] border border-[#d6b774] px-3 py-2">
                DAY
              </th>

              {months.map((month, index) => (
                <th
                  key={index}
                  className="border border-[#d6b774] px-3 py-2"
                >
                  {month}
                </th>
              ))}
            </tr>
          </thead>

          {/* BODY */}
          <tbody>
            {days.map((day, index) => {

              const rowBg =
                index % 2 === 0 ? "bg-[#efefef]" : "bg-[#e3e3e3]";

              return (
                <tr key={day} className={rowBg}>

                  {/* sticky first column */}
                  <td className="sticky left-0 bg-[#c99a3a] text-white font-semibold border border-[#d6b774] px-3 py-2">
                    {day}
                  </td>

                  {months.map((_, monthIndex) => (
                    <td
                      key={monthIndex}
                      className="border border-[#d6b774] px-3 py-2 text-black w-20"
                    >
                      {renderYearlyCell(
                        lookup[`${day}-${monthIndex + 1}`]
                      )}
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

export default YearlyChart;