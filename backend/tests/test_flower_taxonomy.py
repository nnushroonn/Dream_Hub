"""genus(속) 매핑 표에 대한 순수 함수 단위 테스트.

DB 세션이 필요한 classify_flower()/_is_first_time_emotion() 등은 여기서 다루지 않는다 -
이 프로젝트에는 아직 테스트용 DB 픽스처가 없어, 그쪽은 실제로 띄운 서버에 대한 라이브
회귀 테스트(throwaway 계정)로 확인한다."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import flower_taxonomy as ft

# 프론트 frontend/src/lib/moodBucket.ts의 MOOD_OPTIONS와 정확히 같은 17개 고정 태그 -
# 감정 계열 매핑 정정 프롬프트가 요구한 표 그대로.
EXPECTED_GROUPS: dict[str, set[str]] = {
    "온기": {"🥰", "😌", "💓"},  # 행복, 평온, 설렘
    "격동": {"😰", "😠", "😱", "😤"},  # 불안, 분노, 무서움, 답답함
    "몽환": {"🤔", "🌀", "🤷", "😮"},  # 혼란, 기묘함, 황당함, 놀람
    "여운": {"😢", "😔", "💧"},  # 슬픔, 그리움, 찝찝함
    "생동": {"🤩", "👁️", "✨"},  # 신남, 생생함, 경이로움
}


def test_seventeen_tags_map_to_exactly_one_genus_each():
    all_expected_emojis = set().union(*EXPECTED_GROUPS.values())
    assert len(all_expected_emojis) == 17, "17개 고정 태그 전제가 깨졌다"
    assert set(ft.GENUS_BY_EMOJI.keys()) == all_expected_emojis, "매핑 표의 태그 집합이 17개와 어긋난다"


def test_each_genus_group_matches_exactly():
    for genus, expected_emojis in EXPECTED_GROUPS.items():
        actual_emojis = {emoji for emoji, g in ft.GENUS_BY_EMOJI.items() if g == genus}
        assert actual_emojis == expected_emojis, f"{genus} 계열 매핑이 기대값과 다르다: {actual_emojis} != {expected_emojis}"


def test_yearning_belongs_only_to_yeoun_not_ongi():
    # "그리움"이 온기/여운 양쪽에 들어있던 예전 설계 문서 실수가 이 표에는 반영되지 않았는지
    # 명시적으로 고정해 둔다 - 여운(😔)에만 속하고, 온기 그룹 목록에는 나타나지 않아야 한다.
    assert ft.GENUS_BY_EMOJI["😔"] == "여운"
    assert "😔" not in EXPECTED_GROUPS["온기"]


def test_genus_for_known_emoji():
    assert ft.genus_for_emoji("🥰") == "온기"
    assert ft.genus_for_emoji("😔") == "여운"


def test_genus_for_emoji_falls_back_to_default_when_empty():
    assert ft.genus_for_emoji(None) == ft.DEFAULT_GENUS
    assert ft.genus_for_emoji("") == ft.DEFAULT_GENUS


def test_default_genus_is_mongwhan():
    # "정의되지 않은/낯선 감정" 폴백이므로 몽환 계열이어야 자연스럽다(문제 2 완료 기준).
    assert ft.DEFAULT_GENUS == "몽환"


def test_custom_genus_falls_back_without_api_key(monkeypatch):
    class _FakeSettings:
        anthropic_api_key = ""

    monkeypatch.setattr(ft, "get_settings", lambda: _FakeSettings())
    assert ft._classify_custom_genus("허탈함") == ft.DEFAULT_GENUS


def test_custom_genus_falls_back_when_api_call_raises(monkeypatch):
    class _FakeSettings:
        anthropic_api_key = "fake-key-for-test"

    class _RaisingClient:
        def __init__(self, api_key):
            pass

        class messages:
            @staticmethod
            def create(**kwargs):
                raise RuntimeError("simulated API failure")

    monkeypatch.setattr(ft, "get_settings", lambda: _FakeSettings())
    monkeypatch.setattr(ft.anthropic, "Anthropic", _RaisingClient)
    assert ft._classify_custom_genus("허탈함") == ft.DEFAULT_GENUS


def test_custom_genus_falls_back_on_low_confidence(monkeypatch):
    class _FakeSettings:
        anthropic_api_key = "fake-key-for-test"

    class _FakeTextBlock:
        type = "text"
        text = '{"genus": "여운", "confidence": "low"}'

    class _FakeResponse:
        content = [_FakeTextBlock()]

    class _FakeClient:
        def __init__(self, api_key):
            pass

        class messages:
            @staticmethod
            def create(**kwargs):
                return _FakeResponse()

    monkeypatch.setattr(ft, "get_settings", lambda: _FakeSettings())
    monkeypatch.setattr(ft.anthropic, "Anthropic", _FakeClient)
    assert ft._classify_custom_genus("애매한 단어") == ft.DEFAULT_GENUS


def test_custom_genus_uses_high_confidence_ai_result(monkeypatch):
    class _FakeSettings:
        anthropic_api_key = "fake-key-for-test"

    class _FakeTextBlock:
        type = "text"
        text = '{"genus": "여운", "confidence": "high"}'

    class _FakeResponse:
        content = [_FakeTextBlock()]

    class _FakeClient:
        def __init__(self, api_key):
            pass

        class messages:
            @staticmethod
            def create(**kwargs):
                return _FakeResponse()

    monkeypatch.setattr(ft, "get_settings", lambda: _FakeSettings())
    monkeypatch.setattr(ft.anthropic, "Anthropic", _FakeClient)
    assert ft._classify_custom_genus("허탈함") == "여운"
