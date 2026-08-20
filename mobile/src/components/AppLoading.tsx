import { Plane } from "lucide-react";
import { Brand } from "./Brand";

export function AppLoading() {
  return (
    <main className="mobile-screen flex items-center justify-center px-6 text-white">
      <section className="w-full max-w-sm rounded-[2rem] border border-white/10 bg-white/[0.055] p-8 text-center shadow-2xl shadow-black/50 backdrop-blur-2xl">
        <div className="flex justify-center">
          <Brand />
        </div>
        <div className="mx-auto mt-10 flex h-14 w-14 items-center justify-center rounded-full border border-lime-300/30 bg-lime-300/10">
          <Plane className="mobile-loading-plane h-6 w-6 text-lime-300" aria-hidden="true" />
        </div>
        <h1 className="mt-6 text-2xl font-black">Preparing VAIVIA</h1>
        <p className="mt-2 text-sm font-semibold text-slate-400">
          Loading your saved session and latest trips…
        </p>
      </section>
    </main>
  );
}
