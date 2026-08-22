"use client";

import { useEffect, useMemo } from "react";

export default function MobileEventCheckoutReturn() {
  const callbackUrl = useMemo(() => {
    if (typeof window === "undefined") return "com.dreamhaus.vaivia://events";
    const params = new URLSearchParams(window.location.search);
    const order = params.get("order") || "";
    const result = params.get("result") === "cancelled" ? "cancelled" : "success";
    return order
      ? `com.dreamhaus.vaivia://events/checkout/${encodeURIComponent(order)}?result=${result}`
      : "com.dreamhaus.vaivia://events";
  }, []);
  useEffect(() => { window.location.assign(callbackUrl); }, [callbackUrl]);
  return <main className="grid min-h-screen place-items-center bg-[#0c0115] px-6 text-center text-white"><div><p className="text-xs font-black uppercase tracking-[0.24em] text-lime-300">VAIVIA Events</p><h1 className="mt-3 text-3xl font-black">Returning to VAIVIA</h1><p className="mt-3 text-sm font-semibold text-slate-300">The app will verify your checkout securely with VAIVIA’s server.</p><a href={callbackUrl} className="mt-6 inline-flex rounded-full bg-lime-300 px-5 py-3 text-sm font-black text-slate-950">Open VAIVIA</a></div></main>;
}
