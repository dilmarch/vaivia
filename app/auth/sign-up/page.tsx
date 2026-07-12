import { SignUpForm } from "@/components/sign-up-form";

export default function Page() {
  return (
    <main className="flex min-h-svh w-full items-center justify-center bg-[#080511] px-4 py-10 text-white md:px-8">
      <div className="w-full max-w-3xl">
        <div className="mb-8 text-center">
          <p className="text-4xl font-black uppercase tracking-[0.22em] text-lime-200 sm:text-5xl">
            VAIVIA
          </p>
        </div>
        <SignUpForm />
      </div>
    </main>
  );
}
