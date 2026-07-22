"""메인 홈: 히어로 섹션 / 실시간 트렌드 키워드 / 오늘의 베스트 꿈 추천 (더미 데이터) / 달 위상 위젯."""

import calendar as calendar_module
import math
from datetime import date, datetime, time, timedelta, timezone

import ephem
from fastapi import APIRouter

router = APIRouter(prefix="/api/home", tags=["home"])

KST = timezone(timedelta(hours=9))

# 8가지 위상별 상세 운세 데이터 (phase_name으로 조회).
_PHASE_DETAILS = {
    "신월": {
        "is_waxing": True,
        "message": "모든 것이 씨앗처럼 잠재된 밤, 새로운 의도를 마음에 심어보세요.",
        "summary": "고요한 시작의 밤",
        "description": (
            "신월의 밤하늘은 달빛조차 스스로를 감춘 채 가장 짙은 어둠을 드리웁니다. "
            "하지만 그 어둠은 텅 빈 것이 아니라, 다음 달이 차오르기 전 모든 가능성을 품은 여백입니다. "
            "오늘 꾸는 꿈은 앞으로 한 달간 당신을 이끌 무의식의 씨앗이 될 수 있어요."
        ),
        "lucky_item": "새 노트",
        "lucky_item_emoji": "📓",
        "lucky_color": "미드나잇 블랙",
        "lucky_color_hex": "#12131A",
        "lucky_item_reason": (
            "빛이 없는 신월의 백지 같은 상태처럼, 아직 쓰이지 않은 새 노트는 오늘 마음에 심을 "
            "의도를 오롯이 담아낼 수 있는 아이템입니다."
        ),
        "lucky_color_reason": (
            "가장 깊은 어둠을 상징하는 색으로, 색채 심리학적으로 외부 자극을 차단하고 "
            "내면에 오롯이 집중하게 돕는 보호색입니다."
        ),
    },
    "초승달": {
        "is_waxing": True,
        "message": "새로운 시작의 기운이 차오르는 밤입니다.",
        "summary": "설렘이 움트는 밤",
        "description": (
            "가느다란 초승달처럼, 아직은 여리지만 분명한 기운이 마음 한켠에서 자라나고 있습니다. "
            "작은 결심 하나가 꿈속에서 커다란 상징으로 나타날 수 있는 시기이니, "
            "오늘 밤 떠오르는 이미지들을 눈여겨봐 주세요."
        ),
        "lucky_item": "은색 팔찌",
        "lucky_item_emoji": "📿",
        "lucky_color": "라이트 실버",
        "lucky_color_hex": "#D6D9DE",
        "lucky_item_reason": (
            "가느다랗게 빛나기 시작하는 초승달의 실루엣처럼, 은은한 광택의 팔찌는 이제 막 움트는 "
            "기운을 몸에 지니고 다니게 해주는 아이템입니다."
        ),
        "lucky_color_reason": (
            "달빛의 초기 반사광을 닮은 색으로, 색채 심리학적으로 여린 확신과 설렘을 "
            "은은하게 북돋아주는 색입니다."
        ),
    },
    "상현달": {
        "is_waxing": True,
        "message": "결심이 형태를 갖추는 밤, 선명한 꿈을 기대해도 좋아요.",
        "summary": "균형이 잡히는 밤",
        "description": (
            "반으로 나뉜 달처럼, 빛과 그림자가 균형을 이루는 시기입니다. "
            "망설임과 확신이 팽팽히 마주하는 지금, 꿈속에서 마주하는 갈림길은 "
            "현실의 선택에 힌트를 줄지도 몰라요."
        ),
        "lucky_item": "손목시계",
        "lucky_item_emoji": "⌚",
        "lucky_color": "딥 인디고",
        "lucky_color_hex": "#312E81",
        "lucky_item_reason": (
            "빛과 그림자가 균형을 이루는 상현달의 성질에 맞춰, 현실의 결단력과 정확한 타이밍을 "
            "조율해 주는 아이템입니다."
        ),
        "lucky_color_reason": (
            "밤하늘의 경계에서 직관을 증폭시키는 파장으로, 색채 심리학적으로 내면의 중심을 "
            "잡아주는 보호색입니다."
        ),
    },
    "차오르는 달": {
        "is_waxing": True,
        "message": "무의식의 빛이 점점 밝아지고 있어요.",
        "summary": "확신이 밝아지는 밤",
        "description": (
            "보름을 향해 차오르는 달빛만큼, 그동안 품어온 생각들이 점점 또렷해지는 시기입니다. "
            "꿈속 장면들도 유난히 생생하고 색채가 짙게 느껴질 수 있어요. "
            "그 디테일 하나하나가 지금 당신에게 필요한 답일 수 있습니다."
        ),
        "lucky_item": "황금빛 펜던트",
        "lucky_item_emoji": "💎",
        "lucky_color": "앰버 골드",
        "lucky_color_hex": "#D97706",
        "lucky_item_reason": (
            "보름을 향해 점점 차오르는 달빛의 강도처럼, 황금빛으로 빛나는 펜던트는 커져가는 "
            "확신과 에너지를 몸에 걸치게 해주는 아이템입니다."
        ),
        "lucky_color_reason": (
            "차오르는 달빛의 따뜻한 색조를 닮은 색으로, 색채 심리학적으로 자신감과 추진력을 "
            "북돋아주는 색입니다."
        ),
    },
    "보름달": {
        "is_waxing": False,
        "message": "보름달의 에너지가 무의식을 밝히는 날입니다.",
        "summary": "무의식이 만개하는 밤",
        "description": (
            "일 년 중 달이 가장 밝게 차오르는 순간, 무의식의 문도 가장 활짝 열립니다. "
            "전 세계적으로 생생몽과 자각몽 보고가 늘어나는 시기이기도 해요. "
            "오늘 밤 꿈은 유난히 선명하고, 그 안에 담긴 메시지도 힘이 셀 가능성이 높습니다."
        ),
        "lucky_item": "문스톤 반지",
        "lucky_item_emoji": "💍",
        "lucky_color": "펄 화이트",
        "lucky_color_hex": "#F4F1EA",
        "lucky_item_reason": (
            "가장 밝게 차오른 보름달의 에너지를 그대로 품은 문스톤은, 무의식이 활짝 열리는 오늘 "
            "직관을 증폭시켜주는 아이템입니다."
        ),
        "lucky_color_reason": (
            "보름달 그 자체의 은은한 광채를 담은 색으로, 색채 심리학적으로 감정의 절정을 "
            "부드럽게 감싸주는 색입니다."
        ),
    },
    "기우는 달": {
        "is_waxing": False,
        "message": "감정이 차분히 가라앉으며 깊은 통찰을 주는 밤입니다.",
        "summary": "통찰이 깊어지는 밤",
        "description": (
            "보름의 절정을 지나 서서히 기울어가는 달빛처럼, 감정의 파고도 잔잔해지는 시기입니다. "
            "격했던 마음이 가라앉으며 비로소 보이는 것들이 있어요. "
            "꿈에서 얻은 통찰을 조용히 곱씹어보기 좋은 밤입니다."
        ),
        "lucky_item": "라벤더 향초",
        "lucky_item_emoji": "🕯️",
        "lucky_color": "세이지 그린",
        "lucky_color_hex": "#87A96B",
        "lucky_item_reason": (
            "보름의 절정을 지나 잔잔해지는 달빛처럼, 라벤더 향은 격했던 감정을 가라앉히고 "
            "차분한 통찰로 이끄는 아이템입니다."
        ),
        "lucky_color_reason": (
            "안정과 회복을 상징하는 색으로, 색채 심리학적으로 들뜬 마음을 가라앉히고 "
            "균형 감각을 되찾아주는 색입니다."
        ),
    },
    "하현달": {
        "is_waxing": False,
        "message": "지나간 일을 정리하고 놓아주기 좋은 밤입니다.",
        "summary": "정리와 이완의 밤",
        "description": (
            "다시 반으로 나뉜 달빛 아래, 붙잡고 있던 것들을 하나씩 내려놓기 좋은 시기입니다. "
            "꿈속에서 무언가를 떠나보내거나 정리하는 장면을 마주한다면, "
            "그건 마음이 스스로 정돈을 시작했다는 신호일 수 있어요."
        ),
        "lucky_item": "낡은 편지",
        "lucky_item_emoji": "✉️",
        "lucky_color": "더스티 로즈",
        "lucky_color_hex": "#C08081",
        "lucky_item_reason": (
            "다시 반으로 저물어가는 하현달의 성질에 맞춰, 오래된 편지는 지나간 마음을 정리하고 "
            "놓아보내는 의식에 어울리는 아이템입니다."
        ),
        "lucky_color_reason": (
            "바랜 듯 부드러운 색조로, 색채 심리학적으로 미련 없이 흘려보내는 이완의 감정을 "
            "담아내는 색입니다."
        ),
    },
    "그믐달": {
        "is_waxing": False,
        "message": "깊은 내면을 들여다보기 좋은 고요한 밤입니다.",
        "summary": "내면을 응시하는 밤",
        "description": (
            "다음 신월을 앞두고 가장 가늘어진 달빛처럼, 바깥보다 안쪽을 향하기 좋은 시기입니다. "
            "화려하지 않아도 깊은 꿈들이 찾아올 수 있어요. "
            "오늘 밤은 스스로에게 조용히 질문을 건네보세요."
        ),
        "lucky_item": "무광 원석",
        "lucky_item_emoji": "🪨",
        "lucky_color": "차콜 그레이",
        "lucky_color_hex": "#36454F",
        "lucky_item_reason": (
            "다음 신월을 앞두고 가장 가늘어진 그믐달처럼, 광택 없는 원석은 화려함 대신 "
            "단단한 내면에 집중하게 해주는 아이템입니다."
        ),
        "lucky_color_reason": (
            "빛을 억제한 무채색으로, 색채 심리학적으로 바깥의 자극을 줄이고 자기 응시를 "
            "돕는 색입니다."
        ),
    },
}

