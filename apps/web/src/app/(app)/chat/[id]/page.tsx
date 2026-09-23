import { ChatView } from '@/components/chat/chat-view';

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Keyed so switching conversations never carries a half-streamed answer across.
  return <ChatView key={id} id={id} />;
}
