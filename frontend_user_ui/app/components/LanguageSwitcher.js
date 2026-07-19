"use client";

import React, { useState } from "react";
import { useLanguage } from "../lib/LanguageContext";

export default function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);

  const options = [
    { value: "bilingual", label: "EN / हिंदी", flag: "🌐" },
    { value: "en", label: "English", flag: "🇬🇧" },
    { value: "hi", label: "हिंदी", flag: "🇮🇳" },
  ];

  const currentOption = options.find((opt) => opt.value === language);

  const handleSelect = (value) => {
    setLanguage(value);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 rounded bg-[#b88422] px-2 py-1 text-xs font-semibold text-black transition hover:bg-[#d4a035]"
        aria-label="Change language"
      >
        <span>{currentOption?.flag}</span>
        <span className="hidden sm:inline">{currentOption?.label}</span>
        <i
          className={`fa fa-chevron-down text-[10px] transition-transform ${isOpen ? "rotate-180" : ""}`}
        ></i>
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 top-full z-50 mt-1 w-32 overflow-hidden rounded border border-[#d6b774] bg-white shadow-lg">
            {options.map((option) => (
              <button
                key={option.value}
                onClick={() => handleSelect(option.value)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition hover:bg-[#fff8e7] ${
                  language === option.value
                    ? "bg-[#fff8e7] font-semibold text-[#b88422]"
                    : "text-[#333]"
                }`}
              >
                <span>{option.flag}</span>
                <span>{option.label}</span>
                {language === option.value && (
                  <i className="fa fa-check ml-auto text-[10px] text-[#b88422]"></i>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
