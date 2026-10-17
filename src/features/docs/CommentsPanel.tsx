import { useEditorState, type Editor } from '@tiptap/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../app/ui/Icon.tsx';
import type { DocComment } from '../../domain/richDoc.ts';
import { commentRanges, markComment, newCommentId, unmarkComment } from './comments.ts';

interface Props {
  editor: Editor;
  comments: DocComment[];
  readOnly: boolean;
  active: string | null;
  /** Selección que se va a comentar (formulario de comentario nuevo abierto). */
  draft: { from: number; to: number } | null;
  onChange: (comments: DocComment[]) => void;
  onActivate: (id: string | null) => void;
  onCancelDraft: () => void;
  onClose: () => void;
  /** Pestaña donde está el texto de un hilo que no está en la activa (null si se borró). */
  tabOf: (id: string) => { id: string; title: string } | null;
  onSwitchTab: (id: string) => void;
}

const QUOTE_MAX = 90;

/**
 * Panel de comentarios (fase 8.3): hilos en el orden del documento, los que perdieron su texto
 * al final y los resueltos aparte. Pulsar un hilo selecciona su texto en la hoja.
 */
export function CommentsPanel({
  editor,
  comments,
  readOnly,
  active,
  draft,
  onChange,
  onActivate,
  onCancelDraft,
  onClose,
  tabOf,
  onSwitchTab,
}: Props) {
  const { t, i18n } = useTranslation();
  const [text, setText] = useState('');
  const ranges = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      commentRanges(e.state.doc).map((r) => ({
        ...r,
        quote: e.state.doc.textBetween(r.from, r.to, ' '),
      })),
  });
  const firstRange = (id: string) => ranges.find((r) => r.id === id);
  const quoteOf = (id: string) => {
    const quote = ranges
      .filter((r) => r.id === id)
      .map((r) => r.quote)
      .join(' … ');
    return quote.length > QUOTE_MAX ? `${quote.slice(0, QUOTE_MAX)}…` : quote;
  };
  const date = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(iso),
    );

  const open = comments
    .filter((c) => !c.resolved)
    .sort((a, b) => (firstRange(a.id)?.from ?? Infinity) - (firstRange(b.id)?.from ?? Infinity));
  const resolved = comments.filter((c) => c.resolved);

  const update = (id: string, change: (c: DocComment) => DocComment) =>
    onChange(comments.map((c) => (c.id === id ? change(c) : c)));

  const select = (id: string) => {
    onActivate(id);
    const range = firstRange(id);
    if (!range) {
      // El texto está en otra pestaña: se va a ella.
      const tab = tabOf(id);
      if (tab) onSwitchTab(tab.id);
      return;
    }
    editor.chain().setTextSelection(range).scrollIntoView().run();
  };

  const save = () => {
    const value = text.trim();
    if (!draft || !value) return;
    const id = newCommentId();
    markComment(editor, draft, id);
    onChange([...comments, { id, text: value, createdAt: new Date().toISOString() }]);
    setText('');
    onCancelDraft();
    onActivate(id);
  };

  const thread = (comment: DocComment) => (
    <li
      key={comment.id}
      className={`doc-comment-thread${active === comment.id ? ' is-active' : ''}`}
      data-testid="doc-comment-thread"
      data-comment-id={comment.id}
    >
      <button type="button" className="doc-comment-quote link-button" onClick={() => select(comment.id)}>
        {firstRange(comment.id)
          ? `«${quoteOf(comment.id)}»`
          : tabOf(comment.id)
            ? t('docs.commentInTab', { title: tabOf(comment.id)!.title })
            : t('docs.commentOrphan')}
      </button>
      <p className="doc-comment-text" data-testid="doc-comment-text">
        {comment.text}
      </p>
      <p className="muted small">{date(comment.createdAt)}</p>
      {(comment.replies ?? []).map((reply) => (
        <div key={reply.id} className="doc-comment-reply" data-testid="doc-comment-reply">
          <p className="doc-comment-text">{reply.text}</p>
          <p className="muted small">{date(reply.createdAt)}</p>
        </div>
      ))}
      {!readOnly && <ThreadActions comment={comment} onUpdate={update} onDelete={remove} />}
    </li>
  );

  const remove = (id: string) => {
    if (!window.confirm(t('docs.commentDeleteConfirm'))) return;
    unmarkComment(editor, id);
    onChange(comments.filter((c) => c.id !== id));
    if (active === id) onActivate(null);
  };

  return (
    <aside className="doc-comments" aria-label={t('docs.comments')} data-testid="doc-comments">
      <header>
        <h2>{t('docs.comments')}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label={t('docs.commentsClose')}
          title={t('docs.commentsClose')}
          onClick={onClose}
        >
          <Icon name="cerrar" size={16} />
        </button>
      </header>
      {draft && !readOnly && (
        <form
          className="doc-comment-form"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <p className="doc-comment-quote">«{editor.state.doc.textBetween(draft.from, draft.to, ' ').slice(0, QUOTE_MAX)}»</p>
          <textarea
            autoFocus
            value={text}
            rows={3}
            maxLength={10_000}
            placeholder={t('docs.commentPlaceholder')}
            aria-label={t('docs.commentPlaceholder')}
            data-testid="doc-comment-input"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save();
              if (e.key === 'Escape') onCancelDraft();
            }}
          />
          <div className="doc-comment-buttons">
            <button type="submit" className="primary" disabled={!text.trim()} data-testid="doc-comment-save">
              {t('docs.commentSave')}
            </button>
            <button type="button" onClick={onCancelDraft}>
              {t('title.cancel')}
            </button>
          </div>
        </form>
      )}
      {open.length === 0 && resolved.length === 0 && !draft && (
        <p className="muted small">{t('docs.commentsEmpty')}</p>
      )}
      <ul className="doc-comment-list">{open.map(thread)}</ul>
      {resolved.length > 0 && (
        <details className="doc-comments-resolved">
          <summary>{t('docs.commentsResolved', { count: resolved.length })}</summary>
          <ul className="doc-comment-list">{resolved.map(thread)}</ul>
        </details>
      )}
    </aside>
  );
}

