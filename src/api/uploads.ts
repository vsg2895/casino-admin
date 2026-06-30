import client from './client'

export interface UploadResponse {
  path: string
  url: string
}

/** Upload an image to the backend; returns the stored path + public URL. */
export function uploadImage(file: File, type: 'image' | 'banner' = 'image'): Promise<UploadResponse> {
  const data = new FormData()
  data.append('file', file)
  data.append('type', type)
  return client
    .post<UploadResponse>('/admin/uploads', data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then((r) => r.data)
}
