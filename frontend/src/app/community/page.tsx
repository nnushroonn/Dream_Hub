"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, MessageCircle, Moon, Pencil, SquarePen, ThumbsUp, Trash2 } from "lucide-react";

import {
  buildDreamOriginalContent,
  deleteCommunityPost,
  getCommunityPosts,
  getDreamFeed,
  getPublicDream,
  getTopCommunityTags,
  POST_EDIT_WINDOW_MS,
  setDreamVisibility,
  type CommunityPeriod,
  type CommunityPost,
  type CommunitySearchType,
  type CommunitySort,
  type DreamFeedEntry,
  type TagCount,
} from "@/api/dream";
import AllTagsModal from "@/components/AllTagsModal";
import AuthorBadge from "@/components/AuthorBadge";
import CommunitySearchBar from "@/components/CommunitySearchBar";
import CommunitySortChips from "@/components/CommunitySortChips";
import CommunityTagFilterBar from "@/components/CommunityTagFilterBar";
import FlowerIcon from "@/components/FlowerIcon";
import NavBar from "@/components/NavBar";
import Paginator from "@/components/Paginator";
import SidebarBestList from "@/components/SidebarBestList";
import UserDreamProfileModal from "@/components/UserDreamProfileModal";
import { markBackNavOrigin } from "@/lib/communityBackNav";
import { flowerLanguageFor } from "@/lib/flowerTaxonomy";
import { useAuthStore } from "@/store/useAuthStore";
import { useLoginModalStore } from "@/store/useLoginModalStore";

type Tab = "dream" | "board";

// 검색/정렬/기간/페이지를 하나로 묶은 쿼리 상태 - 꿈 게시판/자유 광장 목록 fetch 모두 이 객체
// 하나에만 의존한다(두 탭이 각자의 인스턴스를 갖는다). searchType/keyword가 없으면 검색 조건
// 없이 정렬/기간만 적용된 전체 목록이다.
interface PostListQuery {
  page: number;
  sort: CommunitySort;
  period: CommunityPeriod;
  searchType?: CommunitySearchType;
  keyword?: string;
}

const DEFAULT_POST_QUERY: PostListQuery = { page: 1, sort: "latest", period: "all" };

