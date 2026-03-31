"use client";
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Header from "../components/Header";
import HomeHeroBanner from "../components/HomeHeroBanner";
import HomeNewLaunch from "../components/HomeNewLaunch";
import Link from "next/link";
import MonthlyChart from "../components/MonthlyChart";
import DepositWithdrawBtns from "../components/DepositWithdrawBtns";
import SkeletonBlock from "../components/SkeletonBlock";
import Toast from "../components/Toast";
import CustomAds from "../components/CustomAds";
import { betAPI, gameAPI, resultAPI } from "../lib/api";

function parseTimeParts(timeValue) {
  const parts = String(timeValue || "")
    .split(":")
    .map(Number);
  return { hours: parts[0] || 0, minutes: parts[1] || 0 };
}

function formatGameTime(timeValue) {
  if (!timeValue) return "--:--";
  const { hours, minutes } = parseTimeParts(timeValue);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });
}

function getGameWindow(timeOpen, timeClose, referenceDate = new Date()) {
  const openParts = parseTimeParts(timeOpen);
  const closeParts = parseTimeParts(timeClose);
  const isOvernight =
    closeParts.hours < openParts.hours ||
    (closeParts.hours === openParts.hours &&
      closeParts.minutes < openParts.minutes);

  const openTime = new Date(referenceDate);
  openTime.setHours(openParts.hours, openParts.minutes, 0, 0);

  const closeTime = new Date(referenceDate);
  closeTime.setHours(closeParts.hours, closeParts.minutes, 0, 0);

  if (isOvernight) {
    const todayOpenTime = new Date(openTime);
    const todayCloseTime = new Date(closeTime);

    if (referenceDate >= todayOpenTime) {
      closeTime.setDate(closeTime.getDate() + 1);
    } else if (referenceDate < todayCloseTime) {
      openTime.setDate(openTime.getDate() - 1);
    } else {
      closeTime.setDate(closeTime.getDate() + 1);
    }
  }

  return { openTime, closeTime };
}

function getGameAvailability(game, referenceDate = new Date()) {
  const { openTime, closeTime } = getGameWindow(
    game.open_time,
    game.close_time,
    referenceDate,
  );

  if (referenceDate < openTime) {
    return {
      canPlay: false,
      label: `Opens ${openTime.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false })}`,
    };
  }

  if (referenceDate >= closeTime) {
    return {
      canPlay: false,
      label: "Closed",
    };
  }

  return {
    canPlay: true,
    label: "PLAY NOW",
  };
}

function LockBadge({ size = "text-base" }) {
  return (
    <span
      className={`inline-flex items-center justify-center ${size} text-white drop-shadow-2xl px-2 py-1 rounded-full gap-1`}
    >
      <i className="fa fa-lock" aria-hidden="true"></i>
    </span>
  );
}

