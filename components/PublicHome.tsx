import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Bot,
  CalendarDays,
  MapPinned,
  PiggyBank,
  PlaneTakeoff,
  Sparkles,
  UsersRound,
} from "lucide-react";

const features = [
  {
    title: "Build the whole trip",
    description:
      "Keep dates, stays, transport, ideas, and daily plans together in one clear itinerary.",
    icon: CalendarDays,
  },
  {
    title: "Plan together",
    description:
      "Invite your travel companions so everyone can contribute and stay on the same page.",
    icon: UsersRound,
  },
  {
    title: "Discover what is nearby",
    description:
      "Use the travel assistant to find useful places and turn inspiration into practical plans.",
    icon: Bot,
  },
  {
    title: "Stay on budget",
    description:
      "Organize trip budgets and expenses without separating them from the rest of your plans.",
    icon: PiggyBank,
  },
];

const sampleItinerary = [
  { day: "Friday", plan: "Check in & explore Mitte", icon: MapPinned },
  { day: "Saturday", plan: "Museum Island and dinner", icon: CalendarDays },
  { day: "Sunday", plan: "Brunch before departure", icon: PlaneTakeoff },
];

export default function PublicHome() {
  return (
    <main
      data-public-home
      className="relative min-h-[calc(100svh-4rem)] overflow-hidden bg-[#080511] text-white"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(var(--vaivia-neon-rgb),0.16),transparent_30%),radial-gradient(circle_at_86%_36%,rgba(236,72,153,0.13),transparent_28%),linear-gradient(180deg,#080511_0%,#0c0115_60%,#080511_100%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,0.24)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.24)_1px,transparent_1px)] [background-size:72px_72px]"
      />

      <div className="relative mx-auto w-full max-w-7xl px-5 pb-20 pt-5 sm:px-8 lg:px-12">
        <header className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center rounded-xl focus:outline-none focus:ring-2 focus:ring-lime-300/60"
            aria-label="VAIVIA home"
          >
            <Image
              src="/icons/vaivia-header-logo.svg"
              alt=""
              width={181}
              height={80}
              className="h-10 w-auto object-contain sm:h-16"
            />
          </Link>
          <nav className="flex items-center gap-2 sm:gap-3" aria-label="Account">
            <Link
              href="/auth/login"
              className="inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-bold text-slate-200 transition hover:bg-white/[0.07] hover:text-white focus:outline-none focus:ring-2 focus:ring-lime-300/60 sm:px-5"
            >
              Log in
            </Link>
            <Link
              href="/auth/sign-up"
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-lime-300 px-4 text-sm font-black text-slate-950 shadow-[0_0_28px_rgba(var(--vaivia-neon-rgb),0.2)] transition hover:bg-lime-200 focus:outline-none focus:ring-2 focus:ring-lime-100 focus:ring-offset-2 focus:ring-offset-[#080511] sm:px-5"
            >
              Create account
            </Link>
          </nav>
        </header>

        <section className="grid items-center gap-14 pb-24 pt-20 lg:grid-cols-[1.08fr_0.92fr] lg:gap-20 lg:pb-32 lg:pt-28">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-lime-300/20 bg-lime-300/[0.07] px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-lime-200">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Travel plans, all in one place
            </div>
            <h1 className="max-w-4xl text-balance text-5xl font-black leading-[0.95] tracking-[-0.055em] text-white sm:text-6xl lg:text-7xl xl:text-8xl">
              From trip idea to{" "}
              <span className="block text-lime-300">takeoff.</span>
            </h1>
            <p className="mt-7 max-w-2xl text-pretty text-lg leading-8 text-slate-300 sm:text-xl">
              VAIVIA is a shared travel-planning home for your itinerary,
              bookings, discoveries, and budget—built to keep the details easy
              to find and the excitement easy to share.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/auth/sign-up"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-lime-300 px-7 text-base font-black text-slate-950 shadow-[0_0_40px_rgba(var(--vaivia-neon-rgb),0.24)] transition hover:-translate-y-0.5 hover:bg-lime-200 focus:outline-none focus:ring-2 focus:ring-lime-100 focus:ring-offset-2 focus:ring-offset-[#080511]"
              >
                Start planning
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link
                href="/auth/login"
                className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/15 bg-white/[0.05] px-7 text-base font-bold text-white backdrop-blur transition hover:-translate-y-0.5 hover:border-white/30 hover:bg-white/[0.09] focus:outline-none focus:ring-2 focus:ring-white/50"
              >
                I already have an account
              </Link>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-xl" aria-hidden="true">
            <div className="absolute -inset-8 rounded-full bg-lime-300/10 blur-3xl" />
            <div className="relative rotate-1 rounded-[2rem] border border-white/10 bg-slate-950/80 p-5 shadow-2xl shadow-black/50 backdrop-blur-xl sm:p-7">
              <div className="flex items-center justify-between border-b border-white/10 pb-5">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-lime-300">
                    Your next trip
                  </p>
                  <p className="mt-1 text-2xl font-black">Berlin weekend</p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-lime-300 text-slate-950">
                  <PlaneTakeoff className="h-6 w-6" />
                </div>
              </div>
              <div className="space-y-3 py-5">
                {sampleItinerary.map(({ day, plan, icon: Icon }) => (
                  <div
                    key={day}
                    className="flex items-center gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.045] p-4"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.07] text-lime-300">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                        {day}
                      </p>
                      <p className="mt-0.5 font-bold text-slate-100">{plan}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-3 rounded-2xl border border-pink-400/20 bg-pink-400/[0.08] p-4 text-sm font-semibold text-pink-100">
                <Bot className="h-5 w-5 shrink-0 text-pink-300" />
                Ask VAIVIA what is close to your hotel.
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="features-heading">
          <div className="max-w-2xl">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-lime-300">
              Everything travels together
            </p>
            <h2
              id="features-heading"
              className="mt-3 text-balance text-3xl font-black tracking-tight sm:text-4xl"
            >
              Less tab juggling. More looking forward to the trip.
            </h2>
          </div>
          <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {features.map(({ title, description, icon: Icon }) => (
              <article
                key={title}
                className="rounded-[1.75rem] border border-white/10 bg-white/[0.045] p-6 backdrop-blur transition hover:-translate-y-1 hover:border-lime-300/25 hover:bg-white/[0.065]"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-lime-300/10 text-lime-300">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <h3 className="mt-5 text-lg font-black">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  {description}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-20 overflow-hidden rounded-[2rem] border border-lime-300/20 bg-[linear-gradient(135deg,rgba(var(--vaivia-neon-rgb),0.15),rgba(255,255,255,0.04))] px-6 py-10 text-center shadow-[0_0_70px_rgba(var(--vaivia-neon-rgb),0.08)] sm:px-10 sm:py-14">
          <h2 className="text-3xl font-black tracking-tight sm:text-4xl">
            Ready to make the plan real?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-slate-300">
            Create your VAIVIA account and bring your next adventure together.
          </p>
          <Link
            href="/auth/sign-up"
            className="mt-7 inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-lime-300 px-7 text-base font-black text-slate-950 transition hover:bg-lime-200 focus:outline-none focus:ring-2 focus:ring-lime-100 focus:ring-offset-2 focus:ring-offset-[#10081b]"
          >
            Create account
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </section>
      </div>
    </main>
  );
}
