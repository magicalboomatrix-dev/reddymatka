"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { getText, getBilingualText } from "./translations";

const LanguageContext = createContext(undefined);

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState("en"); // 'en', 'hi'

  // Load saved language preference from localStorage on mount
  useEffect(() => {
    const savedLang = localStorage.getItem("reddymatka-language");
    if (savedLang === "bilingual") {
      // Migrate old bilingual setting to English
      setLanguage("en");
    } else if (savedLang && ["en", "hi"].includes(savedLang)) {
      setLanguage(savedLang);
    }
  }, []);

  // Save language preference when it changes
  useEffect(() => {
    localStorage.setItem("reddymatka-language", language);
    // Update html lang attribute
    if (typeof document !== "undefined") {
      const langMap = { en: "en", hi: "hi", bilingual: "en" };
      document.documentElement.lang = langMap[language] || "en";
    }
  }, [language]);

  const setLang = useCallback((lang) => {
    if (["en", "hi"].includes(lang)) {
      setLanguage(lang);
    }
  }, []);

  // Translation helper
  const t = useCallback(
    (translationObj) => {
      if (!translationObj) return "";
      if (typeof translationObj === "string") return translationObj;
      return getText(translationObj, language);
    },
    [language]
  );

  // Get bilingual text regardless of current setting
  const tBoth = useCallback((translationObj) => {
    if (!translationObj) return "";
    if (typeof translationObj === "string") return translationObj;
    return getBilingualText(translationObj);
  }, []);

  const value = {
    language,
    setLanguage: setLang,
    t,
    tBoth,
    isBilingual: language === "bilingual",
    isEnglish: language === "en",
    isHindi: language === "hi",
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}

// Hook for components that only need the translation function
export function useTranslation() {
  const { t, tBoth, language } = useLanguage();
  return { t, tBoth, language };
}
