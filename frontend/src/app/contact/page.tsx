import NavBar from "@/components/NavBar";

const CONTACT_EMAIL = "admin@dreamhub.com";

export default function ContactPage() {
  return (
    <div className="relative min-h-screen bg-slate-950 text-slate-100">
      <NavBar />

      <main className="mx-auto flex max-w-2xl flex-col items-center px-6 py-32 text-center">
        <p className="text-xs font-semibold tracking-[0.3em] text-indigo-300/70 uppercase">Contact</p>
        <h1 className="mt-6 font-serif text-3xl text-white sm:text-4xl">문의하기</h1>

        <p className="mt-8 max-w-md text-base leading-relaxed text-slate-400">
          드림허브에 대한 문의사항이나 광고/제휴 제안은 아래 이메일로 보내주세요.
        </p>

        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="mt-10 inline-flex items-center justify-center rounded-full bg-gradient-to-r from-violet-600 to-indigo-500 px-10 py-4 text-base font-semibold text-white shadow-[0_0_40px_rgba(139,92,246,0.35)] transition-transform hover:-translate-y-0.5"
        >
          ✉️ {CONTACT_EMAIL}
        </a>
      </main>
    </div>
  );
}
