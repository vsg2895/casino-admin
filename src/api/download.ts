import client from './client'

/**
 * Download a file from an authenticated endpoint as a blob and trigger a
 * browser "Save As". Used for CSV exports that sit behind Sanctum auth, where
 * a plain anchor link would not carry the Authorization header.
 */
export async function downloadFile(path: string, fallbackName: string): Promise<void> {
  const response = await client.get(path, { responseType: 'blob' })

  const disposition = response.headers['content-disposition'] as string | undefined
  const match = disposition?.match(/filename="?([^"]+)"?/)
  const filename = match?.[1] ?? fallbackName

  const url = window.URL.createObjectURL(response.data as Blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}
