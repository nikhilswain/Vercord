import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';

import {
  MESSAGE_SEND_MAX_LENGTH,
  type MessageHistory,
  type RoomMessage,
} from '../../domain/messages/protocol';
import {
  MessageRequestError,
  type MessageSendOutcome,
  type WorldPresenceConnection,
} from './presence/world-presence-client';

import './room-chat.css';

interface RoomChatProps {
  roomKey: string;
  roomLabel: string;
  connection: WorldPresenceConnection;
  liveMessage: RoomMessage | null;
  readMessages(roomKey: string): Promise<MessageHistory>;
  sendMessage(roomKey: string, content: string): Promise<MessageSendOutcome>;
}

function mergeMessage(messages: readonly RoomMessage[], incoming: RoomMessage): RoomMessage[] {
  const byId = new Map(messages.map((message) => [message.id, message]));
  byId.set(incoming.id, incoming);
  return [...byId.values()]
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))
    .slice(-50);
}

function messageFailure(error: unknown): string {
  if (!(error instanceof MessageRequestError)) return 'Discord messages are unavailable right now.';
  switch (error.code) {
    case 'MESSAGE_MEMBER_FORBIDDEN':
      return 'Your Discord role cannot use messages in this channel.';
    case 'MESSAGE_BOT_FORBIDDEN':
      return 'The Dmap bot needs permission to use messages in this channel.';
    case 'MESSAGE_MEMBER_PENDING':
      return 'Finish Discord membership screening before sending messages.';
    case 'MESSAGE_MEMBER_TIMED_OUT':
      return 'You cannot send messages while timed out in Discord.';
    case 'MESSAGE_CHANNEL_NOT_FOUND':
      return 'This Discord channel no longer exists.';
    case 'MESSAGE_RATE_LIMITED':
      return 'Discord is limiting messages for a moment. Try again shortly.';
    case 'GATEWAY_UPDATE_REQUIRED':
      return 'The message gateway needs to be updated and restarted.';
    default:
      return 'Discord messages are unavailable right now.';
  }
}

function messageTime(createdAt: string): string {
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime())
    ? ''
    : new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date);
}

function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase();
}

