"use client";
import React, { useState, useEffect } from "react";
import Header from "../components/Header";
import YearlyChart from "../components/YearlyChart";
import { resultAPI, gameAPI } from "../lib/api";

const ChartPage = () => {
  const [games, setGames] = useState([]);
  const [selectedGame, setSelectedGame] = useState("");
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear.toString());
  const [yearlyData, setYearlyData] = useState(null);
  const yearOptions = Array.from({ length: 3 }, (_, index) =>
    String(currentYear - 2 + index),
  );

  const fetchChart = async (
    gameName = selectedGame,
    yearValue = selectedYear,
  ) => {
    if (!gameName) {
      return;
    }

    try {
      const res = await resultAPI.yearly({ city: gameName, year: yearValue });
      setYearlyData(res);
    } catch {}
  };

  useEffect(() => {
    gameAPI
      .list()
      .then((res) => {
        const g = res.games || [];
        setGames(g);
        if (g.length > 0) setSelectedGame(g[0].name);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedGame) {
      return;
    }

    fetchChart(selectedGame, selectedYear);

    const intervalId = setInterval(() => {
      fetchChart(selectedGame, selectedYear);
    }, 30000);

    return () => clearInterval(intervalId);
  }, [selectedGame, selectedYear]);

  return (
    <div>
      <Header></Header>

      <div className="bg-white">
        <div className="mx-auto w-full max-w-107.5 ">
          <div className="relative mt-2 mb-2 flex justify-center px-3">
            <h2 className="relative w-full max-w-95 bg-[linear-gradient(94deg,#b6842d,#ebda8d_55%,#b7862f)] px-[clamp(52px,16vw,112px)] py-2 text-center text-xs font-bold text-black sm:text-sm">
              <span className="absolute top-0 -left-1.5 h-full w-[clamp(20px,6vw,40px)] bg-[linear-gradient(94deg,#b6842d,#ebda8d_55%,#b7862f)] skew-x-[-25deg] sm:-left-2.5"></span>

              <span className="absolute top-0 -right-1.5 h-full w-[clamp(20px,6vw,40px)] bg-[linear-gradient(94deg,#b6842d,#ebda8d_55%,#b7862f)] skew-x-25 sm:-right-2.5"></span>

              <p className="relative z-10 whitespace-nowrap tracking-wide">
                 Record Chart {selectedYear}
              </p>
            </h2>
          </div>

          <div className="border border-t-0 border-[#d6b774] bg-white  shadow-[0_12px_28px_rgba(79,52,10,0.08)] p-3">
            <div className="flex gap-1">
              <select
                className="h-9 flex-1 border border-[#d8d1c4] bg-[#faf7f0] px-2 text-sm font-medium text-[#111] outline-none"
                value={selectedGame}
                onChange={(e) => setSelectedGame(e.target.value)}
              >
                {games.map((g) => (
                  <option key={g.id} value={g.name}>
                    {g.name}
                  </option>
                ))}
              </select>

              <select
                className="h-9flex-1 border border-[#d8d1c4] bg-[#faf7f0] px-2 text-sm font-medium text-[#111] outline-none"
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
              >
                {yearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>

              <button
                className="h-9 flex-1 bg-[#111] text-sm font-semibold text-[#ebda8d]"
                type="button"
                onClick={() => fetchChart(selectedGame, selectedYear)}
              >
                Check →
              </button>
            </div>
          </div>

          <YearlyChart
            data={yearlyData}
            year={selectedYear}
            selectedGameName={selectedGame}
          ></YearlyChart>
        </div>
      </div>
    </div>
  );
};

export default ChartPage;
