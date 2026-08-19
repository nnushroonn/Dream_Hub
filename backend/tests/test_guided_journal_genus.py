"""간단 모드(이모지, 기존 5속만)와 깊이 모드(마음 기록장 단어, 8속까지)가 각자 맞는 속으로
귀결되는지 검증한다.

genus_for_emotion_input()이 두 입력 형태를 받는 단일 창구라는 게 이 기능의 핵심 전제다.
2차 확장(속 5->8)으로 온기/격동/여운에서 기쁨/미움/바램이 각각 환희/냉담/동경으로 분리
독립됐다 - 간단 모드는 여전히 기존 5속 이모지 표만 쓰므로 신규 3속에 도달하지 못하고,
깊이 모드만 EMOTION_CATEGORY_TO_GENUS를 통해 8속 전체에 닿는다는 걸 명시적으로 고정해
둔다. 성장 배지(_has_growth_badge) 로직도 함께 검증한다 - DB 세션이 필요 없는 순수
함수들이라 test_flower_taxonomy.py와 같은 패턴(라이브 서버 없이 단위 테스트)을 그대로
따른다."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import flower_taxonomy as ft
from emotion_wordbook import EMOTION_CATEGORIES, EMOTION_CATEGORY_TO_GENUS, EMOTION_WORD_TO_CATEGORY, genus_for_word


def test_every_category_maps_to_a_known_genus_except_mongwhan_gap():
    # 7개 대분류 중 몽환으로 직접 향하는 대분류는 없다(원본 워크시트 자체에 "혼란/놀람"
    # 계열이 없다는 걸 명시적으로 고정해 둔다) - 나머지 7개는 전부 매핑 표에 있어야 한다.
    assert set(EMOTION_CATEGORY_TO_GENUS.keys()) == set(EMOTION_CATEGORIES.keys())
    assert "몽환" not in EMOTION_CATEGORY_TO_GENUS.values()


def test_category_to_genus_matches_confirmed_table():
    # 2차 확장(속 5->8) 이후 표 - 사랑/분노/슬픔은 기존 속에 남고, 기쁨/미움/바램만 각각
    # 환희/냉담/동경으로 분리 독립됐다.
    assert EMOTION_CATEGORY_TO_GENUS == {
        "사랑": "온기",
        "기쁨": "환희",
        "분노": "격동",
        "미움": "냉담",
        "슬픔": "여운",
        "바램": "동경",
        "즐거움": "생동",
    }


def test_genus_for_word_uses_category_table():
    assert genus_for_word("사랑스러운") == "온기"  # 사랑 - 온기에 남는 감정
    assert genus_for_word("행복한") == "환희"  # 기쁨 - 온기에서 분리 독립
    assert genus_for_word("분노") == "격동"  # 격동에 남는 감정
    assert genus_for_word("미운") == "냉담"  # 미움 - 격동에서 분리 독립
    assert genus_for_word("우울한") == "여운"  # 슬픔 - 여운에 남는 감정
    assert genus_for_word("간절한") == "동경"  # 바램 - 여운에서 분리 독립
    assert genus_for_word("신나는") == "생동"  # 즐거움


def test_genus_for_word_returns_none_for_unknown_word():
    assert genus_for_word("존재하지않는감정단어") is None


def test_genus_for_emotion_input_simple_mode_unchanged():
    # guided_word가 없으면 예전 genus_for_emoji와 완전히 같은 결과 + 메타데이터만 덧붙는다.
    genus, mode, value = ft.genus_for_emotion_input(emoji="🥰", guided_word=None)
    assert (genus, mode, value) == ("온기", "simple", "🥰")

    genus, mode, value = ft.genus_for_emotion_input(emoji="😢", guided_word=None)
    assert (genus, mode, value) == ("여운", "simple", "😢")


def test_genus_for_emotion_input_guided_mode_uses_category_table():
    # "간절한"은 바램 대분류 - 2차 확장 이후로는 여운이 아니라 신규 속 동경으로 귀결된다.
    genus, mode, value = ft.genus_for_emotion_input(emoji=None, guided_word="간절한")
    assert (genus, mode, value) == ("동경", "guided", "간절한")


def test_simple_and_guided_modes_agree_on_shared_genus_emotion():
    # "간단 모드 이모지"와 "깊이 모드 단어"가 둘 다 여전히 같은 속에 남아있는 정서를
    # 가리키면 같은 속이 나와야 한다 - 사랑(온기에 남음) vs 온기 이모지 🥰.
    simple_genus, _, _ = ft.genus_for_emotion_input(emoji="🥰", guided_word=None)
    guided_genus, _, _ = ft.genus_for_emotion_input(emoji=None, guided_word="사랑스러운")
    assert simple_genus == guided_genus == "온기"

    # 슬픔 계열도 함께 확인 - 간단 모드 😢(여운) vs 깊이 모드 "우울한"(슬픔, 여운에 남음).
    simple_genus, _, _ = ft.genus_for_emotion_input(emoji="😢", guided_word=None)
    guided_genus, _, _ = ft.genus_for_emotion_input(emoji=None, guided_word="우울한")
    assert simple_genus == guided_genus == "여운"


def test_simple_mode_cannot_reach_new_genera():
    # 간단 모드(17개 고정 이모지)는 2차 확장 이후로도 기존 5속만 나온다 - 신규 3속(환희/
    # 냉담/동경)은 깊이 모드에서 대분류를 세분화해야만 도달할 수 있는 영역이라는 걸 고정한다.
    for emoji in ft.GENUS_BY_EMOJI:
        genus, mode, _ = ft.genus_for_emotion_input(emoji=emoji, guided_word=None)
        assert mode == "simple"
        assert genus in {"온기", "격동", "몽환", "여운", "생동"}


def test_guided_mode_reaches_all_three_new_genera():
    assert ft.genus_for_emotion_input(emoji=None, guided_word="행복한")[0] == "환희"  # 기쁨
    assert ft.genus_for_emotion_input(emoji=None, guided_word="미운")[0] == "냉담"  # 미움
    assert ft.genus_for_emotion_input(emoji=None, guided_word="간절한")[0] == "동경"  # 바램


def test_guided_mode_unknown_word_falls_back_to_default_without_api_key(monkeypatch):
    class _FakeSettings:
        anthropic_api_key = ""

    monkeypatch.setattr(ft, "get_settings", lambda: _FakeSettings())
    genus, mode, value = ft.genus_for_emotion_input(emoji=None, guided_word="단어장에없는단어")
    assert genus == ft.DEFAULT_GENUS
    assert mode == "guided"
    assert value == "단어장에없는단어"


def test_growth_badge_requires_guided_mode():
    assert ft._has_growth_badge(None) is False
    assert ft._has_growth_badge({"journal_mode": "simple", "initial_emotion": "우울한", "closing_emotion": "행복한"}) is False


def test_growth_badge_requires_both_emotions():
    assert ft._has_growth_badge({"journal_mode": "guided", "initial_emotion": "우울한"}) is False
    assert ft._has_growth_badge({"journal_mode": "guided", "closing_emotion": "행복한"}) is False


def test_growth_badge_true_for_negative_to_positive_shift():
    # 여운(우울한) -> 온기(행복한): 부정 -> 긍정.
    assert (
        ft._has_growth_badge({"journal_mode": "guided", "initial_emotion": "우울한", "closing_emotion": "행복한"}) is True
    )
    # 격동(분노) -> 생동(신나는): 부정 -> 긍정.
    assert ft._has_growth_badge({"journal_mode": "guided", "initial_emotion": "분노", "closing_emotion": "신나는"}) is True


def test_growth_badge_false_when_staying_negative_or_positive():
    # 여운 -> 격동: 둘 다 부정, 방향이 "긍정으로" 바뀌지 않았다.
    assert ft._has_growth_badge({"journal_mode": "guided", "initial_emotion": "우울한", "closing_emotion": "분노"}) is False
    # 온기 -> 온기: 애초에 부정에서 시작하지 않았다.
    assert ft._has_growth_badge({"journal_mode": "guided", "initial_emotion": "행복한", "closing_emotion": "사랑스러운"}) is False
    # 긍정 -> 부정: 방향이 반대다.
    assert ft._has_growth_badge({"journal_mode": "guided", "initial_emotion": "행복한", "closing_emotion": "우울한"}) is False


def test_growth_badge_false_when_either_word_unknown():
    assert (
        ft._has_growth_badge({"journal_mode": "guided", "initial_emotion": "단어장에없음", "closing_emotion": "행복한"})
        is False
    )


def test_word_to_category_covers_every_listed_word():
    total_words = sum(len(words) for words in EMOTION_CATEGORIES.values())
    assert total_words > 0
    for category, words in EMOTION_CATEGORIES.items():
        for word in words:
            assert word in EMOTION_WORD_TO_CATEGORY


def test_growth_badge_covers_new_genera_polarity():
    # 냉담(미운) -> 환희(행복한): 부정 -> 긍정, 신규 속끼리도 배지가 붙어야 한다.
    assert ft._has_growth_badge({"journal_mode": "guided", "initial_emotion": "미운", "closing_emotion": "행복한"}) is True
    # 동경(간절한) -> 생동(신나는): 부정 -> 긍정.
    assert ft._has_growth_badge({"journal_mode": "guided", "initial_emotion": "간절한", "closing_emotion": "신나는"}) is True
    # 온기 -> 냉담: 긍정에서 시작해 부정으로, 방향이 반대라 배지 없음.
    assert ft._has_growth_badge({"journal_mode": "guided", "initial_emotion": "사랑스러운", "closing_emotion": "미운"}) is False


def test_genus_polarity_covers_all_eight_genera():
    assert set(ft.GENUS_POLARITY.keys()) == {"온기", "격동", "몽환", "여운", "생동", "환희", "냉담", "동경"}


# --- 종(species) 5->8속 연동 확장(24 -> 39) 검증 -----------------------------


def test_new_species_count_is_fifteen():
    assert ft.NEW_SPECIES_COUNT == 15
    assert sum(len(mapping) for mapping in ft.NEW_GENUS_SPECIES.values()) == 15


def test_new_species_do_not_collide_with_existing_24():
    existing_names = {name for archetype in ft.ARCHETYPES for name in archetype.species}
    assert len(existing_names) == 24
    new_names = {name for mapping in ft.NEW_GENUS_SPECIES.values() for name in mapping.values()}
    assert len(new_names) == 15
    assert existing_names.isdisjoint(new_names)


def test_new_species_archetype_keys_are_valid():
    valid_archetype_keys = {archetype.key for archetype in ft.ARCHETYPES}
    for genus, mapping in ft.NEW_GENUS_SPECIES.items():
        assert genus in {"환희", "냉담", "동경"}
        assert set(mapping.keys()) <= valid_archetype_keys


def test_classify_species_uses_new_genus_species_when_covered():
    # "황매화"는 환희 x 비행/자유형 전용 종 - 그 태그+속 조합이면 결정론적으로 그 종이 나와야
    # 한다(의사난수가 아니라 고정 매핑이라 seed_id를 아무 값으로 줘도 항상 같다).
    archetype_key, species_name = ft.classify_species(["#비행", "#자유"], seed_id=1, genus="환희")
    assert archetype_key == "비행/자유형"
    assert species_name == "황매화"

    archetype_key, species_name = ft.classify_species(["#비행", "#자유"], seed_id=999999, genus="환희")
    assert species_name == "황매화"  # seed_id가 달라도 항상 같다(기존 3종 풀과 달리 고정).


def test_classify_species_falls_back_to_old_pool_for_uncovered_archetype():
    # 환희는 "추적/도피형"에 전용 종이 없다(5개 원형만 커버) - 기존 3종 풀로 자연스럽게
    # 폴백해야 하고, 그 풀은 예전과 똑같이 엉겅퀴/가시나무꽃/선인장꽃 중 하나여야 한다.
    archetype_key, species_name = ft.classify_species(["#쫓김", "#도망"], seed_id=1, genus="환희")
    assert archetype_key == "추적/도피형"
    assert species_name in {"엉겅퀴", "가시나무꽃", "선인장꽃"}


def test_classify_species_unchanged_for_original_five_genera():
    # 기존 5속으로 넘어오면 신규 매핑을 전혀 참조하지 않고 기존 3종 풀 로직 그대로 - 과거
    # 생성된 24종 데이터의 동작을 절대 바꾸지 않는다는 요구사항을 코드 레벨로 고정한다.
    archetype_key, species_name = ft.classify_species(["#전연인", "#재회"], seed_id=42, genus="온기")
    assert archetype_key == "관계/재회형"
    assert species_name in {"들꽃", "제비꽃", "프리지아"}
