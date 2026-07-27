"""메인 홈: 히어로 섹션 / 오늘의 베스트 꿈 추천 (더미 데이터) / 달 위상 위젯.

실시간 트렌드 키워드는 routers/trends.py가 실제 DB 데이터로 별도 제공한다."""

import hashlib
import math
from datetime import date, datetime, time, timedelta, timezone

import ephem
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from database import get_db
from models import DreamEntry, DreamStatus

router = APIRouter(prefix="/api/home", tags=["home"])

KST = timezone(timedelta(hours=9))

# 8가지 위상별 무드/설명 (phase_name으로 조회). 실제 달의 위상은 며칠씩 이어지므로,
# 이 자리에는 "그 며칠 동안 계속 같아도 자연스러운" 무드 텍스트만 남긴다 - 매일 달라져야 하는
# 행운의 아이템/색상은 아래 LUCKY_ITEM_POOL/LUCKY_COLOR_POOL에서 날짜를 시드로 별도로 뽑는다.
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
    },
}

# 행운의 아이템 풀: 판타지 소품 대신 오늘 당장 곁에 있을 법한 일상적인 물건들.
LUCKY_ITEM_POOL = [
    {
        "name": "무선 이어폰",
        "icon": "🎧",
        "description": "오늘의 소음을 차단하고 당신만의 무의식 리듬에 집중하게 도와줄 아이템입니다.",
    },
    {
        "name": "아이스 아메리카노",
        "icon": "☕",
        "description": "흐릿한 아침 무의식의 안개를 시원하게 깨워줄 오늘의 부스터입니다.",
    },
    {
        "name": "새로 꺼낸 양말",
        "icon": "🧦",
        "description": "오늘 발걸음 닿는 곳마다 긍정적인 현실의 에너지를 채워줄 산뜻한 시작점입니다.",
    },
    {
        "name": "항상 쓰는 텀블러",
        "icon": "🥤",
        "description": "지치기 쉬운 일상 속에서 맑은 정신과 에너지를 지속적으로 채워줄 그릇입니다.",
    },
    {
        "name": "접이식 우산",
        "icon": "☂️",
        "description": "예상치 못한 감정의 소나기가 쏟아져도 당신을 담담하게 지켜줄 오늘의 보호막입니다.",
    },
    {
        "name": "포스트잇",
        "icon": "📝",
        "description": "머릿속을 스쳐가는 무의식의 조각을 놓치지 않고 붙잡아 둘 작은 도구입니다.",
    },
    {
        "name": "핸드크림",
        "icon": "🧴",
        "description": "하루 종일 분주했던 손끝에, 스스로를 다정하게 매만지는 여유를 더해줄 아이템입니다.",
    },
    {
        "name": "손목시계",
        "icon": "⌚",
        "description": "무의식이 흘려보내는 신호를 놓치지 않도록, 오늘 하루의 리듬을 붙잡아 줄 아이템입니다.",
    },
    {
        "name": "무릎담요",
        "icon": "🧣",
        "description": "쌀쌀한 하루의 틈새마다 몸과 마음을 부드럽게 감싸줄 포근한 보호막입니다.",
    },
    {
        "name": "립밤",
        "icon": "💄",
        "description": "말수가 적어지기 쉬운 하루, 스스로를 다독이는 작은 보습의 순간을 선물해 줄 아이템입니다.",
    },
    {
        "name": "즐겨 신는 운동화",
        "icon": "👟",
        "description": "무거워지기 쉬운 무의식의 발걸음에 가벼운 추진력을 더해줄 오늘의 동반자입니다.",
    },
    {
        "name": "작은 노트",
        "icon": "📓",
        "description": "쌓여만 가는 무의식의 잔상을 정리하고 스스로를 되짚어볼 여유를 만들어줄 아이템입니다.",
    },
    {
        "name": "즐겨 쓰는 볼펜",
        "icon": "🖊️",
        "description": "생각이 손끝에서 흩어지기 전에, 오늘의 무의식을 붙잡아 기록하게 해줄 도구입니다.",
    },
    {
        "name": "향초",
        "icon": "🕯️",
        "description": "하루의 끝, 은은한 향으로 지친 무의식을 다독이며 편안한 휴식을 이끌어줄 아이템입니다.",
    },
    {
        "name": "충전기 케이블",
        "icon": "🔌",
        "description": "방전되기 쉬운 오늘의 에너지를, 잠깐의 멈춤으로 다시 채워줄 연결선입니다.",
    },
]

