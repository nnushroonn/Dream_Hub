"""'꿈이 기억나지 않아요' 처리 관련 순수 함수 단위 테스트.

이 프로젝트에는 아직 테스트용 DB 픽스처가 없다(test_flower_taxonomy.py 상단 주석 참고) -
그래서 여기서는 DB 세션 없이도 검증 가능한 두 순수 로직만 다룬다:
  1. routers.seeds._sync_status - FORGOTTEN이면 PLANTED->RESTING 자동 전환을 건너뛰는지.
  2. emotion_wordbook.genus_for_word_or_category - 대분류 힌트가 있으면 그걸 우선하는지.
엔드포인트(mark_dream_forgotten, _bloom_pending_seed 등)처럼 실제 DB 커밋이 필요한 흐름은
기존 관례대로 띄운 서버에 대한 라이브 회귀 테스트로 확인한다."""

import sys
from datetime import date, timedelta
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from emotion_wordbook import genus_for_word_or_category
from models import DreamRecallStatus, SeedStatus
from routers.seeds import _sync_status


def _seed(status: SeedStatus, recall: DreamRecallStatus, planted_at: date) -> SimpleNamespace:
    # _sync_status는 status/dream_recall_status/planted_at 세 속성만 읽고 status만 쓴다 -
    # 실제 DreamSeed ORM 인스턴스 대신 이 세 속성만 있는 가벼운 대역으로 충분하다.
    return SimpleNamespace(status=status, dream_recall_status=recall, planted_at=planted_at)


def test_sync_status_still_decays_pending_seed_past_deadline():
    # 기존 동작(회귀 확인) - 힌트 없이 그냥 지나간 씨앗은 여전히 RESTING으로 넘어간다.
    seed = _seed(SeedStatus.PLANTED, DreamRecallStatus.PENDING, date(2026, 1, 1))
    _sync_status(seed, date(2026, 1, 3))
    assert seed.status == SeedStatus.RESTING


def test_sync_status_skips_decay_for_forgotten_seed():
    # 새 동작 - "꿈이 기억나지 않아요"를 선택한 씨앗은 아무리 시간이 지나도 PLANTED로 남는다
    # (기간 제한 없이 나중에 다시 꿈일기를 쓸 수 있는 문을 열어 두기 위해).
    seed = _seed(SeedStatus.PLANTED, DreamRecallStatus.FORGOTTEN, date(2026, 1, 1))
    _sync_status(seed, date(2026, 1, 30))
    assert seed.status == SeedStatus.PLANTED


def test_sync_status_leaves_already_resolved_seed_alone():
    # BLOOMING/RESTING처럼 이미 결론이 난 씨앗은 dream_recall_status와 무관하게 그대로 둔다.
    seed = _seed(SeedStatus.BLOOMING, DreamRecallStatus.REMEMBERED, date(2026, 1, 1))
    _sync_status(seed, date(2026, 1, 30))
    assert seed.status == SeedStatus.BLOOMING


def test_sync_status_no_op_before_deadline():
    seed = _seed(SeedStatus.PLANTED, DreamRecallStatus.PENDING, date(2026, 1, 1))
    _sync_status(seed, date(2026, 1, 1) + timedelta(days=1))
    assert seed.status == SeedStatus.PLANTED


def test_genus_for_word_or_category_prefers_explicit_hint():
    # "구역질나는"은 분노/미움 두 대분류 모두에 실재하는 단어라, 힌트가 어느 쪽이냐에 따라
    # 실제로 다른 속(genus)으로 갈려야 한다(격동 vs 냉담).
    assert genus_for_word_or_category("구역질나는", "미움") == "냉담"
    assert genus_for_word_or_category("구역질나는", "분노") == "격동"


def test_genus_for_word_or_category_falls_back_without_hint():
    # 힌트가 없으면(레거시 기록) 기존 배열 순서 우선 규칙(genus_for_word)과 동일해야 한다.
    assert genus_for_word_or_category("구역질나는", None) == "격동"
    assert genus_for_word_or_category("구역질나는") == "격동"


def test_genus_for_word_or_category_ignores_invalid_hint():
    # 알 수 없는 카테고리 이름이 오면(방어적) 힌트를 무시하고 단어 기반 폴백으로 넘어간다.
    assert genus_for_word_or_category("구역질나는", "존재하지않는카테고리") == "격동"
