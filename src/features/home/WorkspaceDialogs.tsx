import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { logDiagnostic } from '../../app/runtime.ts';
import type { AppServices } from '../../app/services.ts';
import { useUiStore } from '../../app/store.ts';
import { Icon, KindIcon } from '../../app/ui/Icon.tsx';
import {
  exportWorkspacePackage,
  exportWorkspaceReadable,
  importWorkspacePackage,
  PackagePasswordError,
  readWorkspacePackage,
  type ImportSummary,
} from '../../app/workspaceShare.ts';
import { homeWorkspaces } from '../../application/home.ts';
import { reachesTarget } from '../../application/KnowledgeService.ts';
import { planImport, type ReadPackage } from '../../application/workspacePackage.ts';
import { EVENT_COLORS } from '../../domain/calendar.ts';
import type { DocumentRecord } from '../../domain/revision.ts';
import { withMembers } from '../../domain/workspace.ts';
import { describeError } from '../../ports/Diagnostics.ts';

/** «Añadir a un entorno» (plan 12.2): uno o varios entornos, o uno nuevo en el momento. */
export function AddToWorkspaceDialog({
  services,
  items,
  onDone,
  onClose,
}: {
  services: AppServices;
  items: DocumentRecord[];
  onDone: (workspaceIds: string[]) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const documents = useUiStore((s) => s.documents);
  const workspaces = useMemo(() => homeWorkspaces(documents), [documents]);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [newTitle, setNewTitle] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const ids = [...chosen];
      if (newTitle.trim()) {
        const color = EVENT_COLORS[workspaces.length % EVENT_COLORS.length]!;
        const created = await services.service.createWorkspace(newTitle.trim(), color);
        useUiStore.getState().upsertDocument(created);
        ids.push(created.id);
      }
      for (const id of ids) {
        await services.service.updateWorkspace(id, (w) =>
          withMembers(
            w,
            items.map((d) => d.id),
          ),
        );
      }
      onDone(ids);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-workspace-title"
        data-testid="add-workspace-dialog"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <h2 id="add-workspace-title">
          {items.length === 1
            ? t('workspaces.addOne', { title: items[0]!.title })
            : t('workspaces.addMany', { count: items.length })}
        </h2>
        {workspaces.length > 0 && (
          <ul className="picker-list workspace-pick">
            {workspaces.map((w) => (
              <li key={w.id}>
                <label className="inline-option">
                  <input
                    type="checkbox"
                    data-testid="add-workspace-option"
                    checked={chosen.has(w.id)}
                    onChange={() =>
                      setChosen((prev) => {
                        const next = new Set(prev);
                        if (next.has(w.id)) next.delete(w.id);
                        else next.add(w.id);
                        return next;
                      })
                    }
                  />
                  <Icon name="entorno" size={16} /> {w.title}
                </label>
              </li>
            ))}
          </ul>
        )}
        <input
          name="new-workspace-title"
          value={newTitle}
          placeholder={t('workspaces.newPlaceholder')}
          aria-label={t('workspaces.newPlaceholder')}
          data-testid="add-workspace-new"
          maxLength={300}
          onChange={(e) => setNewTitle(e.target.value)}
        />
        <div className="dialog-actions">
          <span className="topbar-spacer" />
          <button type="button" onClick={onClose}>
            {t('title.cancel')}
          </button>
          <button
            type="button"
            className="primary"
            data-testid="add-workspace-confirm"
            disabled={busy || (chosen.size === 0 && !newTitle.trim())}
            onClick={() => void run()}
          >
            {t('workspaces.add')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Un enlace de un miembro que lleva fuera del entorno: quedará roto para quien lo reciba. */
interface OutsideLink {
  from: DocumentRecord;
  to: DocumentRecord;
}

/**
 * «Compartir» un entorno (plan 12.3–12.6): qué entra, qué enlaces llevan fuera (con la opción de
 * añadir sus destinos), y las dos descargas: el paquete `.aline` para otro aline (historial y
 * contraseña opcionales) y un ZIP legible para quien no usa aline.
 */
export function ShareWorkspaceDialog({
  services,
  workspace,
  members,
  onClose,
}: {
  services: AppServices;
  workspace: DocumentRecord;
  members: DocumentRecord[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [outside, setOutside] = useState<OutsideLink[] | null>(null);
  const [history, setHistory] = useState(false);
  const [encrypt, setEncrypt] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const memberIds = useMemo(() => new Set(members.map((d) => d.id)), [members]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const found = new Map<string, OutsideLink>();
      for (const doc of members) {
        for (const r of await services.knowledge.outgoing(doc.id)) {
          const to = r.target;
          if (!to || !reachesTarget(r.status) || memberIds.has(to.id) || to.kind === 'workspace') {
            continue;
          }
          found.set(`${doc.id}>${to.id}`, { from: doc, to });
        }
      }
      if (!cancelled) setOutside([...found.values()]);
    })();
    return () => {
      cancelled = true;
    };
  }, [services, members, memberIds]);

  const addTarget = async (to: DocumentRecord) => {
    await services.service.updateWorkspace(workspace.id, (w) => withMembers(w, [to.id]));
    setOutside((list) => list?.filter((l) => l.to.id !== to.id) ?? null);
  };

  const passwordOk = !encrypt || (password.length >= 8 && password === confirm);
  const run = async (kind: 'package' | 'readable') => {
    setBusy(true);
    setError(false);
    setDone(null);
    try {
      if (kind === 'package') {
        await exportWorkspacePackage(services, workspace.id, workspace.title, {
          history,
          password: encrypt ? password : null,
        });
        setDone(t('workspaces.share.donePackage'));
      } else {
        await exportWorkspaceReadable(services, workspace.id, workspace.title, {
          tabLabel: (n) => t('docs.tabUntitled', { n }),
          upcoming: t('workspaces.share.upcoming'),
        });
        setDone(t('workspaces.share.doneReadable'));
      }
    } catch (e) {
      logDiagnostic('error', 'workspace-export', describeError(e));
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation">
      <div
        className="dialog share-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-title"
        data-testid="share-workspace-dialog"
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <h2 id="share-title">{t('workspaces.share.title', { title: workspace.title })}</h2>
        <p className="muted small">{t('workspaces.share.lead')}</p>
        <p data-testid="share-count">{t('workspaces.share.count', { count: members.length })}</p>
        {outside === null ? (
          <p className="muted small">{t('workspaces.share.checking')}</p>
        ) : outside.length > 0 ? (
          <div className="notice small" data-testid="share-outside">
            <p>{t('workspaces.share.outside', { count: outside.length })}</p>
            <ul className="share-outside-list">
              {outside.map((l) => (
                <li key={`${l.from.id}>${l.to.id}`}>
                  <KindIcon kind={l.from.kind} /> {l.from.title} → <KindIcon kind={l.to.kind} />{' '}
                  {l.to.title}{' '}
                  <button
                    type="button"
                    className="link-button"
                    data-testid="share-add-target"
                    onClick={() => void addTarget(l.to)}
                  >
                    {t('workspaces.share.addTarget')}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <fieldset>
          <legend>{t('workspaces.share.forAline')}</legend>
          <label className="inline-option">
            <input
              type="checkbox"
              checked={history}
              data-testid="share-history"
              onChange={(e) => setHistory(e.target.checked)}
            />
            {t('workspaces.share.history')}
          </label>
          <label className="inline-option">
            <input
              type="checkbox"
              checked={encrypt}
              data-testid="share-encrypt"
              onChange={(e) => setEncrypt(e.target.checked)}
            />
            {t('workspaces.share.encrypt')}
          </label>
          {encrypt && (
            <div className="share-password">
              <input
                type="password"
                name="share-password"
                autoComplete="new-password"
                value={password}
                placeholder={t('workspaces.share.password')}
                aria-label={t('workspaces.share.password')}
                data-testid="share-password"
                onChange={(e) => setPassword(e.target.value)}
              />
              <input
                type="password"
                name="share-password-confirm"
                autoComplete="new-password"
                value={confirm}
                placeholder={t('workspaces.share.confirm')}
                aria-label={t('workspaces.share.confirm')}
                data-testid="share-password-confirm"
                onChange={(e) => setConfirm(e.target.value)}
              />
              <p className="muted small">{t('workspaces.share.passwordHint')}</p>
            </div>
          )}
          <button
            type="button"
            className="primary"
            data-testid="share-package"
            disabled={busy || !passwordOk || members.length === 0}
            onClick={() => void run('package')}
          >
            <Icon name="descargar" size={18} />
            {t('workspaces.share.package')}
          </button>
        </fieldset>
        <fieldset>
          <legend>{t('workspaces.share.forOthers')}</legend>
          <p className="muted small">{t('workspaces.share.readableHint')}</p>
          <button
            type="button"
            data-testid="share-readable"
            disabled={busy || members.length === 0}
            onClick={() => void run('readable')}
          >
            <Icon name="descargar" size={18} />
            {t('workspaces.share.readable')}
          </button>
        </fieldset>
        {done && (
          <p className="small" role="status" data-testid="share-done">
            {done}
          </p>
        )}
        {error && (
          <p className="notice small" role="alert">
            {t('workspaces.share.failed')}
          </p>
        )}
        <div className="dialog-actions">
          <span className="topbar-spacer" />
          <button type="button" onClick={onClose}>
            {t('statusPanel.close')}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * «Importar un entorno» (plan 12.5): elegir el `.aline`, la contraseña si está cifrado, ver qué
 * trae (nuevo, se actualiza o ya está) e importarlo en el almacén abierto.
 */
export function ImportWorkspaceDialog({
  services,
  onImported,
  onClose,
}: {
  services: AppServices;
  onImported: (workspaceId: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [needsPassword, setNeedsPassword] = useState(false);
  const [pkg, setPkg] = useState<ReadPackage | null>(null);
  const [plan, setPlan] = useState<Record<'new' | 'update' | 'same', number> | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [busy, setBusy] = useState(false);

  const read = async (chosen: File, secret: string | null) => {
    setBusy(true);
    setProblem(null);
    try {
      const read = await readWorkspacePackage(chosen, secret);
      const local = await services.service.listDocuments();
      const marks = await services.service.packageImportMarks();
      const counts = { new: 0, update: 0, same: 0 };
      for (const p of planImport(
        local,
        read.content,
        new Map(Object.entries(marks).map(([id, m]) => [id, m.source])),
        new Set(local.flatMap((d) => d.headRevisionIds)),
      )) {
        counts[p.action]++;
      }
      setPkg(read);
      setPlan(counts);
      setNeedsPassword(false);
    } catch (e) {
      if (e instanceof PackagePasswordError) {
        setNeedsPassword(true);
        if (e.reason === 'wrong') setProblem(t('workspaces.import.wrongPassword'));
      } else {
        logDiagnostic('warn', 'workspace-import-read', describeError(e));
        setProblem(t('workspaces.import.unreadable'));
      }
    } finally {
      setBusy(false);
    }
  };

  const run = async () => {
    if (!pkg) return;
    setBusy(true);
    try {
      const result = await importWorkspacePackage(services, pkg);
      useUiStore.getState().setDocuments(await services.service.listDocuments());
      useUiStore.getState().bumpKnowledge();
      setSummary(result);
    } catch (e) {
      logDiagnostic('error', 'workspace-import', describeError(e));
      setProblem(t('workspaces.import.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation">
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-workspace-title"
        data-testid="import-workspace-dialog"
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <h2 id="import-workspace-title">{t('workspaces.import.title')}</h2>
        {!summary && (
          <>
            <p className="muted small">{t('workspaces.import.lead')}</p>
            <input
              type="file"
              name="import-workspace-file"
              accept=".aline"
              data-testid="import-workspace-file"
              onChange={(e) => {
                const chosen = e.target.files?.[0] ?? null;
                setFile(chosen);
                setPkg(null);
                setPlan(null);
                if (chosen) void read(chosen, null);
              }}
            />
            {needsPassword && file && (
              <form
                className="inline-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void read(file, password);
                }}
              >
                <input
                  type="password"
                  name="import-workspace-password"
                  autoComplete="off"
                  value={password}
                  placeholder={t('workspaces.share.password')}
                  aria-label={t('workspaces.share.password')}
                  data-testid="import-workspace-password"
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button type="submit" disabled={busy || !password}>
                  {t('workspaces.import.unlock')}
                </button>
              </form>
            )}
            {pkg && plan && (
              <div className="notice small" data-testid="import-workspace-preview">
                <p>
                  <strong>{pkg.manifest.title}</strong>
                  {pkg.manifest.history ? ` · ${t('workspaces.import.withHistory')}` : ''}
                </p>
                <p>
                  {t('workspaces.import.plan', {
                    created: plan.new,
                    updated: plan.update,
                    same: plan.same,
                  })}
                </p>
                {pkg.problems.length > 0 && (
                  <p>{t('workspaces.import.problems', { count: pkg.problems.length })}</p>
                )}
              </div>
            )}
          </>
        )}
        {summary && (
          <p role="status" data-testid="import-workspace-summary">
            {t('workspaces.import.done', {
              created: summary.created,
              updated: summary.updated,
              conflicts: summary.conflicts,
            })}
          </p>
        )}
        {problem && (
          <p className="notice small" role="alert" data-testid="import-workspace-problem">
            {problem}
          </p>
        )}
        <div className="dialog-actions">
          <span className="topbar-spacer" />
          {summary && pkg ? (
            <button
              type="button"
              className="primary"
              data-testid="import-workspace-open"
              onClick={() => onImported(pkg.manifest.workspaceId)}
            >
              {t('workspaces.import.open')}
            </button>
          ) : (
            <>
              <button type="button" onClick={onClose}>
                {t('title.cancel')}
              </button>
              <button
                type="button"
                className="primary"
                data-testid="import-workspace-confirm"
                disabled={busy || !pkg}
                onClick={() => void run()}
              >
                {t('workspaces.import.confirm')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
