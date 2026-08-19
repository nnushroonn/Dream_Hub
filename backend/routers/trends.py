"""실시간 트렌드 키워드: 홈 화면 '실시간 트렌드 키워드' 리스트의 진짜 데이터 소스.

더미 순위표를 쓰지 않고, 두 실제 소스를 합산한다:
1. 꿈 기록소에 공개(PUBLIC)로 저장된 실제 꿈 제목 - 같은 제목이 여러 번 기록될 때마다 누적
2. 꿈해몽 사전에서 실제로 검색된 키워드 - StandardKeyword.search_count

비공개 일기 제목은 절대 집계에 포함하지 않는다(개인 기록 유출 방지).

--- 인기 검색어 랭킹 보드는 위 두 소스와 완전히 별개다 ---
"어제 하루"처럼 KST 자정에 고정되는 배치가 아니라, 항상 "지금 기준 최근 24시간/최근 7일"
롤링 윈도우를 집계한다. 요청이 올 때마다 다시 계산하지 않고:
1. 검색이 일어날 때마다 record_search_trend()가 오늘 이 "시간"(KST, 시 단위)으로 버킷팅된
   Redis Sorted Set(search_log:hour:{YYYY-MM-DD-HH})의 카운트를 ZINCRBY로 1 올린다 - RDBMS는
   건드리지 않는다. 시간 단위 버킷이라야 "지금부터 24시간 전"처럼 임의의 롤링 구간을 정확히
   재구성할 수 있다(일 단위 버킷으로는 자정 경계에서만 정확했다).
2. run_search_trend_refresh_loop()가 SEARCH_TREND_REFRESH_INTERVAL_SECONDS(기본 15분)마다
   run_search_trend_batch()를 실행해, "지금"을 끝점으로 하는 최근 24시간(daily)/최근 7일(weekly)
   Redis 로그를 각각 집계하고 순위·직전 배치 대비 변동폭까지 계산해 daily_keywords 테이블에
   한 번에 적재한다.
3. GET /search-ranking은 daily_keywords에서 가장 최근 generated_at 한 장만 인덱스로 읽으므로,
   서비스 규모가 커져도 항상 즉시 응답한다(요청 시점 집계 없음).
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Literal

import redis
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from database import get_db
from models import DailyKeyword, DreamEntry, DreamStatus, StandardKeyword

router = APIRouter(prefix="/api/trends", tags=["trends"])
logger = logging.getLogger(__name__)

TOP_N = 5

KST = timezone(timedelta(hours=9))

SEARCH_LOG_KEY_PREFIX = "search_log:hour:"
# 주간(7일=168시간) 집계 + 리프레시 주기 지연까지 버틸 수 있도록 여유를 둔 보존 기간.
SEARCH_LOG_RETENTION_HOURS = 24 * 8
SEARCH_TREND_TOP_N = 10
DAILY_WINDOW_HOURS = 24
WEEKLY_WINDOW_HOURS = 24 * 7
SEARCH_TREND_REFRESH_INTERVAL_SECONDS = 15 * 60
# 같은 period(daily/weekly)로 이 개수만큼만 최근 배치를 남기고 오래된 배치는 정리한다 -
# 15분마다 배치가 쌓이므로 정리 없이는 테이블이 무한정 자란다.
RANKING_BATCH_HISTORY_LIMIT = 5


class TrendKeyword(BaseModel):
    keyword: str
    count: int


@router.get("/keywords", response_model=list[TrendKeyword])
def get_trend_keywords(db: Session = Depends(get_db)) -> list[dict]:
    counts: dict[str, int] = {}

    # 원본(title)이 아니라 공개용 제목(public_title or title)을 집계한다 - 유저가 공개
    # 처리하면서 원본과 다른 공개용 제목을 따로 지어뒀다면(예: 원본에 실명이 들어있어
    # 다시 지은 경우) 그 의도가 인증도 없는 트렌드 API에서 깨지면 안 된다.
    title_rows = db.execute(
        select(func.coalesce(DreamEntry.public_title, DreamEntry.title), func.count(DreamEntry.id))
        .where(DreamEntry.status == DreamStatus.PUBLIC)
        .group_by(func.coalesce(DreamEntry.public_title, DreamEntry.title))
    ).all()
    for title, title_count in title_rows:
        key = title.strip()
        if key:
            counts[key] = counts.get(key, 0) + title_count

    keyword_rows = db.execute(
        select(StandardKeyword.name, StandardKeyword.search_count).where(StandardKeyword.search_count > 0)
    ).all()
    for name, search_count in keyword_rows:
        key = name.strip()
        if key:
            counts[key] = counts.get(key, 0) + search_count

    ranked = sorted(counts.items(), key=lambda item: item[1], reverse=True)[:TOP_N]
    return [{"keyword": keyword, "count": count} for keyword, count in ranked]


def _search_log_key(hour: datetime) -> str:
    return f"{SEARCH_LOG_KEY_PREFIX}{hour.strftime('%Y-%m-%d-%H')}"


def record_search_trend(redis_client: redis.Redis, keyword: str) -> None:
    """검색어 하나가 발생할 때마다 지금 이 "시간"(KST) 버킷의 Redis Sorted Set 카운트를 1 올린다.

    주기적 배치 집계용 부가 작업이므로, Redis 장애가 나도 사전 검색 응답 자체를 막지 않는다."""
    try:
        key = _search_log_key(datetime.now(KST))
        pipe = redis_client.pipeline()
        pipe.zincrby(key, 1, keyword)
        pipe.expire(key, SEARCH_LOG_RETENTION_HOURS * 60 * 60)
        pipe.execute()
    except Exception:
        logger.warning("검색어 트렌드 카운트 갱신 실패: %s", keyword, exc_info=True)


def _aggregate_keyword_counts(redis_client: redis.Redis, end: datetime, window_hours: int) -> list[tuple[str, int]]:
    """end 시점을 끝으로 하는 최근 window_hours시간의 Redis 검색 로그를 합산해 상위
    SEARCH_TREND_TOP_N개를 (keyword, count)로 반환한다. ZUNIONSTORE는 존재하지 않는 키를 빈
    집합으로 취급하므로, 버킷이 아직 없는 시간대가 섞여 있어도 그대로 넘겨도 안전하다."""
    keys = [_search_log_key(end - timedelta(hours=offset)) for offset in range(window_hours)]

    temp_key = f"search_log:tmp:{end.timestamp()}:{window_hours}"
    try:
        redis_client.zunionstore(temp_key, keys)
        top = redis_client.zrevrange(temp_key, 0, SEARCH_TREND_TOP_N - 1, withscores=True)
    finally:
        redis_client.delete(temp_key)
    return [(keyword, int(score)) for keyword, score in top]


def _previous_rank_map(db: Session, period: str, before_generated_at: datetime) -> dict[str, int]:
    """같은 period(daily/weekly)의 직전 배치 순위를 {keyword: rank}로 돌려준다 - 상승/하락/신규 계산 기준선."""
    latest_prev_generated_at = db.execute(
        select(func.max(DailyKeyword.generated_at)).where(
            DailyKeyword.period == period, DailyKeyword.generated_at < before_generated_at
        )
    ).scalar_one_or_none()
    if latest_prev_generated_at is None:
        return {}

    rows = db.execute(
        select(DailyKeyword.keyword, DailyKeyword.rank).where(
            DailyKeyword.period == period, DailyKeyword.generated_at == latest_prev_generated_at
        )
    ).all()
    return {keyword: rank for keyword, rank in rows}


def _store_ranking_batch(db: Session, period: str, generated_at: datetime, ranked: list[tuple[str, int]]) -> None:
    prev_ranks = _previous_rank_map(db, period, generated_at)

    for index, (keyword, count) in enumerate(ranked):
        current_rank = index + 1
        prev_rank = prev_ranks.get(keyword)
        if prev_rank is None:
            change: Literal["up", "down", "new", "same"] = "new"
            rank_delta = 0
        else:
            rank_delta = prev_rank - current_rank
            change = "up" if rank_delta > 0 else "down" if rank_delta < 0 else "same"

        db.add(
            DailyKeyword(
                period=period,
                generated_at=generated_at,
                rank=current_rank,
                keyword=keyword,
                count=count,
                change=change,
                rank_delta=abs(rank_delta),
            )
        )
    db.commit()

    # 오래된 배치가 계속 쌓이기만 하면 _previous_rank_map의 MAX(generated_at) 조회가 느려지고
    # 테이블도 무한정 커진다 - 같은 period에서 최근 것만 몇 장 남기고 정리한다.
    stale_generated_ats = (
        db.execute(
            select(DailyKeyword.generated_at)
            .where(DailyKeyword.period == period)
            .distinct()
            .order_by(DailyKeyword.generated_at.desc())
            .offset(RANKING_BATCH_HISTORY_LIMIT)
        )
        .scalars()
        .all()
    )
    if stale_generated_ats:
        db.query(DailyKeyword).filter(
            DailyKeyword.period == period, DailyKeyword.generated_at.in_(stale_generated_ats)
        ).delete(synchronize_session=False)
        db.commit()


def run_search_trend_batch(db: Session, redis_client: redis.Redis, now: datetime | None = None) -> None:
    """리프레시 배치 본체: now(기본은 현재 시각, KST)를 끝점으로 최근 24시간(daily)/최근 7일(weekly)
    롤링 윈도우를 각각 집계해 daily_keywords에 새 배치로 적재한다."""
    if now is None:
        now = datetime.now(KST)

    daily_ranked = _aggregate_keyword_counts(redis_client, now, DAILY_WINDOW_HOURS)
    _store_ranking_batch(db, "daily", now, daily_ranked)

    weekly_ranked = _aggregate_keyword_counts(redis_client, now, WEEKLY_WINDOW_HOURS)
    _store_ranking_batch(db, "weekly", now, weekly_ranked)


async def run_search_trend_refresh_loop(session_factory: sessionmaker, redis_client: redis.Redis) -> None:
    """앱 기동 직후 한 번 즉시 배치를 돌리고, 이후 SEARCH_TREND_REFRESH_INTERVAL_SECONDS(기본
    15분)마다 계속 갱신한다. main.py의 lifespan에서 백그라운드 태스크로 띄운다."""
    while True:
        db = session_factory()
        try:
            run_search_trend_batch(db, redis_client)
        except Exception:
            logger.warning("인기 검색어 배치 실행 실패", exc_info=True)
        finally:
            db.close()
        await asyncio.sleep(SEARCH_TREND_REFRESH_INTERVAL_SECONDS)


class SearchTrendRankingItem(BaseModel):
    rank: int
    keyword: str
    count: int
    change: Literal["up", "down", "new", "same"]
    rank_delta: int


@router.get("/search-ranking", response_model=list[SearchTrendRankingItem])
def get_search_trend_ranking(period: Literal["daily", "weekly"] = "daily", db: Session = Depends(get_db)) -> list[dict]:
    """홈 화면 우측 인기 검색어 랭킹 - daily_keywords에서 가장 최근 generated_at 한 장만 읽는다.
    주기적 배치가 이미 순위/변동폭까지 계산해 적재해뒀으므로 요청 시점엔 정렬·집계가 전혀 필요 없다."""
    latest_generated_at = db.execute(
        select(func.max(DailyKeyword.generated_at)).where(DailyKeyword.period == period)
    ).scalar_one_or_none()
    if latest_generated_at is None:
        return []

    rows = (
        db.execute(
            select(DailyKeyword)
            .where(DailyKeyword.period == period, DailyKeyword.generated_at == latest_generated_at)
            .order_by(DailyKeyword.rank)
            .limit(SEARCH_TREND_TOP_N)
        )
        .scalars()
        .all()
    )
    return [
        {"rank": row.rank, "keyword": row.keyword, "count": row.count, "change": row.change, "rank_delta": row.rank_delta}
        for row in rows
    ]
