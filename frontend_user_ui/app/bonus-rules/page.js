"use client";
import Head from "next/head";
import React from "react";
import Header from "../components/Header";

const rules = [
  "Bonus is credited on first deposit only.",
  "Bonus cannot be withdrawn directly; it must be wagered as per site policy.",
  "Abuse of bonus offers may result in forfeiture.",
  "The company reserves the right to change rules at any time.",

];

export default function BonusRulesPage() {
  return (
    <>
    <Header/>
     <div className="max-w-107.5 mx-auto p-4 bg-white min-h-screen text-[#171717]">
      <h1 className="mb-4 text-2xl font-bold text-[#b88422]">Bonus Rules</h1>
      <ul className="list-disc pl-6 space-y-2">
        {rules.map((rule, idx) => (
          <li key={idx} className="text-base">{rule}</li>
        ))}
      </ul>
    </div>
    </>
   
  );
}
