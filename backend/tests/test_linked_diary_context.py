"""꿈일기 AI 해몽에 "같은 취침일의 감정일기" 내용을 엮어 넣는 로직을 검증한다.

DB 조회(_find_linked_diary_entry)와 라우트 의존성(_resolve_linked_diary_context의
current_user/db)은 실제 세션이 필요해 여기서는 검증하지 않는다 - 대신 그 사이에 낀 순수
함수 두 개(_diary_entry_to_context, _linked_diary_context_block)만 단위 테스트한다
(test_guided_journal_genus.py와 같은 패턴: DB 세션이 필요 없는 순수 함수만 라이브 서버 없이
검증). 이 두 함수만 옳으면, "DB에서 survey/emotion을 읽어와 프롬프트 문자열을 만든다"는
전체 흐름의 핵심 로직이 보장된다."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from routers.ai_interpretation import (
    LinkedDiaryContext,
    _diary_entry_to_context,
    _linked_diary_context_block,
    _truncate,
    build_quick_system_prompt,
)


def test_diary_entry_to_context_guided_mode():
    survey = {
        "journal_mode": "guided",
        "trigger_event": "신검 후 저녁에 회사로 나와 일을 했다.",
        "desire": "능력이 있다는 것을 알아봐주시는 것",
        "message_to_other": "부족하지만 열심히 하겠습니다!",
        "desired_message": "능력있구나!",
        "self_compassion": "난 할 수 있다",
    }
    context = _diary_entry_to_context(survey, "🥰")
    assert context is not None
    assert context.journal_mode == "guided"
    assert context.trigger_event == survey["trigger_event"]
    assert context.self_compassion == "난 할 수 있다"
    # 간단 모드 전용 필드는 채워지지 않는다.
    assert context.body is None


def test_diary_entry_to_context_simple_mode():
    survey = {"journal_mode": "simple", "action_detail": "오랜만에 여유로운 하루를 보냈다."}
    context = _diary_entry_to_context(survey, "😊")
    assert context is not None
    assert context.journal_mode == "simple"
    assert context.body == "오랜만에 여유로운 하루를 보냈다."
    assert context.mood_emoji == "😊"


def test_diary_entry_to_context_missing_journal_mode_treated_as_simple():
    # journal_mode 필드 자체가 없는 옛 기록(이 필드가 생기기 전에 저장된 감정일기)도 안전하게
    # 간단 모드로 취급해야 한다.
    survey = {"action_detail": "옛날에 쓴 일기"}
    context = _diary_entry_to_context(survey, "😢")
    assert context is not None
    assert context.journal_mode == "simple"
    assert context.body == "옛날에 쓴 일기"


def test_diary_entry_to_context_empty_simple_body_returns_none():
    # 제목만 있고 본문이 빈 감정일기는 컨텍스트로서 의미가 없다.
    survey = {"journal_mode": "simple", "action_detail": "   "}
    assert _diary_entry_to_context(survey, "😊") is None


def test_diary_entry_to_context_guided_with_all_blank_fields_still_returns_context():
    # guided 분기는 필드 존재 여부만 보고 값을 채워 넣는다 - 전부 비어 있어도 객체 자체는
    # 만들어진다. 실제로 프롬프트에 아무것도 안 남는지는 _linked_diary_context_block이
    # 따로 책임진다(아래 테스트).
    survey = {"journal_mode": "guided"}
    context = _diary_entry_to_context(survey, "🤔")
    assert context is not None
    assert context.trigger_event is None


def test_truncate_leaves_short_text_untouched():
    text = "짧은 문장"
    assert _truncate(text) == text


def test_truncate_caps_long_text_with_ellipsis():
    long_text = "가" * 1000
    truncated = _truncate(long_text, max_chars=600)
    assert len(truncated) == 601  # 600자 + 말줄임표 1글자
    assert truncated.endswith("…")


def test_linked_diary_context_block_none_returns_empty_string():
    assert _linked_diary_context_block(None) == ""


def test_linked_diary_context_block_guided_mentions_all_filled_fields():
    context = LinkedDiaryContext(
        journal_mode="guided",
        trigger_event="사건 내용",
        desire="바랐던 것",
        message_to_other=None,
        desired_message=None,
        self_compassion="위로한 말",
    )
    block = _linked_diary_context_block(context)
    assert "사건 내용" in block
    assert "바랐던 것" in block
    assert "위로한 말" in block
    assert "[이 꿈을 꾸기 전, 낮에 남긴 감정일기 기록]" in block


def test_linked_diary_context_block_guided_all_blank_returns_empty_string():
    context = LinkedDiaryContext(journal_mode="guided")
    assert _linked_diary_context_block(context) == ""


def test_linked_diary_context_block_simple_mentions_body_and_mood():
    context = LinkedDiaryContext(journal_mode="simple", body="오늘은 조금 지쳤다.", mood_emoji="😔")
    block = _linked_diary_context_block(context)
    assert "오늘은 조금 지쳤다." in block
    assert "😔" in block


def test_linked_diary_context_block_simple_blank_body_returns_empty_string():
    context = LinkedDiaryContext(journal_mode="simple", body="   ", mood_emoji="😊")
    assert _linked_diary_context_block(context) == ""


def test_build_quick_system_prompt_without_context_is_unaffected():
    # linked_diary_context를 안 넘기면(기본값 None) 예전과 완전히 동일하게 동작해야 한다 -
    # 회귀 없음을 명시적으로 고정.
    static_block, data_block = build_quick_system_prompt("제목", "본문")
    assert "감정일기" not in data_block


def test_build_quick_system_prompt_appends_linked_context():
    context = LinkedDiaryContext(journal_mode="simple", body="낮에 있었던 일", mood_emoji="😊")
    _, data_block = build_quick_system_prompt("제목", "본문", context)
    assert "낮에 있었던 일" in data_block
    assert "본문" in data_block  # 원래 DATA 블록 내용도 그대로 남아 있어야 한다.
