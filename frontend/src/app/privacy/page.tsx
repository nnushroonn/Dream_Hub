import NavBar from "@/components/NavBar";

interface PolicySection {
  title: string;
  body: string;
}

const SECTIONS: PolicySection[] = [
  {
    title: "제1조 (수집하는 개인정보 항목)",
    body: `드림허브(이하 "회사")는 회원가입, 서비스 이용 과정에서 아래와 같은 개인정보를 수집합니다.

- 필수 항목: 이메일 주소, 비밀번호(암호화 저장), 닉네임
- 소셜 로그인(구글) 이용 시: 이메일 주소, 프로필 식별자
- 서비스 이용 과정에서 자동으로 생성·수집되는 정보: IP 주소, 접속 로그, 쿠키, 서비스 이용 기록, 기기 정보`,
  },
  {
    title: "제2조 (개인정보의 수집 및 이용 목적)",
    body: `회사는 수집한 개인정보를 다음의 목적을 위해 이용합니다.

- 회원 관리: 회원제 서비스 이용에 따른 본인 확인, 부정 이용 방지
- 서비스 제공: 꿈 기록·해몽·커뮤니티 등 핵심 서비스 제공 및 운영
- 서비스 개선: 신규 기능 개발, 통계 분석을 통한 서비스 품질 향상
- 고지사항 전달: 공지사항 전달, 문의 대응`,
  },
  {
    title: "제3조 (쿠키의 사용 및 맞춤형 광고)",
    body: `회사는 서비스 이용 편의 제공 및 광고 게재를 위해 쿠키(Cookie)를 사용합니다.

회사는 제3자(Google 등) 광고 파트너를 통해 맞춤형 광고를 게재할 수 있습니다. Google과 같은 광고 제공업체는 이용자의 관심사에 기반한 광고를 게재하기 위해 쿠키를 사용하여, 본 사이트 및 다른 웹사이트 방문 기록을 이용할 수 있습니다.

이용자는 Google 광고 설정(adssettings.google.com)에서 맞춤형 광고를 언제든지 거부(Opt-out)할 수 있으며, 웹 브라우저 설정을 통해 쿠키 저장을 거부할 수도 있습니다. 다만 쿠키 저장을 거부할 경우 일부 서비스 이용에 제한이 있을 수 있습니다.`,
  },
  {
    title: "제4조 (개인정보의 제3자 제공)",
    body: `회사는 원칙적으로 이용자의 개인정보를 외부에 제공하지 않습니다. 다만 다음의 경우는 예외로 합니다.

- 이용자가 사전에 동의한 경우
- 법령의 규정에 의거하거나 수사기관의 적법한 절차에 따른 요청이 있는 경우
- 맞춤형 광고 게재를 위해 Google 등 광고 파트너에게 쿠키 기반 비식별 정보가 제공되는 경우`,
  },
  {
    title: "제5조 (개인정보의 보유 및 이용기간)",
    body: `회사는 원칙적으로 개인정보 수집 및 이용 목적이 달성된 후에는 해당 정보를 지체 없이 파기합니다. 단, 관계 법령에 따라 보존할 필요가 있는 경우 회사는 관계 법령에서 정한 일정한 기간 동안 회원정보를 보관합니다.`,
  },
  {
    title: "제6조 (이용자의 권리)",
    body: `이용자는 언제든지 등록된 자신의 개인정보를 조회, 수정할 수 있으며, 회원 탈퇴를 통해 개인정보 삭제를 요청할 수 있습니다. 개인정보 관련 문의는 아래 연락처로 접수해 주시기 바랍니다.`,
  },
  {
    title: "제7조 (개인정보 보호책임자 및 문의처)",
    body: `개인정보 보호책임자: 드림허브 임시 관리자
이메일: admin@dreamhub.com

이용자는 서비스 이용 중 발생한 개인정보 관련 문의사항을 위 이메일로 접수하실 수 있으며, 회사는 접수된 문의에 대해 신속히 답변드리겠습니다.`,
  },
];

export default function PrivacyPolicyPage() {
  return (
    <div className="relative min-h-screen bg-slate-950 text-slate-100">
      <NavBar />

      <main className="mx-auto max-w-3xl px-6 py-24 sm:py-28">
        <p className="text-xs font-semibold tracking-[0.3em] text-indigo-300/70 uppercase">Privacy Policy</p>
        <h1 className="mt-4 font-serif text-3xl text-white sm:text-4xl">개인정보처리방침</h1>
        <p className="mt-4 text-sm text-slate-500">시행일자: 2026년 8월 5일</p>

        <p className="mt-8 text-base leading-relaxed text-slate-300">
          드림허브(이하 &ldquo;회사&rdquo;)는 이용자의 개인정보를 소중히 여기며, 「개인정보 보호법」 등 관련 법령을 준수합니다.
          본 개인정보처리방침은 회사가 어떤 정보를 수집하고, 어떻게 이용·보호하는지를 안내합니다.
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
