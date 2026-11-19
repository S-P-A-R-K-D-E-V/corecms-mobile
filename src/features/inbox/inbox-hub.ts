import { useEffect } from 'react';
import * as signalR from '@microsoft/signalr';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';

import { getHostApi } from 'src/api/axios';
import { currentAccessToken } from 'src/api/session';
import { normalizeConversation, normalizeMessage } from 'src/api/inbox';

import { applyConversation, applyMessage } from './hooks';
import { useInboxHubState } from './inbox-hub-state';

export { useInboxHubState };

// ----------------------------------------------------------------------
// Cập nhật trực tiếp Hộp thư khách: hub /hubs/inbox (core-be InboxHub), gọi Join() để vào nhóm của cửa hàng (máy chủ trả false
// khi thiếu conversation.read). Một kết nối dùng chung cho mọi màn hộp thư (đếm số màn đang dùng, màn cuối đóng thì ngắt).
// Sự kiện: conversationUpdated (ConversationSummary), messageAdded / messageUpdated (ConversationMessage) → ghi thẳng vào bộ
// đệm react-query. Chưa vào được nhóm (hub lỗi / mất mạng) → `joined` false, các query tự hỏi lại định kỳ (hooks.ts).
// ----------------------------------------------------------------------

const hubUrl = () => `${getHostApi()}/hubs/inbox`;

let conn: signalR.HubConnection | null = null;
let users = 0;
let ctx: { qc: QueryClient; myUserId: string | null } | null = null;

async function join(c: signalR.HubConnection) {
  try {
    const ok = await c.invoke<boolean>('Join');
    useInboxHubState.setState(ok === false ? { joined: false } : { joined: true, joinedAt: Date.now() });
  } catch {
    useInboxHubState.setState({ joined: false });
  }
}

function start() {
  const c = new signalR.HubConnectionBuilder()
    .withUrl(hubUrl(), {
      // Đọc token hiện tại mỗi lần (kết nối lại): token có thể đã được làm mới sau 401.
      accessTokenFactory: currentAccessToken,
      transport: signalR.HttpTransportType.WebSockets,
      skipNegotiation: true,
    })
    .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
    .configureLogging(signalR.LogLevel.Warning)
    .build();

  c.on('conversationUpdated', (raw: unknown) => {
    if (ctx) applyConversation(ctx.qc, normalizeConversation(raw), ctx.myUserId);
  });
  c.on('messageAdded', (raw: unknown) => {
    if (ctx) applyMessage(ctx.qc, normalizeMessage(raw), 'add');
  });
  c.on('messageUpdated', (raw: unknown) => {
    if (ctx) applyMessage(ctx.qc, normalizeMessage(raw), 'update');
  });
  c.onreconnecting(() => useInboxHubState.setState({ joined: false }));
  // Nối lại = kết nối mới, mất nhóm cũ → Join lại (joinedAt đổi → màn đang mở nạp lại phần lỡ).
  c.onreconnected(() => void join(c));
  c.onclose(() => useInboxHubState.setState({ joined: false }));

  conn = c;
  c.start()
    .then(() => (conn === c ? join(c) : undefined))
    .catch(() => useInboxHubState.setState({ joined: false }));
}

function stop() {
  const c = conn;
  conn = null;
  useInboxHubState.setState({ joined: false });
  c?.stop().catch(() => {});
}

/** Giữ kết nối hub khi màn hộp thư đang mở (gọi ở mọi màn hộp thư; kết nối dùng chung). */
export function useInboxHub(myUserId: string | null | undefined, enabled = true) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    ctx = { qc, myUserId: myUserId ?? null };
    users += 1;
    if (!conn) start();
    return () => {
      users -= 1;
      if (users <= 0) {
        users = 0;
        stop();
      }
    };
  }, [qc, myUserId, enabled]);
}
