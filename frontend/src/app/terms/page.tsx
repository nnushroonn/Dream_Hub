import NavBar from "@/components/NavBar";

interface PolicySection {
  title: string;
  body: string;
}

const SECTIONS: PolicySection[] = [
  {
    title: "제1조 (목적)",
    body: `본 약관은 드림허브(이하 "회사")가 제공하는 꿈 기록·해몽·커뮤니티 서비스(이하 "서비스")의 이용과 관련하여, 회사와 이용자 간의 권리·의무 및 책임사항, 기타 필요한 사항을 규정함을 목적으로 합니다.`,
  },
  {
    title: "제2조 (정의)",
    body: `1. "서비스"란 회사가 제공하는 꿈 기록소, AI 해몽, 꿈해몽 사전, 커뮤니티 등 일체의 서비스를 의미합니다.
2. "이용자"란 본 약관에 따라 회사가 제공하는 서비스를 이용하는 회원 및 비회원을 말합니다.
3. "게시물"이란 이용자가 서비스를 이용함에 있어 서비스에 게시한 문자, 이미지 등의 정보를 의미합니다.`,
  },
  {
    title: "제3조 (이용계약의 성립)",
    body: `이용계약은 이용자가 본 약관에 동의하고 회원가입을 신청한 뒤, 회사가 이를 승낙함으로써 성립합니다. 회사는 다음 각 호에 해당하는 신청에 대해서는 승낙을 하지 않거나 사후에 이용계약을 해지할 수 있습니다.

- 타인의 명의를 이용한 경우
- 허위 정보를 기재한 경우
- 기타 회사가 정한 이용 신청 요건을 충족하지 못한 경우`,
  },
  {
    title: "제4조 (게시물의 저작권)",
    body: `이용자가 서비스 내에 작성한 게시물의 저작권은 해당 게시물을 작성한 이용자 본인에게 귀속됩니다.

다만 이용자는 본인의 게시물을 서비스 내에 게시함으로써, 회사가 서비스의 운영·홍보·개선을 위해 해당 게시물을 서비스 내에서 노출, 편집(단순 편집에 한함), 복제할 수 있는 권리를 회사에 부여하는 것에 동의합니다. 회사는 이용자의 별도 동의 없이 게시물을 서비스 외부의 상업적 목적으로 이용하지 않습니다.`,
  },
  {
    title: "제5조 (이용자의 의무 및 금지행위)",
    body: `이용자는 서비스 이용과 관련하여 다음 각 호의 행위를 하여서는 안 됩니다.

- 타인의 개인정보를 도용하거나 허위 정보를 등록하는 행위
- 타인을 비방하거나 명예를 훼손하는 게시물을 등록하는 행위
- 음란물, 폭력적이거나 혐오스러운 콘텐츠를 게시하는 행위
- 회사의 서비스 운영을 방해하거나 시스템에 무단으로 접근하는 행위
- 상업적 목적의 스팸, 광고성 게시물을 무단으로 게시하는 행위
- 기타 관계 법령에 위반되는 행위`,
  },
  {
    title: "제6조 (부적절한 이용자에 대한 제재)",
    body: `회사는 이용자가 제5조의 금지행위를 하거나 다른 이용자로부터 신고가 접수되어 운영정책에 위반된다고 판단되는 경우, 사전 통지 없이 다음과 같은 조치를 취할 수 있습니다.

- 해당 게시물의 삭제 또는 노출 제한
- 이용자에 대한 경고, 서비스 이용 제한(일부 또는 전체)
- 반복적이거나 중대한 위반의 경우 회원 자격의 영구 정지 및 이용계약 해지

이용자는 자신에게 취해진 제재 조치에 대해 회사가 정한 절차에 따라 이의를 제기할 수 있습니다.`,
  },
  {
    title: "제7조 (서비스의 변경 및 중단)",
    body: `회사는 운영상, 기술상의 필요에 따라 제공하고 있는 서비스의 전부 또는 일부를 변경하거나 중단할 수 있으며, 이 경우 사전에 공지사항을 통해 이용자에게 안내합니다.`,
  },
  {
    title: "제8조 (면책조항)",
    body: `회사는 서비스에서 제공하는 AI 꿈 해몽 결과가 의학적·심리학적 진단이나 처방을 대신할 수 없음을 명시합니다. 해몽 결과는 참고 목적의 콘텐츠이며, 이용자의 결정에 대한 법적 책임을 지지 않습니다.

회사는 천재지변, 시스템 장애 등 회사의 귀책사유가 없는 사유로 서비스를 제공할 수 없는 경우 책임이 면제됩니다.`,
  },
  {
    title: "제9조 (준거법 및 관할)",
    body: `본 약관과 관련하여 회사와 이용자 간에 발생한 분쟁에 대해서는 대한민국 법을 준거법으로 하며, 관할 법원은 민사소송법상의 관할 법원으로 합니다.`,
  },
];

export default function TermsPage() {
  return (
    <div className="relative min-h-screen bg-slate-950 text-slate-100">
      <NavBar />

      <main className="mx-auto max-w-3xl px-6 py-24 sm:py-28">
        <p className="text-xs font-semibold tracking-[0.3em] text-indigo-300/70 uppercase">Terms of Service</p>
        <h1 className="mt-4 font-serif text-3xl text-white sm:text-4xl">이용약관</h1>
        <p className="mt-4 text-sm text-slate-500">시행일자: 2026년 8월 5일</p>

        <p className="mt-8 text-base leading-relaxed text-slate-300">
          드림허브 서비스를 이용해 주셔서 감사합니다. 본 약관은 서비스 이용에 관한 회사와 이용자의 권리, 의무 및
          책임사항을 안내합니다. 서비스를 이용하시기 전 아래 내용을 확인해 주세요.
        </p>

        <div className="mt-14 space-y-12">
          {SECTIONS.map((section) => (
            <section key={section.title}>
              <h2 className="text-lg font-semibold text-white">{section.title}</h2>
              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-400">{section.body}</p>
            </section>
          ))}
        </div>

        <p className="mt-16 border-t border-white/10 pt-6 text-xs leading-relaxed text-slate-400">
          ※ 본 페이지는 서비스 준비 단계의 표준 양식이며, 실제 사업자 정보 확정 및 법률 검토 후 갱신될 예정입니다.
        </p>
      </main>
    </div>
  );
}