# ephem이 반환하는 4대 위상(삭/상현/망/하현) 이벤트 조회 함수와 그 이름 매핑.
_HARD_PHASE_GETTERS = [
    (ephem.previous_new_moon, "신월"),
    (ephem.next_new_moon, "신월"),
    (ephem.previous_first_quarter_moon, "상현달"),
    (ephem.next_first_quarter_moon, "상현달"),
    (ephem.previous_full_moon, "보름달"),
    (ephem.next_full_moon, "보름달"),
    (ephem.previous_last_quarter_moon, "하현달"),
    (ephem.next_last_quarter_moon, "하현달"),
]


def _ephem_to_utc(ephem_date: ephem.Date) -> datetime:
    return ephem_date.datetime().replace(tzinfo=timezone.utc)


def _determine_phase_name(obs_date: ephem.Date, today_kst: date) -> str:
    """오늘(KST) 하루 안에 4대 위상(신월/상현/보름/하현) 이벤트가 포함되면 그 이름을 그대로 쓰고,
    아니라면 신월->보름달 사이 진행률로 초승달/차오르는 달/기우는 달/그믐달 중 하나를 정한다.

    날짜를 기준으로(시각이 아니라) 오늘 하루 전체에 동일한 위상명을 부여해야
    시간이 지나도 같은 날 안에서 위상 표시가 바뀌지 않는다.
    """
    for getter, name in _HARD_PHASE_GETTERS:
        event_utc = _ephem_to_utc(getter(obs_date))
        if event_utc.astimezone(KST).date() == today_kst:
            return name

    prev_new = ephem.previous_new_moon(obs_date)
    next_new = ephem.next_new_moon(obs_date)
    fraction = (obs_date - prev_new) / (next_new - prev_new)

    if fraction < 0.25:
        return "초승달"
    if fraction < 0.5:
        return "차오르는 달"
    if fraction < 0.75:
        return "기우는 달"
    return "그믐달"


