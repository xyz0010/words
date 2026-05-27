import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookText, Clock3, PlayCircle, PlusCircle, Trash2, Loader2, X } from 'lucide-react';
import { passages } from '../data/passages';
import { createCustomPassage, loadCustomPassages, saveCustomPassages, splitPassageIntoSentences } from '../lib/passages';
import { translateToChineseDetailed } from '../services/translate';
import { Passage } from '../types/practice';

function looksTranslated(text: string, source: string) {
  const normalized = text.trim();
  const original = source.trim();
  if (!normalized) return false;
  if (normalized === original) return false;
  return /[\u4e00-\u9fff]/.test(normalized);
}

export function PassageLibrary() {
  const navigate = useNavigate();
  const [customPassages, setCustomPassages] = useState<Passage[]>(() => loadCustomPassages());
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({
    title: '',
    englishText: '',
  });

  useEffect(() => {
    saveCustomPassages(customPassages);
  }, [customPassages]);

  const allPassages = useMemo(() => [...customPassages, ...passages], [customPassages]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    const englishLines = splitPassageIntoSentences(form.englishText);

    if (!form.title.trim()) {
      setError('请填写短文标题');
      return;
    }

    if (englishLines.length === 0) {
      setError('请粘贴英文短文内容');
      return;
    }

    setIsSaving(true);
    setError('');

    try {
      const translationResults = await Promise.all(
        englishLines.map((sentence) => translateToChineseDetailed(sentence))
      );
      const translationLines = translationResults.map((result, index) =>
        looksTranslated(result.translation, englishLines[index]) ? result.translation : ''
      );
      const hasEnvMissing = translationResults.some((result) => result.source === 'env_missing');

      if (translationLines.every(line => !line)) {
        if (hasEnvMissing) {
          throw new Error('未配置有道官方翻译密钥，请先在 .env.local 中设置 YOUDAO_APP_KEY 和 YOUDAO_APP_SECRET');
        }
        throw new Error('翻译服务暂时没有返回中文，请稍后重试');
      }

      const passage = createCustomPassage({
        title: form.title,
        englishLines,
        translationLines,
      });

      setCustomPassages(prev => [passage, ...prev]);
      setForm({
        title: '',
        englishText: '',
      });
      setIsDialogOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '短文保存失败，请稍后重试');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (id: string) => {
    setCustomPassages(prev => prev.filter(passage => passage.id !== id));
  };

  const openDialog = () => {
    setError('');
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    if (isSaving) return;
    setError('');
    setIsDialogOpen(false);
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8">
      <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-3">
          <PlusCircle className="h-5 w-5 text-blue-600" />
          <div>
            <h3 className="text-lg font-semibold text-slate-800">新增我的短文</h3>
            <p className="text-sm text-slate-500">点击按钮后用弹框录入标题和英文原文，不占用短文列表区域。</p>
          </div>
        </div>
        <button
          type="button"
          onClick={openDialog}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-medium text-white shadow-md transition hover:bg-blue-700"
        >
          <PlusCircle className="h-4 w-4" />
          新增短文
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {allPassages.map((passage) => (
          <div
            key={passage.id}
            className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-blue-50 px-2.5 py-1 font-medium text-blue-700">
                    {passage.level}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600">
                    {passage.topic}
                  </span>
                  {passage.source === 'custom' && (
                    <span className="rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-700">
                      我添加的
                    </span>
                  )}
                </div>
                <h3 className="text-xl font-semibold text-slate-800">{passage.title}</h3>
              </div>
              <div className="flex items-center gap-2">
                {passage.source === 'custom' && (
                  <button
                    onClick={() => handleDelete(passage.id)}
                    className="rounded-full p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-500"
                    title="删除短文"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
                <BookText className="h-5 w-5 shrink-0 text-slate-400" />
              </div>
            </div>

            <p className="flex-1 text-sm leading-6 text-slate-600">{passage.description}</p>

            <div className="mt-5 flex items-center justify-between text-sm text-slate-500">
              <span>{passage.sentences.length} 句</span>
              <span className="inline-flex items-center gap-1">
                <Clock3 className="h-4 w-4" />
                约 {Math.max(2, passage.sentences.length)} 分钟
              </span>
            </div>

            <button
              onClick={() => navigate('/practice', { state: { practiceMode: 'passage', passage } })}
              className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-medium text-white shadow-md transition-all hover:bg-blue-700 hover:shadow-lg"
            >
              <PlayCircle className="h-4 w-4" />
              开始短文学习
            </button>
          </div>
        ))}
      </div>

      {isDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6">
          <div className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl sm:p-6 overscroll-behavior-none">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <PlusCircle className="h-5 w-5 text-blue-600" />
                <div>
                  <h3 className="text-lg font-semibold text-slate-800">新增我的短文</h3>
                  <p className="text-sm text-slate-500">只需要标题和英文原文，系统会自动分句并翻译中文。</p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeDialog}
                disabled={isSaving}
                className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="关闭弹框"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                value={form.title}
                onChange={(e) => setForm(prev => ({ ...prev, title: e.target.value }))}
                placeholder="短文标题"
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500"
              />

              <textarea
                value={form.englishText}
                onChange={(e) => setForm(prev => ({ ...prev, englishText: e.target.value }))}
                placeholder={'直接粘贴英文短文即可，系统会自动按句切分。\n\nEmma wakes up early every morning. She makes coffee and opens her laptop. At eight o\'clock, she starts working.'}
                rows={10}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm leading-6 outline-none transition focus:border-blue-500"
              />

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-slate-500">
                  保存时会自动调用翻译接口，短文较长时可能需要几秒钟。
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={closeDialog}
                    disabled={isSaving}
                    className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-5 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-medium text-white shadow-md transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
                    {isSaving ? '正在分句并翻译...' : '保存到短文库'}
                  </button>
                </div>
              </div>

              {error && <div className="text-sm text-red-500">{error}</div>}
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
