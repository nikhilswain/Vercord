import { useEffect, useId, useRef, useState } from 'react';

import { Dialog } from '../../components/Dialog';
import { RequestRetry } from '../../components/RequestRetry';
import {
  channelNameSchema,
  type ChannelControls,
  type ChannelMutationResult,
} from '../../domain/channels/protocol';
import type { MapSnapshot } from '../../domain/map/snapshot';
import { ChannelApiError, channelErrorMessage, mutateChannel } from './channel-api';
import './channel-manager.css';

interface ChannelManagerProps {
  guildId: string;
  snapshot: MapSnapshot;
  controls: ChannelControls | null;
  permissionsUnavailable?: boolean;
  rateLimited?: boolean;
  refreshPending?: boolean;
  retryAt?: number;
  uncertainRequestId?: string | null;
  canConfirmReconciled?: boolean;
  currentRoomKey: string | null;
  onMutation(result: ChannelMutationResult): void;
  onRefresh(): Promise<boolean>;
  onConfirmReconciled(): void;
}

type Editor = { kind: 'create' } | { kind: 'rename' | 'delete'; key: string; label: string };

export function ChannelManager({
  guildId,
  snapshot,
  controls,
  permissionsUnavailable = false,
  rateLimited = false,
  refreshPending = false,
  retryAt = 0,
  uncertainRequestId = null,
  canConfirmReconciled = false,
  currentRoomKey,
  onMutation,
  onRefresh,
  onConfirmReconciled,
}: ChannelManagerProps) {
  const [open, setOpen] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [selectedKey, setSelectedKey] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<'text' | 'voice'>('text');
  const [parentKey, setParentKey] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [nameConflict, setNameConflict] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const inputId = useId();
  const formId = useId();
  const allowedKeys = new Set(controls?.manageableKeys ?? []);
  const channels = snapshot.areas.flatMap((area) =>
    area.rooms
      .filter((room) => allowedKeys.has(room.key))
      .map((room) => ({ ...room, area: area.label })),
  );
  const canCreate = controls !== null && (controls.canCreateRoot || controls.categories.length > 0);
  const eligible = canCreate || channels.length > 0;
  const selected = channels.find((room) => room.key === selectedKey) ?? channels[0];
  const editorAllowed =
    !permissionsUnavailable &&
    (editor?.kind === 'create'
      ? canCreate &&
        (parentKey === ''
          ? controls?.canCreateRoot
          : controls?.categories.some((category) => category.key === parentKey))
      : editor !== null && allowedKeys.has(editor.key));
  const uncertaintyLocked = uncertainRequestId !== null;

  useEffect(() => {
    if (!open || busy) return;
    if (editor === null || editor.kind === 'delete') cancelRef.current?.focus();
    else nameRef.current?.focus();
  }, [editor, open, busy]);

  if (nameConflict && editor !== null && editor.kind !== 'create' && !busy) {
    const updated = snapshot.areas
      .flatMap((area) => area.rooms)
      .find((room) => room.key === editor.key);
    if (updated && updated.label !== editor.label) {
      // Reconcile changed source props before committing the form, not in an effect.
      // Only a confirmed conflict may rebase; keep the draft, but clear delete confirmation.
      setEditor({ ...editor, label: updated.label });
      setConfirmation('');
      setNameConflict(false);
      setError(null);
      setNotice(`This channel is now #${updated.label}. Review it before continuing.`);
    }
  }

  const resetEditor = () => {
    setEditor(null);
    setError(null);
    setFieldError(null);
    setNameConflict(false);
  };
  const close = () => {
    if (busyRef.current) return;
    setOpen(false);
    resetEditor();
  };
  const startEditor = (next: Editor) => {
    setEditor(next);
    setName(next.kind === 'rename' ? next.label : '');
    setConfirmation('');
    setParentKey(controls?.canCreateRoot ? '' : (controls?.categories[0]?.key ?? ''));
    setError(null);
    setFieldError(null);
    setNotice('');
  };
  const refresh = async () => {
    if (busyRef.current || refreshPending || Date.now() < retryAt) return;
    busyRef.current = true;
    setBusy(true);
    setChecking(true);
    setError(null);
    try {
      const refreshed = await onRefresh();
      if (refreshed) {
        setNotice(
          uncertaintyLocked
            ? 'Channels refreshed. Check the result before making another change.'
            : 'Channels refreshed.',
        );
      } else {
        setNotice('');
        setError('Could not refresh channel permissions. Changes are paused; try again shortly.');
      }
    } catch {
      setNotice('');
      setError('Could not refresh channel permissions. Changes are paused; try again shortly.');
    } finally {
      busyRef.current = false;
      setBusy(false);
      setChecking(false);
    }
  };
  const submit = async () => {
    if (busyRef.current || editor === null || !editorAllowed || uncertaintyLocked) return;
    const parsed = channelNameSchema.safeParse(name);
    if (editor.kind === 'delete' ? confirmation !== editor.label : !parsed.success) {
      setFieldError(
        editor.kind === 'delete'
          ? 'Type the channel name exactly to confirm deletion.'
          : 'Enter 1–100 characters, without control characters.',
      );
      nameRef.current?.focus();
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setFieldError(null);
    try {
      const method =
        editor.kind === 'create' ? 'POST' : editor.kind === 'rename' ? 'PATCH' : 'DELETE';
      const body =
        editor.kind === 'create'
          ? { name: parsed.success ? parsed.data : name, type, parentKey: parentKey || null }
          : editor.kind === 'rename'
            ? { name: parsed.success ? parsed.data : name, expectedName: editor.label }
            : { expectedName: editor.label };
      const result = await mutateChannel(
        guildId,
        editor.kind === 'create' ? null : editor.key,
        method,
        body,
      );
      onMutation(result);
      const verb =
        editor.kind === 'create' ? 'created' : editor.kind === 'rename' ? 'renamed' : 'deleted';
      if (result.status === 'applied') {
        resetEditor();
        setNotice(
          result.view === null
            ? `Channel ${verb} in Discord. Waiting for map sync…`
            : `Channel ${verb} in Discord.`,
        );
      } else if (result.status === 'uncertain') {
        setError(null);
      } else {
        const rejection = new ChannelApiError(result.code, result.retryAt ?? 0, 'mutation');
        setError(channelErrorMessage(rejection));
        if (result.code === 'CHANNEL_CHANGED') setNameConflict(true);
      }
    } catch (failure) {
      setError(channelErrorMessage(failure));
      if (failure instanceof ChannelApiError && failure.code === 'CHANNEL_CHANGED')
        setNameConflict(true);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  if (!eligible && !open) return null;
  const title =
    editor?.kind === 'create'
      ? 'Create a Discord channel'
      : editor?.kind === 'rename'
        ? `Rename #${editor.label}`
        : editor?.kind === 'delete'
          ? `Delete #${editor.label}?`
          : 'Manage channels';
  return (
    <>
      <button
        type="button"
        className="channel-manager-trigger"
        onClick={() => {
          setSelectedKey(currentRoomKey ?? '');
          resetEditor();
          setNotice('');
          setOpen(true);
        }}
      >
        Manage channels
      </button>
      <Dialog
        open={open}
        title={title}
        busy={busy}
        error={rateLimited ? null : error}
        className="channel-manager"
        onClose={close}
        footer={
          <>
            <button
              ref={cancelRef}
              type="button"
              className="confirm-dialog__cancel"
              autoFocus
              disabled={busy}
              onClick={editor === null ? close : resetEditor}
            >
              {editor === null ? 'Close' : 'Cancel'}
            </button>
            {!uncertaintyLocked && editor !== null && (error !== null || !editorAllowed) ? (
              <RequestRetry
                retryAt={retryAt}
                pending={busy || refreshPending}
                label="Refresh channels"
                onRetry={refresh}
              />
            ) : null}
            {uncertaintyLocked && canConfirmReconciled ? (
              <button
                type="button"
                className="channel-manager-primary"
                disabled={busy}
                onClick={() => {
                  onConfirmReconciled();
                  setError(null);
                  setNotice('Result checked. You can make another change.');
                }}
              >
                I checked the result
              </button>
            ) : !uncertaintyLocked && editor !== null ? (
              <button
                form={formId}
                type="submit"
                disabled={busy || !editorAllowed}
                className={
                  editor.kind === 'delete' ? 'confirm-dialog__danger' : 'channel-manager-primary'
                }
              >
                {checking
                  ? 'Checking…'
                  : busy
                    ? 'Applying…'
                    : editor.kind === 'create'
                      ? 'Create channel'
                      : editor.kind === 'rename'
                        ? 'Save name'
                        : 'Delete channel'}
              </button>
            ) : (
              <RequestRetry
                retryAt={retryAt}
                pending={busy || refreshPending}
                label="Refresh channels"
                onRetry={refresh}
              />
            )}
          </>
        }
      >
        {notice ? (
          <p className="channel-manager-notice" role="status">
            {notice}
          </p>
        ) : null}
        {uncertaintyLocked ? (
          <p className="confirm-dialog__error" role="status">
            Check Discord, then refresh before repeating this change.
          </p>
        ) : null}
        {permissionsUnavailable || controls === null || (editor !== null && !editorAllowed) ? (
          <p className="confirm-dialog__error" role="status">
            {rateLimited
              ? 'Discord is temporarily limiting channel requests. Wait for the countdown before refreshing.'
              : permissionsUnavailable || controls === null
                ? 'Channel permissions are unavailable. Changes are paused until they can be refreshed.'
                : 'Your permissions or the selected channel changed. Refresh before continuing.'}
          </p>
        ) : null}
        {editor === null ? (
          <div className="channel-manager-body">
            <p className="confirm-dialog__copy">
              These changes affect the real Discord server. Only channels you and the bot can manage
              appear here.
            </p>
            {canCreate ? (
              <button
                type="button"
                className="channel-manager-primary"
                disabled={busy || permissionsUnavailable}
                onClick={() => startEditor({ kind: 'create' })}
              >
                Create channel
              </button>
            ) : null}
            {channels.length > 0 ? (
              <>
                <label htmlFor={`${inputId}-channel`}>Existing channel</label>
                <select
                  id={`${inputId}-channel`}
                  value={selected?.key ?? ''}
                  disabled={busy}
                  onChange={(event) => setSelectedKey(event.target.value)}
                >
                  {channels.map((room) => (
                    <option key={room.key} value={room.key}>
                      {room.area} / #{room.label}
                    </option>
                  ))}
                </select>
                <div className="channel-manager-row-actions">
                  <button
                    type="button"
                    disabled={busy || permissionsUnavailable || selected === undefined}
                    onClick={() => {
                      if (selected)
                        startEditor({ kind: 'rename', key: selected.key, label: selected.label });
                    }}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    className="channel-manager-delete"
                    disabled={busy || permissionsUnavailable || selected === undefined}
                    onClick={() => {
                      if (selected)
                        startEditor({ kind: 'delete', key: selected.key, label: selected.label });
                    }}
                  >
                    Delete…
                  </button>
                </div>
              </>
            ) : (
              <p className="confirm-dialog__copy">No existing channels you can manage.</p>
            )}
          </div>
        ) : (
          <form
            id={formId}
            className="channel-manager-body"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault();
            }}
          >
            {editor.kind === 'delete' ? (
              <>
                <p className="confirm-dialog__copy">
                  This permanently deletes <strong>#{editor.label}</strong> from Discord, including
                  its messages and any threads. People in a deleted voice channel will be
                  disconnected. This cannot be undone.
                </p>
                <label htmlFor={inputId}>Type {editor.label} to confirm</label>
                <input
                  ref={nameRef}
                  id={inputId}
                  value={confirmation}
                  onChange={(event) => {
                    setConfirmation(event.target.value);
                    setFieldError(null);
                  }}
                  disabled={busy || uncertaintyLocked}
                  autoComplete="off"
                  aria-invalid={fieldError !== null}
                  aria-describedby={fieldError ? `${inputId}-error` : undefined}
                />
              </>
            ) : (
              <>
                <label htmlFor={inputId}>Channel name</label>
                <input
                  ref={nameRef}
                  id={inputId}
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    setFieldError(null);
                  }}
                  disabled={busy || uncertaintyLocked}
                  autoComplete="off"
                  aria-invalid={fieldError !== null}
                  aria-describedby={fieldError ? `${inputId}-error` : undefined}
                />
                {editor.kind === 'create' ? (
                  <>
                    <label htmlFor={`${inputId}-type`}>Channel type</label>
                    <select
                      id={`${inputId}-type`}
                      value={type}
                      disabled={busy || uncertaintyLocked}
                      onChange={(event) => setType(event.target.value as 'text' | 'voice')}
                    >
                      <option value="text">Text</option>
                      <option value="voice">Voice</option>
                    </select>
                    <label htmlFor={`${inputId}-category`}>Category</label>
                    <select
                      id={`${inputId}-category`}
                      value={parentKey}
                      disabled={busy || uncertaintyLocked}
                      onChange={(event) => setParentKey(event.target.value)}
                    >
                      {controls?.canCreateRoot ? <option value="">No category</option> : null}
                      {controls?.categories.map((category) => (
                        <option key={category.key} value={category.key}>
                          {category.label}
                        </option>
                      ))}
                    </select>
                    <p className="confirm-dialog__copy">
                      New channels inherit the selected category’s access rules. Without a category,
                      the server’s default role permissions apply.
                    </p>
                  </>
                ) : (
                  <p className="confirm-dialog__copy">
                    Only the name changes. Messages and channel permissions stay the same.
                  </p>
                )}
              </>
            )}
            {fieldError ? (
              <p id={`${inputId}-error`} className="confirm-dialog__error" role="alert">
                {fieldError}
              </p>
            ) : null}
          </form>
        )}
      </Dialog>
    </>
  );
}
