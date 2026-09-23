import type { ReactNode } from 'react';
import { ConversationList } from '@/components/chat/conversation-list';

export default function ChatLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col lg:h-screen lg:flex-row">
      <ConversationList />
      <section className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</section>
    </div>
  );
}
