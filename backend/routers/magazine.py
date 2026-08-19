"""드림허브 매거진: 꿈 심리학/상징 해설을 다루는 자체 에디토리얼 콘텐츠.

커뮤니티 UGC와 달리 전부 Dream Hub 편집팀이 작성한 1st-party 콘텐츠다. 로그인 여부와
무관하게 누구나(검색 엔진 크롤러 포함) 읽을 수 있다.
"""

from math import ceil

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import MagazineArticle

router = APIRouter(prefix="/api/magazine", tags=["magazine"])

MAGAZINE_LIST_DEFAULT_LIMIT = 12
MAGAZINE_LIST_MAX_LIMIT = 50


class MagazineArticleSummary(BaseModel):
    id: int
    slug: str
    title: str
    excerpt: str
    category: str
    author: str
    view_count: int
    created_at: str


class MagazineArticleDetail(MagazineArticleSummary):
    content: str


class MagazineListResponse(BaseModel):
    items: list[MagazineArticleSummary]
    total_count: int
    total_pages: int
    page: int


def _to_summary(article: MagazineArticle) -> dict:
    return {
        "id": article.id,
        "slug": article.slug,
        "title": article.title,
        "excerpt": article.excerpt,
        "category": article.category,
        "author": article.author,
        "view_count": article.view_count,
        "created_at": article.created_at.isoformat(),
    }


@router.get("", response_model=MagazineListResponse)
def list_magazine_articles(
    page: int = Query(1, ge=1),
    limit: int = Query(MAGAZINE_LIST_DEFAULT_LIMIT, ge=1, le=MAGAZINE_LIST_MAX_LIMIT),
    db: Session = Depends(get_db),
) -> dict:
    query = db.query(MagazineArticle).order_by(MagazineArticle.created_at.desc())
    total_count = query.count()
    total_pages = max(ceil(total_count / limit), 1)
    articles = query.offset((page - 1) * limit).limit(limit).all()
    return {
        "items": [_to_summary(article) for article in articles],
        "total_count": total_count,
        "total_pages": total_pages,
        "page": page,
    }


@router.get("/{slug}", response_model=MagazineArticleDetail)
def get_magazine_article(slug: str, db: Session = Depends(get_db)) -> dict:
    article = db.query(MagazineArticle).filter(MagazineArticle.slug == slug).first()
    if article is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="글을 찾을 수 없어요.")
    article.view_count += 1
    db.commit()
    return {**_to_summary(article), "content": article.content}
