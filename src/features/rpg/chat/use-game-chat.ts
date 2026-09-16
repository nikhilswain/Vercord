import { useEffect, useMemo } from 'react';
import { GameChatClient } from './client';
import { DemoChatTransport } from './demo';
import { SocketChatTransport } from './transport';

export function useGameChat(guildId: string | undefined) {
  const chat = useMemo(() => {
    const transport = guildId ? new SocketChatTransport(guildId) : new DemoChatTransport();
    return { client: new GameChatClient(transport), transport };
  }, [guildId]);
  useEffect(() => {
    chat.client.start();
    const resume = () => chat.client.resume();
    const visible = () => {
      if (document.visibilityState === 'visible') resume();
    };
    window.addEventListener('online', resume);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.removeEventListener('online', resume);
      document.removeEventListener('visibilitychange', visible);
      chat.client.stop();
    };
  }, [chat]);
  return chat;
}
