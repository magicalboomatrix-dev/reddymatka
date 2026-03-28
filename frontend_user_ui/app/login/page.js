"use client";
import React from "react";
import Link from "next/link";

const LoginPage = () => {
  return (
    <div className="mx-auto min-h-screen w-full max-w-[430px]">
      <div className="px-3 pt-3">
        <Link href="/">
          <img src="/images/back-btn.png" className="h-5 w-5" alt="Back" />
        </Link>
      </div>
      <main className="flex min-h-[calc(100vh-52px)] items-center justify-center px-4">
        <div className="w-full max-w-105 bg-white px-4 py-6 ">
          <div>
            <section>
              <div className="text-center">
                <img
                  src="/images/loginimg.png"
                  className="mx-auto w-4/5"
                  alt="Login Illustration"
                />
              </div>
            </section>
            <section>
              <h1 className="text-center text-[22px] font-black text-[#111]">
                <b>Welcome to REDDYMATKA </b>
              </h1>
              <p className="pb-2.5 text-center text-[#444]">
                Login to REDDYMATKA  and unlock exciting  matka <br /> games
                instant results and real winning opportunities.
              </p>

              <Link href="/login-account">
                <div className="inline-block w-full bg-[#1d1c20] px-4 py-3 text-center text-sm font-semibold text-white">
                  Login
                </div>
              </Link>

              <p className="mt-2 text-center text-[13px] font-medium text-[#ff0036]">
                First-time login uses OTP. After that, login with your MPIN.
              </p>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
};

export default LoginPage;