/** Responder, resolver o reabrir y eliminar un hilo. */
function ThreadActions({
  comment,
  onUpdate,
  onDelete,
}: {
  comment: DocComment;
  onUpdate: (id: string, change: (c: DocComment) => DocComment) => void;
  onDelete: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [reply, setReply] = useState('');
  const send = () => {
    const value = reply.trim();
    if (!value) return;
    onUpdate(comment.id, (c) => ({
      ...c,
      replies: [...(c.replies ?? []), { id: newCommentId(), text: value, createdAt: new Date().toISOString() }],
    }));
    setReply('');
  };
  return (
    <div className="doc-comment-actions">
      {!comment.resolved && (
        <form
          className="doc-comment-reply-form"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <input
            value={reply}
            maxLength={10_000}
            placeholder={t('docs.commentReply')}
            aria-label={t('docs.commentReply')}
            data-testid="doc-comment-reply-input"
            onChange={(e) => setReply(e.target.value)}
          />
        </form>
      )}
      <div className="doc-comment-buttons">
        <button
          type="button"
          data-testid="doc-comment-resolve"
          onClick={() =>
            onUpdate(comment.id, (c) => {
              const next = { ...c };
              if (c.resolved) delete next.resolved;
              else next.resolved = true;
              return next;
            })
          }
        >
          {comment.resolved ? t('docs.commentReopen') : t('docs.commentResolve')}
        </button>
        <button type="button" className="danger" data-testid="doc-comment-delete" onClick={() => onDelete(comment.id)}>
          {t('docs.commentDelete')}
        </button>
      </div>
    </div>
  );
}
