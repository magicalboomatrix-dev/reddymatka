"use client";

const slides = [{ src: "/images/banner-img2.jpg", alt: "Banner 1" }];

const HomeHeroBanner = () => {
  return (
    <div className="w-full">
      <div className="relative">
        <div className="relative w-full">
          <img
            src={slides[0].src}
            alt={slides[0].alt}
            className="w-full object-contain"
          />
        </div>
      </div>
    </div>
  );
};

export default HomeHeroBanner;