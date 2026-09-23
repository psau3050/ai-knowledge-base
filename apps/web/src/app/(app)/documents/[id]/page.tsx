import { ExistingDocumentEditor } from '@/components/document-editor';

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ExistingDocumentEditor id={id} />;
}