# 행운의 색상 풀: 기존 8가지 색상을 그대로 살리되, 특정 달의 위상에 고정되지 않도록
# 설명 문구에서 "보름달" 같은 실시간 위상 표현은 걷어내고 색 자체의 인상만 남겼다.
LUCKY_COLOR_POOL = [
    {
        "name": "미드나잇 블랙",
        "hex": "#12131A",
        "description": "가장 깊은 어둠을 상징하는 색으로, 색채 심리학적으로 외부 자극을 차단하고 내면에 오롯이 집중하게 돕는 보호색입니다.",
    },
    {
        "name": "라이트 실버",
        "hex": "#D6D9DE",
        "description": "은은한 달빛을 닮은 색으로, 색채 심리학적으로 여린 확신과 설렘을 북돋아주는 색입니다.",
    },
    {
        "name": "딥 인디고",
        "hex": "#312E81",
        "description": "밤하늘의 경계를 닮은 파장으로, 색채 심리학적으로 직관을 증폭시키고 내면의 중심을 잡아주는 보호색입니다.",
    },
    {
        "name": "앰버 골드",
        "hex": "#D97706",
        "description": "따뜻하게 차오르는 색조로, 색채 심리학적으로 자신감과 추진력을 북돋아주는 색입니다.",
    },
    {
        "name": "펄 화이트",
        "hex": "#F4F1EA",
        "description": "은은한 광채를 담은 색으로, 색채 심리학적으로 감정의 절정을 부드럽게 감싸주는 색입니다.",
    },
    {
        "name": "세이지 그린",
        "hex": "#87A96B",
        "description": "안정과 회복을 상징하는 색으로, 색채 심리학적으로 들뜬 마음을 가라앉히고 균형 감각을 되찾아주는 색입니다.",
    },
    {
        "name": "더스티 로즈",
        "hex": "#C08081",
        "description": "바랜 듯 부드러운 색조로, 색채 심리학적으로 미련 없이 흘려보내는 이완의 감정을 담아내는 색입니다.",
    },
    {
        "name": "차콜 그레이",
        "hex": "#36454F",
        "description": "빛을 억제한 무채색으로, 색채 심리학적으로 바깥의 자극을 줄이고 자기 응시를 돕는 색입니다.",
    },
]


def _seeded_index(seed: str, pool_size: int) -> int:
    """seed 문자열을 결정적으로 해시해 pool_size 미만의 인덱스를 뽑는다.

    서버가 재시작되거나 여러 대로 늘어나도(메모리 상태에 의존하지 않음) 같은 seed는
    항상 같은 인덱스를 낸다 - 오늘 날짜(KST)를 seed로 쓰면 하루 동안은 고정, 자정이
    지나 날짜가 바뀌면 자연스럽게 다른 값이 나온다."""
    digest = hashlib.sha256(seed.encode("utf-8")).hexdigest()
    return int(digest, 16) % pool_size

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
    date_str = today_kst.isoformat()

    # 하루 동안 위상/조명률이 흔들리지 않도록, 그날 KST 정오를 기준 관측 시각으로 고정한다.
    noon_kst = datetime.combine(today_kst, time(12, 0), tzinfo=KST)
    obs_date = ephem.Date(noon_kst)

    illumination = ephem.Moon(obs_date).phase  # ephem이 계산하는 실제 조명률(%), 0~100
    phase_name = _determine_phase_name(obs_date, today_kst)
    phase = _PHASE_DETAILS[phase_name]

    # 조명률이 높을수록(보름달에 가까울수록) 길몽 확률도 높아지도록 설계.
    luck_percent = round(30 + illumination * 0.65)

    # 행운의 아이템/색상은 실제 달의 위상(phase_name, 며칠씩 이어짐)이 아니라 오늘 날짜(KST)
    # 자체를 시드로 뽑는다 - 그래야 같은 위상이 여러 날 이어져도 자정이 지나면 매번 새로 바뀐다.
    # 아이템/색상에 서로 다른 접미사를 붙여, 같은 날짜라도 두 값이 함께 움직이지 않게 한다.
    lucky_item = LUCKY_ITEM_POOL[_seeded_index(f"{date_str}:item", len(LUCKY_ITEM_POOL))]
    lucky_color = LUCKY_COLOR_POOL[_seeded_index(f"{date_str}:color", len(LUCKY_COLOR_POOL))]

    return {
        "date": date_str,
        "phase_name": phase_name,
        "is_waxing": phase["is_waxing"],
        "illumination": round(illumination, 1),
        "luck_percent": luck_percent,
        "message": phase["message"],
        "summary": phase["summary"],
        "description": phase["description"],
        "lucky_item": lucky_item["name"],
        "lucky_item_emoji": lucky_item["icon"],
        "lucky_item_reason": lucky_item["description"],
        "lucky_color": lucky_color["name"],
        "lucky_color_hex": lucky_color["hex"],
        "lucky_color_reason": lucky_color["description"],
    }


@router.get("/moon-phase")
def get_moon_phase():
    return calculate_moon_phase()


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
def get_live_ticker(db: Session = Depends(get_db)):
    """실시간 꿈 매칭 티커: 방금 공개로 저장된 실제 유저 꿈 제목을 보여준다 (더미 아님).

    id를 함께 내려줘 프론트가 클릭 시 그 꿈의 커뮤니티 상세 페이지(/community/post/{id})로
    바로 이동할 수 있게 한다. 서비스의 몽환적인 세계관을 지키기 위해 현실 지역명이나 작성자
    정보는 노출하지 않고 꿈 제목만 전달한다.
    """
    rows = (
        db.execute(
            select(DreamEntry)
            .where(DreamEntry.status == DreamStatus.PUBLIC)
            .order_by(DreamEntry.created_at.desc())
            .limit(8)
        )
        .scalars()
        .all()
    )
    return {"entries": [{"id": row.id, "keyword": row.title} for row in rows]}


_EXPLORER_BASE_COUNT = 3421


@router.get("/explorer-count")
def get_explorer_count():
    """무의식 탐험가 실시간 카운터: 폴링할 때마다 자연스럽게 흔들리는 더미 라이브 인원수."""
    t = datetime.now(timezone.utc).timestamp()
    wave = int(180 * math.sin(t / 45) + 60 * math.sin(t / 11))
    return {"count": max(0, _EXPLORER_BASE_COUNT + wave)}

# 나의 지난밤 꿈 캘린더 미니 위젯은 더 이상 더미 데이터를 쓰지 않는다 - 프론트엔드가
# /api/dreams(로그인 유저의 실제 꿈 기록)를 직접 구독해 홈 화면과 꿈 기록소 캘린더가
# 항상 같은 데이터를 보여준다.