const monthOptions = [
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

const titleBarClass =
  "flex items-center justify-between bg-[linear-gradient(94deg,#b6842d,#ebda8d_55%,#b7862f)] px-4 py-1 text-[#1b1403] shadow-[0_8px_18px_rgba(184,132,34,0.18)]";
const selectClass =
  "min-w-[132px] border border-[#d8c28f] bg-white px-4 py-2 text-xs font-semibold text-[#312200] outline-none transition focus:border-[#b88422]";

const HomePage = () => {
  const currentYear = new Date().getFullYear();
  // State
  const [games, setGames] = useState([]);
  const [gamesLoading, setGamesLoading] = useState(true);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);

  const [liveResults, setLiveResults] = useState([]);
  const [resultsLoading, setResultsLoading] = useState(true);

  const [monthlyData, setMonthlyData] = useState(null);
  const [chartLoading, setChartLoading] = useState(true);

  const [selectedMonth, setSelectedMonth] = useState(
    (new Date().getMonth() + 1).toString(),
  );
  const [selectedYear, setSelectedYear] = useState(
    new Date().getFullYear().toString(),
  );

  const [recentWinners, setRecentWinners] = useState([]);
  const [winnersLoading, setWinnersLoading] = useState(true);

  const [toast, setToast] = useState({ message: "", type: "info" });
  const [clock, setClock] = useState("");

  // For winner carousel
  const [winnerIndex, setWinnerIndex] = useState(0);

  // Interval refs
  const resultsIntervalRef = useRef(null);
  const winnersIntervalRef = useRef(null);
  const clockIntervalRef = useRef(null);

  // Unmount flag
  const isMounted = useRef(true);

  // Games: load once
  const loadGames = useCallback(async () => {
    setGamesLoading(true);
    try {
      const data = await gameAPI.list();
      if (!isMounted.current) return;
      setGames(Array.isArray(data?.games) ? data.games : []);
      if (data?.server_now) {
        setServerOffsetMs(new Date(data.server_now).getTime() - Date.now());
      }
    } catch (error) {
      if (!isMounted.current) return;
      setToast({
        message: error?.message || "Failed to load games.",
        type: "error",
      });
      setGames([]);
    } finally {
      if (isMounted.current) setGamesLoading(false);
    }
  }, []);

  // Live results: refresh every 30s
  const loadLiveResults = useCallback(async () => {
    setResultsLoading(true);
    try {
      const data = await resultAPI.live();
      if (!isMounted.current) return;
      setLiveResults(Array.isArray(data?.results) ? data.results : []);
    } catch (error) {
      if (!isMounted.current) return;
      setToast({
        message: error?.message || "Failed to load live results.",
        type: "error",
      });
      setLiveResults([]);
    } finally {
      if (isMounted.current) setResultsLoading(false);
    }
  }, []);

  // Monthly chart: load on month/year change
  const loadMonthlyChart = useCallback(
    async (year = selectedYear, month = selectedMonth) => {
      setChartLoading(true);
      try {
        const response = await resultAPI.monthly({ year, month });
        if (!isMounted.current) return;
        setMonthlyData(response || {});
      } catch (error) {
        if (!isMounted.current) return;
        setToast({
          message: error?.message || "Failed to load monthly chart.",
          type: "error",
        });
        setMonthlyData({});
      } finally {
        if (isMounted.current) setChartLoading(false);
      }
    },
    [selectedMonth, selectedYear],
  );

  // Winners: refresh every 30s
  const loadRecentWinners = useCallback(async () => {
    setWinnersLoading(true);
    try {
      const data = await betAPI.recentWinners({ limit: 5 });
      if (!isMounted.current) return;
      setRecentWinners(Array.isArray(data?.winners) ? data.winners : []);
    } catch (error) {
      if (!isMounted.current) return;
      setRecentWinners([]);
      setToast({
        message: error?.message || "Failed to load recent winners.",
        type: "error",
      });
    } finally {
      if (isMounted.current) setWinnersLoading(false);
    }
  }, []);

  // Initial load: games, chart, results, winners
  useEffect(() => {
    isMounted.current = true;
    loadGames();
    loadLiveResults();
    loadMonthlyChart(selectedYear, selectedMonth);
    loadRecentWinners();

    // Clock interval
    clockIntervalRef.current = setInterval(() => {
      setClock(
        new Date().toLocaleString("en-IN", {
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
          timeZone: "Asia/Kolkata",
        }),
      );
    }, 1000);

    // Results interval
    resultsIntervalRef.current = setInterval(() => {
      loadLiveResults();
    }, 30000);

    // Winners interval
    winnersIntervalRef.current = setInterval(() => {
      loadRecentWinners();
    }, 30000);

    setClock(
      new Date().toLocaleString("en-IN", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
        timeZone: "Asia/Kolkata",
      }),
    );

    return () => {
      isMounted.current = false;
      clearInterval(clockIntervalRef.current);
      clearInterval(resultsIntervalRef.current);
      clearInterval(winnersIntervalRef.current);
    };
    // eslint-disable-next-line
  }, []);

  // Chart reload on month/year change
  useEffect(() => {
    loadMonthlyChart(selectedYear, selectedMonth);
  }, [selectedMonth, selectedYear, loadMonthlyChart]);

  // Winner carousel
  useEffect(() => {
    if (!recentWinners?.length) return;
    const interval = setInterval(() => {
      setWinnerIndex((prev) => (prev + 1) % recentWinners.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [recentWinners]);

  // Memoized helpers
  const getResultForGame = useCallback(
    (gameName) => {
      const result = liveResults.find((item) => item.name === gameName);
      if (!result || !result.result_visible || !result.result_number) {
        return <LockBadge size="text-sm" />;
      }
      return result.result_number;
    },
    [liveResults],
  );

  const yearOptions = useMemo(
    () => Array.from({ length: 3 }, (_, index) => String(currentYear - 2 + index)),
    [currentYear],
  );

  // UI always renders
  return (
    <div className="mx-auto w-full max-w-107.5 bg-[#f6f7fa]">
      <Toast
        message={toast.message}
        type={toast.type}
        onClose={() => setToast({ message: "", type: "info" })}
      />
      <Header />
      <DepositWithdrawBtns />
      <HomeHeroBanner />
      <HomeNewLaunch />

      <section className="bg-black text-white text-center py-4">
        {/* Clock */}
        <div className="text-lg font-bold tracking-[0.02em]">
          <span className="bg-[radial-gradient(circle_at_top,#fff4d4,#f3db9c_48%,#d0a84b)] bg-clip-text text-transparent">
            {clock}
          </span>
        </div>
        {/* Hindi text */}
        <p className="mt-2 text-lg font-semibold text-white">
          हा भाई यही आती हे सबसे पहले खबर रूको और देखो
        </p>
        {/* Results */}
        <div className="mt-6 space-y-8">
          {!resultsLoading &&
            (liveResults ?? []).map((resultItem, idx) => (
              <div
                key={`${resultItem.game_id || resultItem.name}-${idx}`}
                className="flex flex-col items-center"
              >
                {/* Game Name */}
                <p className="text-3xl font-semibold tracking-wide">
                  {resultItem.name}
                </p>
                {/* Result */}
                {resultItem.result_visible && resultItem.result_number ? (
                  <p className="mt-2 text-3xl font-bold text-gray-200">
                    {resultItem.result_number}
                  </p>
                ) : (
                  <div className="mt-2 text-4xl">
                    <img src="/images/d.gif" alt="Locked" />
                  </div>
                )}
                {/* Time */}
                <p className="mt-2 text-sm font-semibold text-gray-300">
                  {formatGameTime(resultItem.close_time)}
                </p>
              </div>
            ))}
        </div>
      </section>

      <CustomAds />

      {/* Winners Section */}
      {/* <section className="border border-[#e9dcc0] bg-white shadow-[0_18px_34px_rgba(15,23,42,0.08)] p-3">
        <div className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.14em] text-[#1f1500]">
          <span>🏆</span>
          <span>Recent Winners</span>
        </div>
        {winnersLoading && (
          <div className="mt-2 space-y-2">
            {[1, 2, 3].map((item) => (
              <SkeletonBlock key={item} className="h-4 w-full" />
            ))}
          </div>
        )}
        {!winnersLoading && recentWinners.length > 0 && (
          <div className="mt-2 space-y-2">
            <div
              key={`${recentWinners[winnerIndex]?.bet_id}-${recentWinners[winnerIndex]?.created_at}`}
              className="flex items-center justify-between border border-[#ead8ab] bg-[#fff8e7] px-3 py-2 text-xs"
            >
              <span className="font-semibold text-[#2f2410]">
                {recentWinners[winnerIndex]?.user_name} won
              </span>
              <span className="font-black text-[#b88422]">
                ₹{Number(recentWinners[winnerIndex]?.win_amount || 0).toLocaleString("en-IN")}
              </span>
            </div>
          </div>
        )}
        {!winnersLoading && recentWinners.length === 0 && (
          <p className="mt-2 text-xs text-[#6b5a3a]">No winners yet.</p>
        )}
      </section> */}

      {/* In Play Section */}
      <section>
        <div className="overflow-hidden border border-[#e9dcc0] bg-white shadow-[0_18px_34px_rgba(15,23,42,0.08)]">
          <div className={titleBarClass}>
            <div className="flex items-center gap-2 text-sm text-white font-bold uppercase tracking-[0.16em]">
              <i className="fa fa-play-circle"></i>
              <span>In Play</span>
            </div>
            <span className="bg-[red] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-[#ffffff] rounded-xl">
              <i className="fa fa-plus mr-1"></i>
              Live
            </span>
          </div>
          <div>
            <div className="grid grid-cols-3 gap-2 bg-[#fff8e7] text-[10px] font-black uppercase tracking-widest text-[#674600]">
              <div className="px-3 py-2 text-center">Yesterday</div>
              <div className="bg-[#111] px-3 py-2 text-center text-[#ffd26a]">
                Today
              </div>
              <div className="px-3 py-2 text-center">Play Now</div>
            </div>
            <div>
              {gamesLoading && (
                <div className="p-2 space-y-2">
                  {[1, 2].map((item) => (
                    <div
                      key={item}
                      className="border border-[#efe1c6] bg-[#fffdfa] p-3"
                    >
                      <SkeletonBlock className="h-4 w-1/2" />
                      <SkeletonBlock className="mt-2 h-3 w-3/4" />
                      <SkeletonBlock className="mt-3 h-8 w-full" />
                    </div>
                  ))}
                </div>
              )}
              {!gamesLoading &&
                (games ?? []).map((game) => {
                  const availability = getGameAvailability(game, new Date(Date.now() + serverOffsetMs));
                  return (
                    <div
                      className="border border-[#efe1c6] bg-[#fffdfa] p-2"
                      key={game.id}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-12 w-12 items-center justify-center overflow-hidden border border-[#ead2a1] bg-[#fff2cd]">
                          <img
                            alt="icon"
                            src="/images/dic.jpg"
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h2 className="text-sm font-black uppercase tracking-[0.06em] text-[#181818]">
                              <i className="fa fa-gamepad mr-1 text-[#b88422]"></i>
                              {game.name}
                            </h2>
                            <span
                              className={`h-2.5 w-2.5 rounded-full ${availability.canPlay ? "bg-green-700 animate-pulse" : "bg-[#b91c1c]"}`}
                            ></span>
                          </div>
                          <div className="mt-2 text-[11px] font-semibold leading-5 text-[#6b5a3a]">
                            Bet Opening{" "}
                            <span className="bg-[#fff2cd] px-2 py-1 text-[#2f2410]">
                              {game.open_time?.substring(0, 5)}
                            </span>
                            <span className="mx-1"></span>
                            Bet Closing{" "}
                            <span className="bg-[#ffe4e4] px-2 py-1 text-[#6d1f1f]">
                              {game.close_time?.substring(0, 5)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 grid grid-cols-[1fr_1fr_1.2fr] gap-2">
                        <div className="bg-[#e6f3ff] p-2 text-center text-sm font-black text-[#11446b]">
                          {/* Overnight: yesterday's result is the latest if today is empty */}
                          {game.is_overnight && !game.result_number && game.yesterday_result_number
                            ? game.yesterday_result_number
                            : game.yesterday_result_number || "-"}
                        </div>
                        <div className="bg-[#ffe8ef] backdrop-blur-[1px] p-2 text-center text-sm font-black text-[#000000]">
                          {/* Show today's result if visible, else lock */}
                          {game.result_visible && game.result_number
                            ? game.result_number
                            : <LockBadge size="text-sm" />}
                        </div>
                        <div
                          className={`flex items-center justify-center px-2 text-center text-[11px] font-black uppercase tracking-widest text-white ${availability.canPlay ? "bg-green-700" : "bg-[#b91c1c]"}`}
                        >
                          {availability.canPlay ? (
                            <Link
                              href={`/game-page?id=${game.id}&name=${encodeURIComponent(game.name)}`}
                              className="inline-flex w-full items-center justify-center gap-2 text-[#ffd26a]"
                            >
                              <span>Play Now</span>
                              <img
                                src="/images/play-btn.png"
                                className="h-4 w-4 object-contain"
                                alt="Play"
                              />
                            </Link>
                          ) : (
                            <div className="inline-flex min-w-full items-center justify-center opacity-70 gap-1">
                              <i
                                className="fa fa-lock"
                                aria-hidden="true"
                              ></i>
                              <span>{availability.label}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              {!gamesLoading && (games ?? []).length === 0 && (
                <p className="py-5 text-center text-sm font-medium text-[#666]">
                  No games available.
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Chart Section */}
      <section>
        <div className="overflow-hidden border border-[#e9dcc0] bg-white shadow-[0_18px_34px_rgba(15,23,42,0.08)]">
          <div className="relative mt-2 mb-2 flex justify-center px-3">
            <h2 className="relative w-full max-w-95 bg-[linear-gradient(94deg,#b6842d,#ebda8d_55%,#b7862f)] px-[clamp(52px,16vw,112px)] py-2 text-center text-xs font-bold text-black sm:text-sm">
              {/* left angled side */}
              <span className="absolute top-0 -left-1.5 h-full w-[clamp(20px,6vw,40px)] bg-[linear-gradient(94deg,#b6842d,#ebda8d_55%,#b7862f)] skew-x-[-25deg] sm:-left-2.5"></span>
              {/* right angled side */}
              <span className="absolute top-0 -right-1.5 h-full w-[clamp(20px,6vw,40px)] bg-[linear-gradient(94deg,#b6842d,#ebda8d_55%,#b7862f)] skew-x-25 sm:-right-2.5"></span>
              <p className="relative z-10 whitespace-nowrap tracking-wide">
                 KING RECORD CHART
              </p>
            </h2>
          </div>
          <div className="flex justify-center items-center gap-1">
            <select
              className={selectClass}
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
            >
              {monthOptions.map((month) => (
                <option key={month.value} value={month.value}>
                  {month.label}
                </option>
              ))}
            </select>
            <select
              className={selectClass}
              value={selectedYear}
              onChange={(event) => setSelectedYear(event.target.value)}
            >
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
            <button
              className="bg-[#111] px-5 py-2 text-xs font-black uppercase tracking-[0.12em] text-[#ffd26a] transition hover:opacity-90"
              type="button"
              onClick={() => loadMonthlyChart(selectedYear, selectedMonth)}
              disabled={chartLoading}
            >
              Check <span className="arw">→</span>
            </button>
          </div>
          <MonthlyChart data={monthlyData} gameNames={(games ?? []).map((game) => game.name)} />
        </div>
      </section>
    </div>
  );
};

export default HomePage;