export function RoomChat({
  roomKey,
  roomLabel,
  connection,
  liveMessage,
  readMessages,
  sendMessage,
}: RoomChatProps) {
  const [expanded, setExpanded] = useState(true);
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [canRead, setCanRead] = useState(false);
  const [canSend, setCanSend] = useState(false);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);

  useEffect(() => {
    let current = true;
    if (connection !== 'online') {
      // The socket is an external data source; its transition owns this request state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
      return () => {
        current = false;
      };
    }
    setLoading(true);
    setError(null);
    setCanRead(false);
    setCanSend(false);
    void readMessages(roomKey).then(
      (history) => {
        if (!current) return;
        setMessages((existing) =>
          history.messages.reduce((combined, message) => mergeMessage(combined, message), existing),
        );
        setCanRead(history.canRead);
        setCanSend(history.canSend);
        setLoading(false);
      },
      (failure: unknown) => {
        if (!current) return;
        setError(messageFailure(failure));
        setLoading(false);
      },
    );
    return () => {
      current = false;
    };
  }, [connection, readMessages, roomKey]);

  useEffect(() => {
    if (liveMessage?.roomKey !== roomKey) return;
    // Live Discord delivery is an external subscription surfaced by the parent socket owner.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMessages((existing) => mergeMessage(existing, liveMessage));
    if (!expanded) setUnread((count) => count + 1);
  }, [expanded, liveMessage, roomKey]);

  useEffect(() => {
    if (!expanded || !nearBottomRef.current) return;
    const list = listRef.current;
    if (list !== null) list.scrollTop = list.scrollHeight;
  }, [expanded, messages]);

  const remaining = MESSAGE_SEND_MAX_LENGTH - draft.length;
  const sendDisabled =
    sending || connection !== 'online' || !canSend || draft.trim().length === 0 || remaining < 0;
  const statusText = useMemo(() => {
    if (connection !== 'online') return 'Message relay reconnecting…';
    if (!canSend && !loading && error === null) {
      return 'You or the Dmap bot cannot send messages in this channel.';
    }
    return null;
  }, [canSend, connection, error, loading]);

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (sendDisabled) return;
    const content = draft;
    setSending(true);
    setError(null);
    setNotice(null);
    try {
      const outcome = await sendMessage(roomKey, content);
      if (outcome.status === 'uncertain') {
        setNotice('Discord may have sent this message. Check the chat before trying again.');
        return;
      }
      setMessages((existing) => mergeMessage(existing, outcome.message));
      setDraft('');
    } catch (failure) {
      setError(messageFailure(failure));
    } finally {
      setSending(false);
    }
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void submit();
  };

  return (
    <section
      className={`room-chat${expanded ? '' : ' room-chat--collapsed'}`}
      aria-label={`#${roomLabel} Discord messages`}
    >
      <button
        type="button"
        className="room-chat__toggle"
        aria-expanded={expanded}
        onClick={() => {
          setExpanded((value) => !value);
          if (!expanded) setUnread(0);
        }}
      >
        <span className="room-chat__sigil" aria-hidden="true">
          #
        </span>
        <span className="room-chat__heading">
          <strong>#{roomLabel}</strong>
          <small>Discord dispatch</small>
        </span>
        {unread > 0 ? <span className="room-chat__unread">{Math.min(unread, 99)}</span> : null}
        <span className="room-chat__chevron" aria-hidden="true">
          {expanded ? '⌄' : '⌃'}
        </span>
      </button>

      {expanded ? (
        <div className="room-chat__body">
          <div
            ref={listRef}
            className="room-chat__messages"
            role="log"
            aria-live="polite"
            onScroll={(event) => {
              const target = event.currentTarget;
              nearBottomRef.current =
                target.scrollHeight - target.scrollTop - target.clientHeight < 48;
            }}
          >
            {loading ? <p className="room-chat__state">Reading the latest dispatches…</p> : null}
            {!loading && messages.length === 0 && error === null ? (
              <p className="room-chat__state">
                {canRead
                  ? 'No recent messages. Start the conversation.'
                  : 'Recent Discord history is hidden by this channel’s permissions.'}
              </p>
            ) : null}
            {messages.map((message) => (
              <article className="room-chat__message" key={message.id}>
                <span className="room-chat__avatar" aria-hidden="true">
                  {message.author.avatarUrl ? (
                    <img
                      src={message.author.avatarUrl}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  ) : null}
                  <span>{initials(message.author.displayName)}</span>
                </span>
                <div className="room-chat__message-copy">
                  <header>
                    <strong>{message.author.displayName}</strong>
                    {message.author.bot ? <span className="room-chat__bot">BOT</span> : null}
                    <time dateTime={message.createdAt}>{messageTime(message.createdAt)}</time>
                  </header>
                  {message.content ? <p>{message.content}</p> : null}
                  {message.attachmentCount > 0 || message.embedCount > 0 ? (
                    <small>
                      {message.attachmentCount > 0
                        ? `${message.attachmentCount} attachment${message.attachmentCount === 1 ? '' : 's'}`
                        : ''}
                      {message.attachmentCount > 0 && message.embedCount > 0 ? ' · ' : ''}
                      {message.embedCount > 0
                        ? `${message.embedCount} embed${message.embedCount === 1 ? '' : 's'}`
                        : ''}
                    </small>
                  ) : null}
                </div>
              </article>
            ))}
          </div>

          <form className="room-chat__composer" onSubmit={(event) => void submit(event)} noValidate>
            <label htmlFor={`room-chat-${roomKey}`}>Message #{roomLabel}</label>
            <textarea
              className="room-chat__composer-input room-chat__composer-input--resize-none"
              id={`room-chat-${roomKey}`}
              value={draft}
              maxLength={MESSAGE_SEND_MAX_LENGTH}
              rows={2}
              disabled={!canSend || connection !== 'online'}
              placeholder={`Message #${roomLabel}`}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleComposerKeyDown}
            />
            <div className="room-chat__composer-meta">
              <span>{remaining}</span>
              <button type="submit" disabled={sendDisabled}>
                {sending ? 'Sending…' : 'Send'}
              </button>
            </div>
          </form>
          {statusText ? <p className="room-chat__status">{statusText}</p> : null}
          {error ? (
            <p className="room-chat__error" role="alert">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p className="room-chat__notice" role="status">
              {notice}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
