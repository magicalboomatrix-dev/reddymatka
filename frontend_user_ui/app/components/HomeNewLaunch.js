

"use client";
import React from 'react';




import { useState, useEffect, useRef } from 'react';

const slides = [
  { src: '/images/DISAWAR.png', alt: 'Launch 1' },
  { src: '/images/FARIDABAD.png', alt: 'Launch 2' },
  { src: '/images/GALI.png', alt: 'Launch 3' },
  { src: '/images/GAZIABAD.png', alt: 'Launch 4' },
  { src: '/images/DELHI BAZAR.png', alt: 'Launch 5' },
  { src: '/images/SHRI GANESH.png', alt: 'Launch 6' },
];

const SLIDES_PER_VIEW = 4;
const AUTO_PLAY_DELAY = 1500;

const HomeNewLaunch = () => {
  const [startIdx, setStartIdx] = useState(0);
  const timeoutRef = useRef(null);
  const total = slides.length;

  useEffect(() => {
    timeoutRef.current = setTimeout(() => {
      setStartIdx((prev) => (prev + 1) % total);
    }, AUTO_PLAY_DELAY);
    return () => clearTimeout(timeoutRef.current);
  }, [startIdx, total]);

  const prev = () => setStartIdx((prev) => (prev - 1 + total) % total);
  const next = () => setStartIdx((prev) => (prev + 1) % total);

  // Get the visible slides, wrapping around
  const visibleSlides = [];
  for (let i = 0; i < SLIDES_PER_VIEW; i++) {
    visibleSlides.push(slides[(startIdx + i) % total]);
  }

  return (
    <div className="mx-auto w-full max-w-[430px] ">
      <div className="overflow-hidden bg-white ">
        <div>
          <div className="relative mt-0.5 flex justify-center px-3">

        <h2 className="relative w-full max-w-[380px] bg-[linear-gradient(94deg,#b6842d,#ebda8d_55%,#b7862f)] px-[clamp(52px,16vw,112px)] py-2 text-center text-xs font-bold text-black sm:text-sm">

    {/* left angled side */}
    <span className="absolute top-0 -left-[6px] h-full w-[clamp(20px,6vw,40px)] bg-[linear-gradient(94deg,#b6842d,#ebda8d_55%,#b7862f)] skew-x-[-25deg] sm:-left-[10px]"></span>

    {/* right angled side */}
    <span className="absolute top-0 -right-[6px] h-full w-[clamp(20px,6vw,40px)] bg-[linear-gradient(94deg,#b6842d,#ebda8d_55%,#b7862f)] skew-x-[25deg] sm:-right-[10px]"></span>

    <p className="relative z-10 whitespace-nowrap tracking-wide">
      PLAY NOW
    </p>

  </h2>

</div>
          <div className="relative flex items-center">
            <div className="flex w-full">
              {visibleSlides.map((slide, idx) => (
                <img
                  key={slide.src}
                  src={slide.src}
                  alt={slide.alt}
                  className="block w-full h-[150px] max-w-[120px] object-cover p-0.25 transition-opacity duration-700"
                  style={{ opacity: 1 }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default HomeNewLaunch



