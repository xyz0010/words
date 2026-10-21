import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { deleteFavorite, fetchFavorites, fetchMistakes, fetchPracticeRecords, fetchProfileStats, getTodayLocalDate } from '../services/profile';
import { FavoriteSentence, MistakeStat, PracticeRecord, ProfileStats } from '../types/profile';
import { Bookmark, Loader2, RefreshCw, Trash2 } from 'lucide-react';

const PAGE_SIZE = 20;

export function ProfileCenter() {
  const { user, token } = useAuth();
  const today = useMemo(() => getTodayLocalDate(), []);
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [records, setRecords] = useState<PracticeRecord[]>([]);
  const [favorites, setFavorites] = useState<FavoriteSentence[]>([]);
  const [mistakes, setMistakes] = useState<MistakeStat[]>([]);
  const [recordsTotal, setRecordsTotal] = useState(0);
  const [favoritesTotal, setFavoritesTotal] = useState(0);
  const [mistakesTotal, setMistakesTotal] = useState(0);
  const [recordsLoadingMore, setRecordsLoadingMore] = useState(false);
  const [favoritesLoadingMore, setFavoritesLoadingMore] = useState(false);
  const [mistakesLoadingMore, setMistakesLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [s, r, f] = await Promise.all([
        fetchProfileStats(today),
        fetchPracticeRecords(PAGE_SIZE, 0),
        fetchFavorites({ limit: PAGE_SIZE, offset: 0 }),
      ]);
      const m = await fetchMistakes(PAGE_SIZE, 0);
      setStats(s);
      setRecords(r.records || []);
      setRecordsTotal(r.total || 0);
      setFavorites(f.favorites || []);
      setFavoritesTotal(f.total || 0);
      setMistakes(m.mistakes || []);
      setMistakesTotal(m.total || 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [user?.id, token]);

  const onRemoveFavorite = async (id: string) => {
    try {
      await deleteFavorite(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除失败');
    }
  };

  const loadMoreRecords = async () => {
    if (recordsLoadingMore || records.length >= recordsTotal) return;
    setRecordsLoadingMore(true);
    try {
      const next = await fetchPracticeRecords(PAGE_SIZE, records.length);
      setRecords((prev) => [...prev, ...(next.records || [])]);
      setRecordsTotal(next.total || 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载更多练习失败');
    } finally {
      setRecordsLoadingMore(false);
    }
  };

  const loadMoreFavorites = async () => {
    if (favoritesLoadingMore || favorites.length >= favoritesTotal) return;
    setFavoritesLoadingMore(true);
    try {
      const next = await fetchFavorites({ limit: PAGE_SIZE, offset: favorites.length });
      setFavorites((prev) => [...prev, ...(next.favorites || [])]);
      setFavoritesTotal(next.total || 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载更多收藏失败');
    } finally {
      setFavoritesLoadingMore(false);
    }
  };

  const loadMoreMistakes = async () => {
    if (mistakesLoadingMore || mistakes.length >= mistakesTotal) return;
    setMistakesLoadingMore(true);
    try {
      const next = await fetchMistakes(PAGE_SIZE, mistakes.length);
      setMistakes((prev) => [...prev, ...(next.mistakes || [])]);
      setMistakesTotal(next.total || 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载更多易错词失败');
    } finally {
      setMistakesLoadingMore(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 text-slate-500">
        <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
        <div className="text-sm">正在加载个人中心数据...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-800 sm:text-2xl">个人中心</h2>
          <p className="mt-1 text-sm text-gray-600 sm:text-base">
            {user ? `当前账号：${user.username}` : '未登录：当前展示的是默认用户数据'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" />
            刷新
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">今日练习</div>
          <div className="mt-2 text-3xl font-bold text-slate-800">{stats?.todaySentencesCompleted ?? 0}</div>
          <div className="mt-1 text-xs text-slate-500">{stats?.todayLocalDate || today}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">累计练习</div>
          <div className="mt-2 text-3xl font-bold text-slate-800">{stats?.totalSentencesCompleted ?? 0}</div>
          <div className="mt-1 text-xs text-slate-500">完成例句次数</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">连续天数</div>
          <div className="mt-2 text-3xl font-bold text-slate-800">{stats?.streakDays ?? 0}</div>
          <div className="mt-1 text-xs text-slate-500">连续练习天</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">收藏例句</div>
          <div className="mt-2 text-3xl font-bold text-slate-800">{stats?.favoriteSentenceCount ?? favorites.length}</div>
          <div className="mt-1 text-xs text-slate-500">已收藏</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-800">最近练习</div>
            <div className="text-xs text-slate-500">已显示 {records.length} / {recordsTotal}</div>
          </div>
          {records.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">暂无练习记录</div>
          ) : (
            <div className="mt-3 space-y-3">
              {records.map((item) => (
                <div key={item.id} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3">
                  <div className="text-sm font-medium text-slate-800">{item.sentence}</div>
                  {item.translation && <div className="mt-1 text-xs text-slate-500">{item.translation}</div>}
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500">
                    <span className="rounded bg-white px-2 py-0.5">来源：{item.source === 'passage' ? '短文' : 'AI'}</span>
                    {item.word && <span className="rounded bg-white px-2 py-0.5">单词：{item.word}</span>}
                    {item.scenario && <span className="rounded bg-white px-2 py-0.5">场景：{item.scenario}</span>}
                    {item.durationMs && <span className="rounded bg-white px-2 py-0.5">用时：{Math.round(item.durationMs / 1000)}s</span>}
                  </div>
                </div>
              ))}
              {records.length < recordsTotal && (
                <button
                  onClick={() => void loadMoreRecords()}
                  disabled={recordsLoadingMore}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {recordsLoadingMore ? '加载中...' : '加载更多练习'}
                </button>
              )}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Bookmark className="h-4 w-4 text-blue-500" />
              收藏例句
            </div>
            <div className="text-xs text-slate-500">已显示 {favorites.length} / {favoritesTotal}</div>
          </div>

          {favorites.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">暂无收藏</div>
          ) : (
            <div className="mt-3 space-y-3">
              {favorites.map((item) => (
                <div key={item.id} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-slate-800">{item.sentence}</div>
                      {item.translation && <div className="mt-1 text-xs text-slate-500">{item.translation}</div>}
                      <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500">
                        <span className="rounded bg-white px-2 py-0.5">来源：{item.source === 'passage' ? '短文' : 'AI'}</span>
                        {item.word && <span className="rounded bg-white px-2 py-0.5">单词：{item.word}</span>}
                        {item.scenario && <span className="rounded bg-white px-2 py-0.5">场景：{item.scenario}</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => void onRemoveFavorite(item.id)}
                      className="inline-flex shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
                      title="取消收藏"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
              {favorites.length < favoritesTotal && (
                <button
                  onClick={() => void loadMoreFavorites()}
                  disabled={favoritesLoadingMore}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {favoritesLoadingMore ? '加载中...' : '加载更多收藏'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-800">易错词</div>
          <div className="text-xs text-slate-500">已显示 {mistakes.length} / {mistakesTotal}</div>
        </div>
        {mistakes.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-500">暂无统计</div>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {mistakes.map((item) => (
                <div key={item.word} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-800">{item.word}</div>
                    <div className="text-[11px] text-slate-500">错误次数：{item.count}</div>
                  </div>
                </div>
              ))}
            </div>
            {mistakes.length < mistakesTotal && (
              <button
                onClick={() => void loadMoreMistakes()}
                disabled={mistakesLoadingMore}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {mistakesLoadingMore ? '加载中...' : '加载更多易错词'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
