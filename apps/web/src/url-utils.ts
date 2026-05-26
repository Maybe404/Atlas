export function documentReaderUrl(spaceId: string, documentId: string) {
  const origin = window.location.origin;
  const encodedSpaceId = encodeURIComponent(spaceId);
  const encodedDocumentId = encodeURIComponent(documentId);
  return `${origin}/spaces/${encodedSpaceId}/docs/${encodedDocumentId}`;
}

export function publicShareUrl(token: string) {
  return `${window.location.origin}/share/${encodeURIComponent(token)}`;
}