def calculate_moon_phase(now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    now_kst = now.astimezone(KST)
    today_kst = now_kst.date()

    # 하루 동안 위상/조명률이 흔들리지 않도록, 그날 KST 정오를 기준 관측 시각으로 고정한다.
    noon_kst = datetime.combine(today_kst, time(12, 0), tzinfo=KST)
    obs_date = ephem.Date(noon_kst)

    illumination = ephem.Moon(obs_date).phase  # ephem이 계산하는 실제 조명률(%), 0~100
    phase_name = _determine_phase_name(obs_date, today_kst)
    phase = _PHASE_DETAILS[phase_name]

    # 조명률이 높을수록(보름달에 가까울수록) 길몽 확률도 높아지도록 설계.
    luck_percent = round(30 + illumination * 0.65)

    return {
        "date": today_kst.isoformat(),
        "phase_name": phase_name,
        "is_waxing": phase["is_waxing"],
        "illumination": round(illumination, 1),
        "luck_percent": luck_percent,
        "message": phase["message"],
        "summary": phase["summary"],
        "description": phase["description"],
        "lucky_item": phase["lucky_item"],
        "lucky_item_emoji": phase["lucky_item_emoji"],
        "lucky_color": phase["lucky_color"],
        "lucky_color_hex": phase["lucky_color_hex"],
        "lucky_item_reason": phase["lucky_item_reason"],
        "lucky_color_reason": phase["lucky_color_reason"],
    }


@router.get("/moon-phase")
def get_moon_phase():
    return calculate_moon_phase()


@router.get("/trends")
def get_trends():
    return {
        "trends": [
            {"keyword": "하늘을_나는_꿈", "count": 128, "emoji": "🕊️"},
            {"keyword": "이빨이_빠지는_꿈", "count": 97, "emoji": "🦷"},
            {"keyword": "물에_빠지는_꿈", "count": 64, "emoji": "🌊"},
            {"keyword": "누군가에게_쫓기는_꿈", "count": 51, "emoji": "🏃"},
            {"keyword": "돌아가신_분을_만나는_꿈", "count": 40, "emoji": "🕯️"},
        ]
    }


@router.get("/best-dreams")
def get_best_dreams():
    return {
        "dreams": [
            {
                "id": 1,
                "title": "별빛 바다를 헤엄치는 꿈",
                "content": "밤하늘을 날아 별들 사이를 헤엄치는 꿈을 꿨어요. 몸이 깃털처럼 가벼워서 자유로운 기분이었어요.",
                "emotion": "😊",
                "empathy_count": 342,
                "author": "몽유별",
            },
            {
                "id": 2,
                "title": "이빨이 우수수 빠지는 꿈",
                "content": "거울을 보는데 이빨이 하나둘 빠지기 시작했어요. 너무 생생해서 깨고 나서도 한참 입을 만졌어요.",
                "emotion": "😨",
                "empathy_count": 218,
                "author": "밤그림자",
            },
            {
                "id": 3,
                "title": "돌아가신 할머니를 만난 꿈",
                "content": "따뜻한 부엌에서 할머니가 밥을 차려주고 계셨어요. 오랜만에 느낀 포근함에 눈물이 났어요.",
                "emotion": "😢",
                "empathy_count": 401,
                "author": "새벽공기",
            },
            {
                "id": 4,
                "title": "끝없이 쫓기던 꿈",
                "content": "누군가에게 쫓기는데 다리가 마음처럼 움직이지 않았어요. 골목을 몇 번이나 꺾어 도망쳤어요.",
                "emotion": "😱",
                "empathy_count": 156,
                "author": "구름걸음",
            },
        ]
    }


@router.get("/live-ticker")
def get_live_ticker():
    """실시간 꿈 매칭 티커: 방금 누군가 어떤 꿈을 기록했는지 보여주는 더미 활동 피드.

    서비스의 몽환적인 세계관을 지키기 위해 현실 지역명은 노출하지 않고 꿈 키워드만 전달한다.
    """
    return {
        "entries": [
            {"keyword": "하늘을 나는 꿈"},
            {"keyword": "이빨이 빠지는 꿈"},
            {"keyword": "물에 빠지는 꿈"},
            {"keyword": "누군가에게 쫓기는 꿈"},
            {"keyword": "돌아가신 분을 만나는 꿈"},
            {"keyword": "시험 보는 꿈"},
            {"keyword": "길을 잃는 꿈"},
            {"keyword": "돈을 줍는 꿈"},
        ]
    }


_EXPLORER_BASE_COUNT = 3421


@router.get("/explorer-count")
def get_explorer_count():
    """무의식 탐험가 실시간 카운터: 폴링할 때마다 자연스럽게 흔들리는 더미 라이브 인원수."""
    t = datetime.now(timezone.utc).timestamp()
    wave = int(180 * math.sin(t / 45) + 60 * math.sin(t / 11))
    return {"count": max(0, _EXPLORER_BASE_COUNT + wave)}


# 나의 지난밤 꿈 캘린더 미니 위젯용 더미 기록 (day -> (기분, 한 줄 요약).
_DREAM_CALENDAR_ENTRIES: dict[int, tuple[str, str]] = {
    3: ("good", "구름 위를 사뿐히 걷던, 유난히 몸이 가벼운 꿈"),
    6: ("neutral", "낯선 골목을 하염없이 걷기만 하던 꿈"),
    9: ("nightmare", "누군가에게 쫓기며 계속 넘어지던 꿈"),
    12: ("good", "오래된 친구와 바닷가에서 재회한 꿈"),
    15: ("neutral", "시험지를 앞에 두고 멍하니 앉아있던 꿈"),
    18: ("nightmare", "이가 후두둑 빠지는 꿈"),
    20: ("good", "하늘을 나는 듯 자유로웠던 꿈"),
}


@router.get("/dream-calendar")
def get_dream_calendar():
    """나의 지난밤 꿈 캘린더 미니 위젯: 이번 달 날짜별 꿈 기록(더미 데이터).

    mood는 good(길몽)/neutral(일반)/nightmare(악몽) 중 하나이며, 기록이 없는 날짜는 목록에서 생략한다.
    """
    today = datetime.now(KST).date()
    year, month = today.year, today.month
    days_in_month = calendar_module.monthrange(year, month)[1]

    days = [
        {"date": date(year, month, day).isoformat(), "mood": mood, "summary": summary}
        for day, (mood, summary) in _DREAM_CALENDAR_ENTRIES.items()
        if day <= days_in_month
    ]

    return {
        "month": f"{year:04d}-{month:02d}",
        "days_in_month": days_in_month,
        "days": days,
    }
