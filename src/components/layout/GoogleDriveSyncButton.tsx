'use client';

import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { buildBackupJson, importBackupText } from '@/lib/backup';

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID;
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';
const DRIVE_FOLDER_NAME = 'Yaplanner';
const BACKUP_FILE_NAME = 'yaplanner-backup.json';
const BACKUP_TARGET_STORAGE_KEY = 'yaplanner-google-drive-target';
const AUTO_SYNC_STORAGE_KEY = 'yaplanner-google-drive-auto-sync-minutes';
const AUTO_SYNC_OPTIONS = [5, 15, 30, 60] as const;

type DriveFile = {
  id: string;
  name: string;
  modifiedTime?: string;
  mimeType?: string;
  webViewLink?: string;
  resourceKey?: string;
};

type DriveFolder = {
  id: string;
  name: string;
  webViewLink?: string;
};

type BackupTarget = {
  fileId: string;
  resourceKey?: string;
  webViewLink?: string;
};

function formatTimestamp(value?: string) {
  if (!value) return 'Unknown';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function GoogleDriveSyncButton() {
  const tokenClientRef = useRef<GoogleTokenClient | null>(null);
  const accessTokenRef = useRef<string | null>(null);
  const tokenExpiresAtRef = useRef<number>(0);
  const configured = Boolean(CLIENT_ID);
  const initialTarget =
    typeof window !== 'undefined'
      ? (() => {
          const stored = window.localStorage.getItem(BACKUP_TARGET_STORAGE_KEY);
          if (!stored) return null;
          try {
            const parsed = JSON.parse(stored) as BackupTarget;
            return parsed.fileId ? parsed : null;
          } catch {
            window.localStorage.removeItem(BACKUP_TARGET_STORAGE_KEY);
            return null;
          }
        })()
      : null;
  const initialAutoSyncMinutes =
    typeof window !== 'undefined'
      ? (() => {
          const stored = window.localStorage.getItem(AUTO_SYNC_STORAGE_KEY);
          if (!stored) return 0;
          const parsed = Number(stored);
          return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
        })()
      : 0;

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [gisReady, setGisReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [driveFolder, setDriveFolder] = useState<DriveFolder | null>(null);
  const [latestBackup, setLatestBackup] = useState<DriveFile | null>(null);
  const [backupLinkInput, setBackupLinkInput] = useState(initialTarget?.webViewLink ?? initialTarget?.fileId ?? '');
  const [targetFile, setTargetFile] = useState<BackupTarget | null>(initialTarget);
  const [autoSyncMinutes, setAutoSyncMinutes] = useState<number>(initialAutoSyncMinutes);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (window.google?.accounts?.oauth2) {
        setGisReady(true);
      }
      if (window.google?.accounts?.oauth2) {
        window.clearInterval(interval);
      }
    }, 250);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const previousOverflow = document.body.style.overflow;
    if (open) {
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(AUTO_SYNC_STORAGE_KEY, String(autoSyncMinutes));
  }, [autoSyncMinutes]);

  function getTokenClient() {
    if (!CLIENT_ID) {
      throw new Error('Missing NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID.');
    }

    if (!window.google?.accounts?.oauth2) {
      throw new Error('Google sign-in library is still loading.');
    }

    if (!tokenClientRef.current) {
      tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: DRIVE_SCOPE,
        callback: () => {
          throw new Error('Token callback was not attached.');
        },
      });
    }

    return tokenClientRef.current;
  }

  async function getAccessToken(interactive: boolean) {
    if (accessTokenRef.current && Date.now() < tokenExpiresAtRef.current - 30_000) {
      return accessTokenRef.current;
    }

    getTokenClient();

    return await new Promise<string>((resolve, reject) => {
      tokenClientRef.current = window.google!.accounts!.oauth2!.initTokenClient({
        client_id: CLIENT_ID!,
        scope: DRIVE_SCOPE,
        callback: (response) => {
          if (response.error || !response.access_token) {
            reject(new Error(response.error_description || response.error || 'Google authentication failed.'));
            return;
          }

          accessTokenRef.current = response.access_token;
          tokenExpiresAtRef.current = Date.now() + response.expires_in * 1000;
          setSignedIn(true);
          resolve(response.access_token);
        },
        error_callback: () => {
          reject(new Error('Google authentication was cancelled or blocked.'));
        },
      });

      tokenClientRef.current.requestAccessToken({ prompt: interactive ? 'consent' : '' });
    });
  }

  function persistTargetFile(target: BackupTarget | null) {
    setTargetFile(target);
    if (typeof window === 'undefined') return;

    if (!target) {
      window.localStorage.removeItem(BACKUP_TARGET_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(BACKUP_TARGET_STORAGE_KEY, JSON.stringify(target));
  }

  function extractBackupTarget(value: string): BackupTarget | null {
    const trimmed = value.trim();
    if (!trimmed) return null;

    try {
      const url = new URL(trimmed);
      const fileMatch = url.pathname.match(/\/file\/d\/([^/]+)/);
      const fileId = fileMatch?.[1] ?? url.searchParams.get('id');
      const resourceKey = url.searchParams.get('resourcekey') ?? undefined;

      if (!fileId) return null;
      return {
        fileId,
        resourceKey,
        webViewLink: trimmed,
      };
    } catch {
      return {
        fileId: trimmed,
      };
    }
  }

  async function driveRequest(path: string, init: RequestInit = {}, interactive = false, target?: BackupTarget | null) {
    const token = await getAccessToken(interactive);
    const headers = new Headers(init.headers ?? {});
    headers.set('Authorization', `Bearer ${token}`);
    if (target?.resourceKey) {
      headers.set('X-Goog-Drive-Resource-Keys', `${target.fileId}/${target.resourceKey}`);
    }

    const response = await fetch(`https://www.googleapis.com${path}`, {
      ...init,
      headers,
    });

    if (response.status === 401 && !interactive) {
      accessTokenRef.current = null;
      tokenExpiresAtRef.current = 0;
      return driveRequest(path, init, true, target);
    }

    if (!response.ok) {
      const details = await response.text();
      throw new Error(`Google Drive request failed (${response.status}): ${details || response.statusText}`);
    }

    return response;
  }

  async function ensureDriveFolder(interactive = false) {
    const query = encodeURIComponent(
      `name='${DRIVE_FOLDER_NAME}' and mimeType='${FOLDER_MIME_TYPE}' and trashed=false`,
    );
    const fields = encodeURIComponent('files(id,name,mimeType,webViewLink)');
    const response = await driveRequest(
      `/drive/v3/files?q=${query}&fields=${fields}&orderBy=createdTime desc&pageSize=10`,
      undefined,
      interactive,
    );
    const payload = await response.json() as { files?: DriveFolder[] };
    const existing = payload.files?.[0] ?? null;

    if (existing) {
      setDriveFolder(existing);
      return existing;
    }

    const createResponse = await driveRequest('/drive/v3/files?fields=id,name,mimeType,webViewLink', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: DRIVE_FOLDER_NAME,
        mimeType: FOLDER_MIME_TYPE,
      }),
    }, interactive);
    const created = await createResponse.json() as DriveFolder;
    setDriveFolder(created);
    return created;
  }

  async function fetchTargetFileMetadata(target: BackupTarget, interactive = false) {
    const fields = 'id,name,modifiedTime,mimeType,webViewLink,resourceKey';
    const response = await driveRequest(
      `/drive/v3/files/${target.fileId}?fields=${encodeURIComponent(fields)}`,
      undefined,
      interactive,
      target,
    );
    const file = await response.json() as DriveFile;
    const nextTarget = {
      fileId: file.id,
      resourceKey: file.resourceKey ?? target.resourceKey,
      webViewLink: file.webViewLink ?? target.webViewLink,
    };
    persistTargetFile(nextTarget);
    setLatestBackup(file);
    if (nextTarget.webViewLink) {
      setBackupLinkInput(nextTarget.webViewLink);
    }
    return file;
  }

  async function listBackups(interactive = false) {
    if (targetFile) {
      const file = await fetchTargetFileMetadata(targetFile, interactive);
      return { folder: driveFolder, files: [file] };
    }

    const folder = await ensureDriveFolder(interactive);
    const query = encodeURIComponent(`name='${BACKUP_FILE_NAME}' and '${folder.id}' in parents and trashed=false`);
    const fields = encodeURIComponent('files(id,name,modifiedTime,mimeType,webViewLink,resourceKey)');
    const response = await driveRequest(
      `/drive/v3/files?q=${query}&fields=${fields}&orderBy=modifiedTime desc&pageSize=10`,
      undefined,
      interactive,
    );
    const payload = await response.json() as { files?: DriveFile[] };
    const files = payload.files ?? [];
    setLatestBackup(files[0] ?? null);
    if (files[0]) {
      persistTargetFile({
        fileId: files[0].id,
        resourceKey: files[0].resourceKey,
        webViewLink: files[0].webViewLink,
      });
      if (files[0].webViewLink) {
        setBackupLinkInput(files[0].webViewLink);
      }
    }
    return { folder, files };
  }

  async function handleConnect() {
    try {
      setBusy(true);
      setStatus('Connecting to Google Drive...');
      await getAccessToken(true);
      await listBackups(true);
      setStatus('Google Drive connected.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to connect to Google Drive.');
    } finally {
      setBusy(false);
    }
  }

  function applyBackupLink() {
    const nextTarget = extractBackupTarget(backupLinkInput);
    if (!nextTarget) {
      setStatus('Enter a valid Google Drive file link or file ID.');
      return;
    }

    persistTargetFile(nextTarget);
    setLatestBackup(null);
    setStatus(`Backup target updated to file ${nextTarget.fileId}.`);
  }

  function buildMultipartBody(metadata: Record<string, unknown>, json: string) {
    const boundary = `yaplanner-${crypto.randomUUID()}`;
    const body = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      JSON.stringify(metadata),
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      json,
      `--${boundary}--`,
      '',
    ].join('\r\n');

    return { boundary, body };
  }

  async function pushBackup(options?: { silent?: boolean }) {
    const silent = options?.silent ?? false;

    try {
      setBusy(true);
      if (!silent) {
        setStatus(`Saving backup to Google Drive/${DRIVE_FOLDER_NAME}...`);
      }
      const [json, backupInfo] = await Promise.all([buildBackupJson(), listBackups(signedIn ? false : true)]);
      const { folder, files } = backupInfo;
      const existing = files[0];
      if (!existing && !folder) {
        throw new Error(`Could not resolve Google Drive/${DRIVE_FOLDER_NAME} for backup creation.`);
      }
      const targetFolder = folder;
      const metadata = existing
        ? { name: BACKUP_FILE_NAME }
        : { name: BACKUP_FILE_NAME, parents: [targetFolder!.id] };
      const { boundary, body } = buildMultipartBody(metadata, json);
      const path = existing
        ? `/upload/drive/v3/files/${existing.id}?uploadType=multipart&fields=id,name,modifiedTime,webViewLink`
        : '/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime,webViewLink';
      const method = existing ? 'PATCH' : 'POST';
      const response = await driveRequest(path, {
        method,
        headers: {
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body,
      }, !signedIn, targetFile);
      const file = await response.json() as DriveFile;
      setLatestBackup(file);
      setSignedIn(true);
      persistTargetFile({
        fileId: file.id,
        resourceKey: file.resourceKey,
        webViewLink: file.webViewLink,
      });
      if (file.webViewLink) {
        setBackupLinkInput(file.webViewLink);
      }
      setStatus(
        `${silent ? 'Auto-sync' : 'Backup'} saved to Google Drive/${DRIVE_FOLDER_NAME} at ${formatTimestamp(file.modifiedTime)}.`,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to save backup to Google Drive.');
    } finally {
      setBusy(false);
    }
  }

  async function handlePush() {
    await pushBackup();
  }

  async function handleRestoreFromLink() {
    if (!targetFile) {
      setStatus('Paste a Google Drive backup link or file ID first.');
      return;
    }

    try {
      setBusy(true);
      setStatus('Restoring from linked Google Drive backup...');
      const latest = await fetchTargetFileMetadata(targetFile, !signedIn);
      const response = await driveRequest(
        `/drive/v3/files/${latest.id}?alt=media`,
        undefined,
        !signedIn,
        targetFile,
      );
      const text = await response.text();
      await importBackupText(text);
      setStatus(`Restored backup from ${formatTimestamp(latest.modifiedTime)}. Reloading...`);
      window.location.reload();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to restore backup from the provided link.');
      setBusy(false);
    }
  }

  const runAutoSync = useEffectEvent(async () => {
    if (!configured || !gisReady || !signedIn || busy || autoSyncMinutes <= 0) {
      return;
    }

    await pushBackup({ silent: true });
  });

  useEffect(() => {
    if (autoSyncMinutes <= 0) return;

    const interval = window.setInterval(() => {
      void runAutoSync();
    }, autoSyncMinutes * 60 * 1000);

    return () => window.clearInterval(interval);
  }, [autoSyncMinutes]);

  const modal = open && typeof document !== 'undefined'
    ? createPortal(
        <div
          className="fixed inset-0 z-[100] grid place-items-center p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget && !busy) {
              setOpen(false);
            }
          }}
        >
          <div className="absolute inset-0 bg-black/75 backdrop-blur-md" />

          <div className="relative z-10 flex w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-white/10 bg-[linear-gradient(180deg,rgba(20,22,28,0.98),rgba(10,10,12,0.98))] shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
            <div className="border-b border-white/10 px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-300/80">Backup Sync</p>
                  <h2 className="text-lg font-semibold text-zinc-100">Google Drive</h2>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="rounded-full p-2 text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-200"
                  aria-label="Close"
                  disabled={busy}
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="max-h-[min(75vh,42rem)] space-y-4 overflow-y-auto px-6 py-6">
              {!configured && (
                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                  Set <code className="font-mono text-xs">NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID</code> to enable Google Drive sync.
                </div>
              )}

              {configured && !gisReady && (
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-300">
                  Loading Google sign-in…
                </div>
              )}

              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-zinc-300">
                <p className="font-medium text-zinc-100">Save location</p>
                <p className="mt-2 text-zinc-500">
                  <code className="font-mono text-xs">{DRIVE_FOLDER_NAME}/{BACKUP_FILE_NAME}</code>
                  {latestBackup?.id ? <> ({latestBackup.id})</> : null}.
                </p>
                <div className="mt-3 space-y-2">
                  <label className="block text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
                    Backup Link Or File ID
                  </label>
                  <div className="flex gap-2">
                    <input
                      value={backupLinkInput}
                      onChange={(event) => setBackupLinkInput(event.target.value)}
                      placeholder="Paste Google Drive file link or file ID"
                      className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-sky-400/40"
                    />
                    <button
                      onClick={applyBackupLink}
                      disabled={busy}
                      className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-zinc-100 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Use Link
                    </button>
                  </div>
                </div>
                {driveFolder && (
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <a
                      href={driveFolder.webViewLink ?? `https://drive.google.com/drive/folders/${driveFolder.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex text-xs font-medium text-sky-300 transition-colors hover:text-sky-200"
                    >
                      Open {DRIVE_FOLDER_NAME} folder
                    </a>
                    {latestBackup?.webViewLink && (
                      <a
                        href={latestBackup.webViewLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex text-xs font-medium text-sky-300 transition-colors hover:text-sky-200"
                      >
                        Open {BACKUP_FILE_NAME}
                      </a>
                    )}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-zinc-300">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-zinc-100">Auto-sync</p>
                  </div>
                  <select
                    value={String(autoSyncMinutes)}
                    onChange={(event) => setAutoSyncMinutes(Number(event.target.value))}
                    className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-100"
                  >
                    <option value="0">Off</option>
                    {AUTO_SYNC_OPTIONS.map((minutes) => (
                      <option key={minutes} value={minutes}>
                        Every {minutes} min
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-zinc-300">
                <p className="font-medium text-zinc-100">{signedIn ? 'Connected to Google Drive' : 'Not connected yet'}</p>
                <p className="mt-1 text-zinc-400">
                  Latest backup: {latestBackup ? formatTimestamp(latestBackup.modifiedTime) : 'No backup found'}
                </p>
              </div>

              {status && (
                <div className="rounded-2xl border border-sky-500/20 bg-sky-500/10 px-4 py-3 text-sm text-sky-200">
                  {status}
                </div>
              )}

              <div className="grid gap-2">
                <button
                  onClick={handleConnect}
                  disabled={!configured || !gisReady || busy}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm font-medium text-zinc-100 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {signedIn ? 'Refresh Google Drive access' : 'Connect Google Drive'}
                </button>
                <button
                  onClick={handlePush}
                  disabled={!configured || !gisReady || busy}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm font-medium text-zinc-100 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Save backup to Google Drive
                </button>
                <button
                  onClick={handleRestoreFromLink}
                  disabled={!configured || !gisReady || !targetFile || busy}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm font-medium text-zinc-100 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Restore from provided link
                </button>
              </div>

              <p className="text-xs leading-relaxed text-zinc-500">
                Restore is a full replace, just like Import. The backup is stored in Google Drive&apos;s
                <code className="mx-1 font-mono">appDataFolder</code>, which is hidden from the normal Drive UI.
              </p>
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-md px-2.5 py-1.5 text-sm font-medium text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-100 sm:px-3"
      >
        Sync
      </button>
      {modal}
    </>
  );
}