function formatPostTime(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// 리스트 미리보기 스포일러 방지: "반전은 다음 줄에" 같은 낚시글을 첫 줄만 잘라 보여주면, 유저가
// 일부러 엔터를 여러 번 눌러 감춰둔 반전 텍스트가 리스트에서 미리 새어나가지 않는다.
function firstLine(content: string): string {
  return content.split(/\r\n|\n/)[0];
}

// 사담(share_caption)이 비어 있거나 공백뿐이면 리스트 행이 텅 비어 보이지 않도록, 첨부된 꿈
// 원문 첫 줄로 대체하고 🌙를 붙여 "유저의 말이 아니라 꿈 데이터"임을 시각적으로 구분한다.
function dreamListPreview(dream: DreamFeedEntry): string | null {
  const caption = firstLine(dream.share_caption ?? "").trim();
  if (caption.length >= 20) return caption;
  if (caption.length > 0) return null; // 사담은 있지만 너무 짧음 - 스포일러 방지로 제목만 노출

  // 꽃 공유 글은 survey가 비어 있는 더미라 원문 대신 꽃말을 미리보기로 쓴다.
  if (dream.attached_flower) return `🌷 ${flowerLanguageFor(dream.attached_flower)}`;

  const fallback = firstLine(buildDreamOriginalContent(dream.survey)).trim();
  return fallback.length > 0 ? `🌙 ${fallback}` : null;
}

export default function CommunityPage() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const openLoginModal = useLoginModalStore((state) => state.open);

  const [tab, setTab] = useState<Tab>("dream");

  const [dreams, setDreams] = useState<DreamFeedEntry[]>([]);
  const [isLoadingDreams, setIsLoadingDreams] = useState(true);
  const [dreamTotalPages, setDreamTotalPages] = useState(1);
  // 자유 광장과 동일한 쿼리 구조(PostListQuery)를 그대로 쓴다 - 두 탭의 검색/정렬/태그 필터 UI를
  // 공통 컴포넌트(CommunitySearchBar/CommunitySortChips/CommunityTagFilterBar)로 통일하기 위함.
  const [dreamQuery, setDreamQuery] = useState<PostListQuery>(DEFAULT_POST_QUERY);
  const [dreamSearchType, setDreamSearchType] = useState<CommunitySearchType>("all");
  const [dreamSearchKeyword, setDreamSearchKeyword] = useState("");
  const [dreamTopTags, setDreamTopTags] = useState<TagCount[]>([]);
  // 리스트에서 바로 삭제할 수 있는 빠른 액션 - 수정은 자유 광장과 동일하게 상세 페이지(edit=1)로 보낸다.
  const [confirmDeleteDreamId, setConfirmDeleteDreamId] = useState<number | null>(null);
  const [isDeletingDream, setIsDeletingDream] = useState(false);

  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [isLoadingPosts, setIsLoadingPosts] = useState(true);
  const [postTotalPages, setPostTotalPages] = useState(1);
  // 검색/정렬/기간/페이지를 하나로 묶은 쿼리 상태 - 자유 광장 목록 fetch는 이 객체 하나에만 의존한다.
  const [postQuery, setPostQuery] = useState<PostListQuery>(DEFAULT_POST_QUERY);
  // 검색 바 입력 중인 값(드롭다운+텍스트) - postQuery.searchType/keyword는 "제출된" 값이라
  // 이렇게 따로 둬야 매 키 입력마다 재요청하지 않는다.
  const [searchType, setSearchType] = useState<CommunitySearchType>("all");
  const [searchKeyword, setSearchKeyword] = useState("");
  // 상단 태그 필터 바 - 최근 7일간 가장 많이 쓰인 해시태그 Top 8을 서버가 집계해서 내려준다
  // (바에는 이 중 4개까지만 노출하고, 나머지는 "+ 태그 더보기" 모달에서 검색한다).
  const [topTags, setTopTags] = useState<TagCount[]>([]);
  // 어느 탭에서 "+ 태그 더보기"를 눌렀는지는 tab 값으로 그대로 판단한다(한 번에 한 탭만 보이므로).
  const [isAllTagsModalOpen, setIsAllTagsModalOpen] = useState(false);
  // 리스트에서 바로 삭제할 수 있는 빠른 액션 - 수정은 상세 페이지(edit=1)로 보낸다.
  const [confirmDeletePostId, setConfirmDeletePostId] = useState<number | null>(null);
  const [isDeletingPost, setIsDeletingPost] = useState(false);

  // 탭을 바꿀 때마다 URL도 함께 갱신해 둬야, 상세 페이지의 "돌아가기"(router.back() 또는
  // 고정 경로 ?tab=...)가 정확히 지금 보고 있던 탭으로 복귀한다 - state만 바꾸고 URL을 그대로
  // 두면 새로고침/뒤로가기 시 항상 기본 탭(꿈 게시판)으로 리셋되는 문제가 있었다.
  const switchTab = (nextTab: Tab) => {
    setTab(nextTab);
    router.replace(`/community?tab=${nextTab}`, { scroll: false });
  };

  useEffect(() => {
    // 글쓰기 페이지에서 게시 후 돌아올 때 ?tab=board|dream으로 어느 탭에 있었는지 알려준다 -
    // 없으면(첫 진입) 기존처럼 무의식 피드가 기본 탭이다.
    const params = new URLSearchParams(window.location.search);
    if (params.get("tab") === "board") setTab("board");

    getTopCommunityTags({ source: "board" })
      .then(setTopTags)
      .catch(() => {});
    getTopCommunityTags({ source: "dream" })
      .then(setDreamTopTags)
      .catch(() => {});
  }, []);

  // 쿼리 상태가 바뀔 때마다(최초 진입 포함) 서버에 다시 요청한다.
  useEffect(() => {
    setIsLoadingPosts(true);
    getCommunityPosts(postQuery)
      .then((res) => {
        setPosts(res.items);
        setPostTotalPages(res.total_pages);
      })
      .catch(() => {})
      .finally(() => setIsLoadingPosts(false));
  }, [postQuery]);

  // 꿈 게시판도 자유 광장과 동일하게 쿼리 상태가 바뀔 때마다(최초 진입 포함) 서버에 다시 요청한다.
  useEffect(() => {
    setIsLoadingDreams(true);
    getDreamFeed(dreamQuery)
      .then((res) => {
        setDreams(res.items);
        setDreamTotalPages(res.total_pages);
      })
      .catch(() => {})
      .finally(() => setIsLoadingDreams(false));
  }, [dreamQuery]);

  // 새 검색을 실행할 때마다 페이지를 1로 되돌린다 - 이전 페이지에 머문 채 결과셋만 바뀌면
  // "3페이지인데 글이 하나도 없다"처럼 혼란스러운 상태가 될 수 있다.
  const handleSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = searchKeyword.trim();
    setPostQuery((prev) => ({
      ...prev,
      page: 1,
      searchType: trimmed ? searchType : undefined,
      keyword: trimmed || undefined,
    }));
  };

  const handleClickTopTag = (tag: string) => {
    setSearchType("hashtag");
    setSearchKeyword(tag);
    setPostQuery((prev) => ({ ...prev, page: 1, searchType: "hashtag", keyword: tag }));
  };

  const handleClearSearch = () => {
    setSearchKeyword("");
    setPostQuery((prev) => ({ ...prev, page: 1, searchType: undefined, keyword: undefined }));
  };

  // 공감순/조회순으로 바꾸면 기간 필터 기본값을 주간으로 자동 할당한다 - 최신순으로 돌아가면
  // 기간 제한을 다시 없앤다(전체 역대 최신 글).
  const handleSortChange = (nextSort: CommunitySort) => {
    setPostQuery((prev) => ({
      ...prev,
      sort: nextSort,
      page: 1,
      period: nextSort === "latest" ? "all" : "weekly",
    }));
  };

  const handlePeriodChange = (nextPeriod: CommunityPeriod) => {
    setPostQuery((prev) => ({ ...prev, period: nextPeriod, page: 1 }));
  };

  // 페이지 번호를 바꿀 때마다 리스트 최상단으로 부드럽게 스크롤을 되돌려, 새로 렌더링된
  // 페이지의 첫 글부터 다시 눈에 들어오게 한다.
  const handlePageChange = (nextPage: number) => {
    setPostQuery((prev) => ({ ...prev, page: nextPage }));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // 꿈 게시판 쪽 핸들러 - 자유 광장의 handleSearchSubmit/handleClickTopTag/handleClearSearch/
  // handleSortChange/handlePeriodChange/handlePageChange와 완전히 동일한 패턴이다.
  const handleDreamSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = dreamSearchKeyword.trim();
    setDreamQuery((prev) => ({
      ...prev,
      page: 1,
      searchType: trimmed ? dreamSearchType : undefined,
      keyword: trimmed || undefined,
    }));
  };

  const handleClickDreamTopTag = (tag: string) => {
    setDreamSearchType("hashtag");
    setDreamSearchKeyword(tag);
    setDreamQuery((prev) => ({ ...prev, page: 1, searchType: "hashtag", keyword: tag }));
  };

  const handleClearDreamSearch = () => {
    setDreamSearchKeyword("");
    setDreamQuery((prev) => ({ ...prev, page: 1, searchType: undefined, keyword: undefined }));
  };

  const handleDreamSortChange = (nextSort: CommunitySort) => {
    setDreamQuery((prev) => ({
      ...prev,
      sort: nextSort,
      page: 1,
      period: nextSort === "latest" ? "all" : "weekly",
    }));
  };

  const handleDreamPeriodChange = (nextPeriod: CommunityPeriod) => {
    setDreamQuery((prev) => ({ ...prev, period: nextPeriod, page: 1 }));
  };

  const handleDreamPageChange = (nextPage: number) => {
    setDreamQuery((prev) => ({ ...prev, page: nextPage }));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDeletePost = async (postId: number) => {
    if (isDeletingPost) return;
    setIsDeletingPost(true);
    try {
      await deleteCommunityPost(postId);
      setPosts((prev) => prev.filter((post) => post.id !== postId));
    } catch {
      // 간단한 액션이라 별도 에러 배너 없이, 확인 상태만 닫고 목록은 그대로 둔다.
    } finally {
      setConfirmDeletePostId(null);
      setIsDeletingPost(false);
    }
  };

  // 무의식 광장의 "삭제"는 자유 광장과 달리 꿈 기록소(/diary) 원본까지 지우지 않는다 - 공개를
  // 취소해 커뮤니티에서만 사라지게 한다(is_public=false). 목록 카드(DreamFeedEntry)에는 완전한
  // interpretation이 없어 setDreamVisibility에 그대로 넘길 수 없으므로, 먼저 전체 레코드를
  // 한 번 더 불러와(getPublicDream) 기존 해몽 데이터가 유실되지 않게 한다.
  const handleDeleteDream = async (dreamId: number) => {
    if (isDeletingDream) return;
    setIsDeletingDream(true);
    try {
      const fullEntry = await getPublicDream(dreamId);
      await setDreamVisibility(fullEntry, {
        isPublic: false,
        isAnonymous: fullEntry.is_anonymous,
        shareWithAiAnalysis: fullEntry.share_with_ai_analysis,
        shareCaption: fullEntry.share_caption ?? undefined,
      });
      setDreams((prev) => prev.filter((dream) => dream.id !== dreamId));
    } catch {
      // 간단한 액션이라 별도 에러 배너 없이, 확인 상태만 닫고 목록은 그대로 둔다.
    } finally {
      setConfirmDeleteDreamId(null);
      setIsDeletingDream(false);
    }
  };

  // 글쓰기/내 꿈 공유하기는 이제 독립 페이지(/community/write)다 - 로그인하지 않은 유저가
  // 그 링크를 눌렀을 때만 여기서 미리 막는다.
  const requireLoginThen = (href: string) => {
    if (!isAuthenticated) {
      // 로그인 성공 시 방금 누르려던 목적지로 그대로 이어간다(펜딩 액션 복귀).
      openLoginModal({ triggerSource: "community", onSuccess: () => router.push(href) });
      return;
    }
    router.push(href);
  };

  // 리스트는 누구나 볼 수 있지만, 특정 글의 상세(댓글/본문)로 들어가는 순간부터는 로그인이
  // 필요하다 - 라우팅 대신 그 자리에서 로그인 모달을 띄운다.
  const goToDetail = (href: string) => {
    if (!isAuthenticated) {
      openLoginModal({
        triggerSource: "community",
        onSuccess: () => {
          markBackNavOrigin("list");
          router.push(href);
        },
      });
      return;
    }
    markBackNavOrigin("list");
    router.push(href);
  };

  // 탭+피드+사이드바 - 리스트(제목/태그/작성일/좋아요 수)는 비로그인 유저에게도 그대로 열어둔다.
  const feedSection = (
    <>
        {/* 이원화 탭: 활성 탭 아래로 보랏빛 언더라인 글로우가 슬라이드한다 */}
        <div className="relative mt-8 max-w-md">
          <div className="grid grid-cols-2">
            <button
              type="button"
              onClick={() => switchTab("dream")}
              className={`flex items-center justify-center gap-1.5 pb-3 text-sm font-semibold transition-colors ${
                tab === "dream" ? "text-white" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <Moon className="h-4 w-4" strokeWidth={1.5} />
              꿈 게시판
            </button>
            <button
              type="button"
              onClick={() => switchTab("board")}
              className={`flex items-center justify-center gap-1.5 pb-3 text-sm font-semibold transition-colors ${
                tab === "board" ? "text-white" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <MessageCircle className="h-4 w-4" strokeWidth={1.5} />
              자유 게시판
            </button>
          </div>
          <div className="h-px w-full bg-white/10" />
          <div
            className={`absolute bottom-0 h-0.5 w-1/2 rounded-full bg-violet-400 shadow-[0_0_12px_rgba(167,139,250,0.85)] transition-transform duration-300 ease-out ${
              tab === "board" ? "translate-x-full" : "translate-x-0"
            }`}
          />
        </div>

        {/* 2단 대시보드: 좌측은 활성 탭의 피드, 우측은 탭과 무관하게 항상 떠 있는 사이드바.
            max-w-6xl로 이 아래 영역만의 가로폭을 고정해 탭 바 위 헤더와 무관하게 화면 중심이
            흔들리지 않게 하고, items-start로 두 컬럼이 서로의 높이에 맞춰 늘어나지 않게 한다. */}
        <div className="mx-auto mt-6 grid max-w-6xl grid-cols-1 items-start gap-6 lg:grid-cols-12">
          <div className="lg:col-span-8">
            {tab === "dream" ? (
              <div>
                {/* 자유 광장과 동일한 검색 바 - 공통 컴포넌트(CommunitySearchBar)를 그대로 재사용한다. */}
                <CommunitySearchBar
                  searchType={dreamSearchType}
                  onSearchTypeChange={setDreamSearchType}
                  keyword={dreamSearchKeyword}
                  onKeywordChange={setDreamSearchKeyword}
                  onSubmit={handleDreamSearchSubmit}
                />

                <CommunitySortChips
                  sort={dreamQuery.sort}
                  onSortChange={handleDreamSortChange}
                  period={dreamQuery.period}
                  onPeriodChange={handleDreamPeriodChange}
                />

                <CommunityTagFilterBar
                  topTags={dreamTopTags}
                  isTagActive={(tag) => dreamQuery.searchType === "hashtag" && dreamQuery.keyword === tag}
                  isAllActive={dreamQuery.searchType === undefined}
                  onSelectAll={handleClearDreamSearch}
                  onSelectTag={handleClickDreamTopTag}
                  onOpenMore={() => setIsAllTagsModalOpen(true)}
                />

                <div className="flex flex-col">
                  {isLoadingDreams ? (
                    Array.from({ length: 5 }, (_, index) => (
                      <div key={index} className="h-14 animate-pulse border-b border-white/10 bg-white/[0.02]" />
                    ))
                  ) : dreams.length > 0 ? (
                    dreams.map((dream) => {
                      const preview = dreamListPreview(dream);
                      return confirmDeleteDreamId === dream.id ? (
                        <div
                          key={dream.id}
                          className="flex items-center justify-between gap-3 border-b border-white/10 bg-red-500/10 px-2 py-3"
                        >
                          <span className="text-xs text-red-200">
                            "{dream.title}" 공개를 취소할까요? 꿈 기록소의 원본은 그대로 남고, 꿈 게시판에서만 사라져요.
                          </span>
                          <div className="flex shrink-0 gap-3">
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteDreamId(null)}
                              disabled={isDeletingDream}
                              className="text-xs text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline disabled:opacity-50"
                            >
                              취소
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteDream(dream.id)}
                              disabled={isDeletingDream}
                              className="text-xs font-semibold text-red-300 underline-offset-2 hover:text-red-200 hover:underline disabled:opacity-50"
                            >
                              {isDeletingDream ? "전환 중..." : "네, 비공개로 전환할게요"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div
                          key={dream.id}
                          role="link"
                          tabIndex={0}
                          onClick={() => goToDetail(`/community/post?id=${dream.id}`)}
                          onKeyDown={(event) => {
                            if (event.key !== "Enter") return;
                            goToDetail(`/community/post?id=${dream.id}`);
                          }}
                          className="flex cursor-pointer items-center justify-between gap-4 border-b border-white/10 px-2 py-3 transition-colors hover:bg-white/5"
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-3">
                            {/* 자유 광장 리스트의 "글 번호" 자리를 대신해, 좌측에 이 꿈의 메인 감정
                                이모지를 배치한다 - 무의식 피드 행임을 한눈에 구분해 준다. */}
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/5 text-lg">
                              {dream.attached_flower ? (
                                <FlowerIcon
                                  archetype={dream.attached_flower.archetype}
                                  genus={dream.attached_flower.genus}
                                  speciesName={dream.attached_flower.species_name}
                                  isLegendary={dream.attached_flower.is_legendary}
                                  sizePx={26}
                                />
                              ) : (
                                dream.emotion
                              )}
                            </span>
                            <div className="min-w-0 flex-1">
                              <span className="inline-flex min-w-0 flex-wrap items-baseline gap-1.5">
                                <span className="truncate text-lg font-bold text-slate-100 hover:underline">{dream.title}</span>
                                {dream.attached_flower ? (
                                  <span className="inline-flex shrink-0 items-center gap-1 rounded bg-emerald-900 px-2 text-xs text-emerald-200">
                                    🌸 꽃
                                  </span>
                                ) : (
                                  <span className="inline-flex shrink-0 items-center gap-1 rounded bg-purple-900 px-2 text-xs text-purple-200">
                                    <Moon className="h-3 w-3" strokeWidth={1.5} />
                                    꿈 기록
                                  </span>
                                )}
                                {dream.comment_count > 0 && (
                                  <span className="shrink-0 text-sm font-semibold text-violet-400">[{dream.comment_count}]</span>
                                )}
                              </span>
                              {preview && (
                                <div className="relative mt-0.5">
                                  <p className="line-clamp-1 overflow-hidden text-ellipsis text-sm text-slate-400">
                                    {preview}
                                  </p>
                                  {/* 자유 광장과 동일한 페이드아웃 + 낚시글 스포일러 방지 로직 -
                                      첫 줄만 잘라 보여주고 우측 끝을 리스트 배경색으로 흐려지게 한다. */}
                                  <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-slate-950 to-transparent" />
                                </div>
                              )}
                              <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
                                {dream.is_anonymous ? (
                                  <AuthorBadge isAnonymous displayName={null} badge={null} />
                                ) : (
                                  <UserDreamProfileModal nickname={dream.author_display_name!}>
                                    <AuthorBadge
                                      isAnonymous={false}
                                      displayName={dream.author_display_name}
                                      badge={dream.author_badge}
                                    />
                                  </UserDreamProfileModal>
                                )}
                                <span>· {dream.dream_date}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-3">
                            {dream.is_mine && (
                              <div className="flex items-center gap-3 text-[11px] text-slate-500">
                                {/* 자유 게시판과 동일하게(POST_EDIT_WINDOW_MS), 서버(update_dream)가
                                    게시 10분 후 수정을 403으로 거절하므로 링크 자체를 미리 숨긴다. */}
                                {Date.now() - new Date(dream.created_at).getTime() < POST_EDIT_WINDOW_MS && (
                                  <Link
                                    href={`/community/post?id=${dream.id}&edit=1`}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      markBackNavOrigin("list");
                                    }}
                                    aria-label="수정"
                                    className="transition-colors hover:text-violet-300"
                                  >
                                    <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} />
                                  </Link>
                                )}
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setConfirmDeleteDreamId(dream.id);
                                  }}
                                  aria-label="삭제"
                                  className="transition-colors hover:text-red-300"
                                >
                                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                                </button>
                              </div>
                            )}
                            {/* 좋아요/댓글/조회수를 한 자리에 모아, 어느 글이 지금 활발한지 한눈에 비교할 수 있게 한다. */}
                            <span className="flex items-center gap-2 whitespace-nowrap text-xs text-slate-400">
                              <span className="inline-flex items-center gap-0.5">
                                <ThumbsUp className="h-3 w-3" strokeWidth={1.5} />
                                {dream.upvote_count}
                              </span>
                              <span className="inline-flex items-center gap-0.5">
                                <MessageCircle className="h-3 w-3" strokeWidth={1.5} />
                                {dream.comment_count}
                              </span>
                              <span className="inline-flex items-center gap-0.5">
                                <Eye className="h-3 w-3" strokeWidth={1.5} />
                                {dream.view_count}
                              </span>
                            </span>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-10 text-center">
                      <p className="text-xs text-slate-500">
                        {dreamQuery.keyword
                          ? "검색 결과가 없어요. 다른 조건으로 찾아보세요."
                          : "아직 공개된 꿈이 없어요. 꿈 기록소에서 첫 공개 기록을 남겨보세요."}
                      </p>
                    </div>
                  )}
                </div>

                <Paginator page={dreamQuery.page} totalPages={dreamTotalPages} onChange={handleDreamPageChange} />
              </div>
            ) : (
              <div>
                <CommunitySearchBar
                  searchType={searchType}
                  onSearchTypeChange={setSearchType}
                  keyword={searchKeyword}
                  onKeywordChange={setSearchKeyword}
                  onSubmit={handleSearchSubmit}
                />

                <CommunitySortChips
                  sort={postQuery.sort}
                  onSortChange={handleSortChange}
                  period={postQuery.period}
                  onPeriodChange={handlePeriodChange}
                />

                <CommunityTagFilterBar
                  topTags={topTags}
                  isTagActive={(tag) => postQuery.searchType === "hashtag" && postQuery.keyword === tag}
                  isAllActive={postQuery.searchType === undefined}
                  onSelectAll={handleClearSearch}
                  onSelectTag={handleClickTopTag}
                  onOpenMore={() => setIsAllTagsModalOpen(true)}
                />

              <div className="flex flex-col">
                {isLoadingPosts ? (
                  Array.from({ length: 5 }, (_, index) => (
                    <div key={index} className="h-14 animate-pulse border-b border-white/10 bg-white/[0.02]" />
                  ))
                ) : posts.length > 0 ? (
                  posts.map((post) =>
                    confirmDeletePostId === post.id ? (
                      <div
                        key={post.id}
                        className="flex items-center justify-between gap-3 border-b border-white/10 bg-red-500/10 px-2 py-3"
                      >
                        <span className="text-xs text-red-200">"{post.title}" 글을 정말 삭제할까요?</span>
                        <div className="flex shrink-0 gap-3">
                          <button
                            type="button"
                            onClick={() => setConfirmDeletePostId(null)}
                            disabled={isDeletingPost}
                            className="text-xs text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline disabled:opacity-50"
                          >
                            취소
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeletePost(post.id)}
                            disabled={isDeletingPost}
                            className="text-xs font-semibold text-red-300 underline-offset-2 hover:text-red-200 hover:underline disabled:opacity-50"
                          >
                            {isDeletingPost ? "삭제 중..." : "네, 삭제할게요"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        key={post.id}
                        role="link"
                        tabIndex={0}
                        onClick={() => goToDetail(`/community/board-post?id=${post.id}`)}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter") return;
                          goToDetail(`/community/board-post?id=${post.id}`);
                        }}
                        className="flex cursor-pointer items-center justify-between gap-4 border-b border-white/10 px-2 py-3 transition-colors hover:bg-white/5"
                      >
                        <div className="min-w-0 flex-1">
                          <span className="inline-flex min-w-0 items-baseline gap-1.5">
                            <span className="truncate text-lg font-bold text-slate-100 hover:underline">{post.title}</span>
                            {post.comment_count > 0 && (
                              <span className="shrink-0 text-sm font-semibold text-violet-400">[{post.comment_count}]</span>
                            )}
                          </span>
                          {firstLine(post.content).length >= 20 && (
                            <div className="relative mt-0.5">
                              <p className="line-clamp-1 overflow-hidden text-ellipsis text-sm text-slate-400">
                                {firstLine(post.content)}
                              </p>
                              {/* 우측 끝을 리스트 배경색(slate-950)으로 페이드아웃시켜 텍스트가 갑자기
                                  잘리지 않고 스르륵 사라지는 것처럼 보이게 한다 - 호기심을 자극하는
                                  의도적인 "제한적 노출" 장치. */}
                              <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-slate-950 to-transparent" />
                            </div>
                          )}
                          <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
                            {post.is_anonymous ? (
                              <AuthorBadge isAnonymous displayName={null} badge={null} />
                            ) : (
                              <UserDreamProfileModal nickname={post.author_display_name!}>
                                <AuthorBadge
                                  isAnonymous={false}
                                  displayName={post.author_display_name}
                                  badge={post.author_badge}
                                />
                              </UserDreamProfileModal>
                            )}
                            <span>· {formatPostTime(post.created_at)}</span>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          {post.is_mine && (
                            <div className="flex items-center gap-3 text-[11px] text-slate-500">
                              {/* 서버(update_community_post)가 게시 10분 후 수정을 403으로 거절하므로,
                                  프론트도 같은 기준(POST_EDIT_WINDOW_MS)으로 링크 자체를 미리 숨긴다. */}
                              {Date.now() - new Date(post.created_at).getTime() < POST_EDIT_WINDOW_MS && (
                                <Link
                                  href={`/community/board-post?id=${post.id}&edit=1`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    markBackNavOrigin("list");
                                  }}
                                  aria-label="수정"
                                  className="transition-colors hover:text-violet-300"
                                >
                                  <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} />
                                </Link>
                              )}
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setConfirmDeletePostId(post.id);
                                }}
                                aria-label="삭제"
                                className="transition-colors hover:text-red-300"
                              >
                                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                              </button>
                            </div>
                          )}
                          {/* 좋아요/댓글/조회수를 한 자리에 모아, 어느 글이 지금 활발한지 한눈에 비교할 수 있게 한다. */}
                          <span className="flex items-center gap-2 whitespace-nowrap text-xs text-slate-400">
                            <span className="inline-flex items-center gap-0.5">
                              <ThumbsUp className="h-3 w-3" strokeWidth={1.5} />
                              {post.upvote_count}
                            </span>
                            <span className="inline-flex items-center gap-0.5">
                              <MessageCircle className="h-3 w-3" strokeWidth={1.5} />
                              {post.comment_count}
                            </span>
                            <span className="inline-flex items-center gap-0.5">
                              <Eye className="h-3 w-3" strokeWidth={1.5} />
                              {post.view_count}
                            </span>
                          </span>
                        </div>
                      </div>
                    )
                  )
                ) : (
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-10 text-center">
                    <p className="text-xs text-slate-500">
                      {postQuery.keyword ? "검색 결과가 없어요. 다른 조건으로 찾아보세요." : "아직 작성된 글이 없어요."}
                    </p>
                    <button
                      type="button"
                      onClick={() => requireLoginThen("/community/write?type=board")}
                      className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-purple-600 px-5 py-2 text-xs font-medium text-white transition-colors hover:bg-purple-500"
                    >
                      <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} />
                      첫 이야기 남기기
                    </button>
                  </div>
                )}
              </div>

              <Paginator page={postQuery.page} totalPages={postTotalPages} onChange={handlePageChange} />
              </div>
            )}
          </div>

          {/* 사이드바: 탭과 무관하게 항상 노출 - 메인 액션(탭에 따라 내 꿈 공유하기/글쓰기로 전환) +
              실시간 트렌드 위젯. flex flex-col gap-4로 묶어 두 박스의 가로 너비를 완벽히 일치시키고
              수직 간격을 통일한다. */}
          <aside className="lg:col-span-4">
            <div className="flex flex-col gap-4 lg:sticky lg:top-6">
              {tab === "dream" ? (
                <button
                  type="button"
                  onClick={() => requireLoginThen("/community/write?type=dream")}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 py-3 font-medium text-white shadow-lg transition-all hover:from-purple-700 hover:to-indigo-700"
                >
                  <SquarePen className="h-4 w-4 text-white" strokeWidth={1.75} />
                  내 꿈 공유하기
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => requireLoginThen("/community/write?type=board")}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 py-3 font-medium text-white shadow-lg transition-all hover:from-purple-700 hover:to-indigo-700"
                >
                  <SquarePen className="h-4 w-4 text-white" strokeWidth={1.75} />
                  글쓰기
                </button>
              )}

              <SidebarBestList />
            </div>
          </aside>
        </div>
    </>
  );

  return (
    <div className="relative min-h-screen bg-slate-950 text-slate-100">
      <NavBar />

      <main className="mx-auto max-w-7xl px-4 py-12">
        <h1 className="text-2xl font-semibold text-white">커뮤니티</h1>
        <p className="mt-1.5 text-sm text-slate-400">다른 탐험가들의 꿈을 둘러보고, 자유롭게 이야기를 나눠보세요.</p>

        {/* 리스트(제목/태그/작성일/좋아요)는 비로그인 유저도 자유롭게 볼 수 있다 - 상세 진입과
            글쓰기만 goToDetail/requireLoginThen에서 로그인 모달로 막는다. */}
        {feedSection}
      </main>

      {/* 어느 탭에서 "+ 태그 더보기"를 열었는지는 tab 값으로 판단한다 - 두 탭이 이 모달 하나를 공유한다. */}
      {isAllTagsModalOpen && (
        <AllTagsModal
          source={tab === "dream" ? "dream" : "board"}
          onClose={() => setIsAllTagsModalOpen(false)}
          onSelectTag={(tag) => {
            if (tab === "dream") {
              handleClickDreamTopTag(tag);
            } else {
              handleClickTopTag(tag);
            }
            setIsAllTagsModalOpen(false);
          }}
        />
      )}
    </div>
  );
}
