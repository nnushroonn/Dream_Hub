"""프론트(frontend/src/lib/flowerSpeciesRoster.ts)와 백엔드(flower_taxonomy.py) 두 종 명부가
서로 어긋나지 않는지 자동으로 검증한다.

flowerSpeciesRoster.ts는 백엔드의 ARCHETYPES(24종)+NEW_GENUS_SPECIES(15종)를 그대로 미러링한
"종 명부"라 - 무늬(texture) 배정이 배열 "순서" 자체에 의존하므로(flowerSpeciesRoster.ts 상단
주석 참고), 값이 바뀌면 두 파일을 항상 함께 고쳐야 한다. 지금까지는 자동 동기화 장치가 없어
한쪽만 고치면 조용히 어긋날 위험이 있었다 - 이 테스트가 그 위험을 잡아낸다.

프론트 TS 파일은 백엔드 테스트 환경에서 import할 수 없으므로(별도 JS 런타임/트랜스파일러가
필요), 정규식으로 두 배열 리터럴(ARCHETYPE_SPECIES, LEGENDARY_KEYS)만 가볍게 파싱한다 - 이
파일의 문법이 단순한 문자열 배열 리터럴 하나뿐이라 정규식 파싱으로 충분하고, 최소한 "종
개수/이름/순서가 두 파일에서 완전히 같은가"는 확실히 잡아낼 수 있다."""

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import flower_taxonomy as ft

ROSTER_TS_PATH = Path(__file__).resolve().parent.parent.parent / "frontend" / "src" / "lib" / "flowerSpeciesRoster.ts"


def _read_roster_source() -> str:
    assert ROSTER_TS_PATH.exists(), f"flowerSpeciesRoster.ts를 찾을 수 없다: {ROSTER_TS_PATH}"
    return ROSTER_TS_PATH.read_text(encoding="utf-8")


def _parse_archetype_species(source: str) -> dict[str, list[str]]:
    """`"관계/재회형": ["들꽃", "제비꽃", ...],` 형태의 줄들만 순서대로 뽑아낸다."""
    block_match = re.search(r"export const ARCHETYPE_SPECIES[^=]*=\s*\{(.*?)\n\};", source, re.DOTALL)
    assert block_match, "ARCHETYPE_SPECIES 블록을 찾지 못했다 - flowerSpeciesRoster.ts 구조가 바뀌었을 수 있다."
    body = block_match.group(1)

    result: dict[str, list[str]] = {}
    for line_match in re.finditer(r'"([^"]+)":\s*\[([^\]]*)\]', body):
        key = line_match.group(1)
        species = re.findall(r'"([^"]+)"', line_match.group(2))
        result[key] = species
    return result


def _parse_legendary_keys(source: str) -> list[str]:
    match = re.search(r"export const LEGENDARY_KEYS\s*=\s*\[([^\]]*)\]", source)
    assert match, "LEGENDARY_KEYS를 찾지 못했다 - flowerSpeciesRoster.ts 구조가 바뀌었을 수 있다."
    return re.findall(r'"([^"]+)"', match.group(1))


def _expected_archetype_species() -> dict[str, list[str]]:
    """백엔드 ARCHETYPES(기존 3종) + NEW_GENUS_SPECIES(환희->냉담->동경 순으로 이어붙임)를
    그대로 재구성한다 - flowerSpeciesRoster.ts 상단 주석이 명시한 "원소 순서" 그대로다."""
    expected: dict[str, list[str]] = {archetype.key: list(archetype.species) for archetype in ft.ARCHETYPES}
    for genus in ["환희", "냉담", "동경"]:
        for archetype_key, species_name in ft.NEW_GENUS_SPECIES[genus].items():
            expected[archetype_key].append(species_name)
    return expected


def test_archetype_species_roster_matches_backend():
    source = _read_roster_source()
    frontend_roster = _parse_archetype_species(source)
    backend_roster = _expected_archetype_species()

    assert set(frontend_roster.keys()) == set(backend_roster.keys()), (
        f"원형(archetype) 키 집합이 다르다 - frontend={sorted(frontend_roster.keys())}, "
        f"backend={sorted(backend_roster.keys())}"
    )
    for archetype_key, backend_species in backend_roster.items():
        frontend_species = frontend_roster[archetype_key]
        assert frontend_species == backend_species, (
            f"'{archetype_key}' 원형의 종 목록/순서가 어긋났다 (순서가 곧 무늬 배정이라 순서까지 "
            f"똑같아야 한다) - frontend={frontend_species}, backend={backend_species}"
        )


def test_total_species_count_is_39():
    backend_roster = _expected_archetype_species()
    total = sum(len(species) for species in backend_roster.values())
    assert total == 39, f"39종이어야 하는데 backend 기준 {total}종이다"
    source = _read_roster_source()
    frontend_total = sum(len(species) for species in _parse_archetype_species(source).values())
    assert frontend_total == 39, f"39종이어야 하는데 frontend 기준 {frontend_total}종이다"


def test_legendary_keys_match_backend():
    source = _read_roster_source()
    frontend_legendary = _parse_legendary_keys(source)
    assert frontend_legendary == ft.LEGENDARY_PRIORITY, (
        f"전설의 꽃 6종 목록/순서가 어긋났다 - frontend={frontend_legendary}, backend={ft.LEGENDARY_PRIORITY}"
    )
