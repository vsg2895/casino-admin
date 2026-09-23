import client from './client'
import type {
  ForumAdminSection,
  ForumArticle,
  ForumCategory,
  ForumModerationAction,
  ForumModerationCounts,
  ForumMemberRole,
  ForumMemberRow,
  ForumModerationPost,
  ForumPost,
  ForumPostStatus,
  ForumMemberStatus,
  UpsertForumArticlePayload,
  UpsertForumCategoryPayload,
  UpsertForumSectionPayload,
} from '@shared/types/community-forum'

/**
 * Community-forum admin API.
 *
 * Two shapes, matching the routes: the taxonomy and the discussions are nested
 * under a site, the moderation queue is global — a moderator works the whole
 * network's backlog in one list rather than switching sites to find it.
 */

interface Paginated<T> {
  data: T[]
  meta: { current_page: number; last_page: number; total: number; per_page: number }
}

// ── taxonomy ─────────────────────────────────────────────────────────────────

export function listSections(siteId: number): Promise<ForumAdminSection[]> {
  return client.get<{ data: ForumAdminSection[] }>(`/admin/sites/${siteId}/forum-sections`).then((r) => r.data.data)
}

export function createSection(siteId: number, payload: UpsertForumSectionPayload): Promise<ForumAdminSection> {
  return client.post<{ data: ForumAdminSection }>(`/admin/sites/${siteId}/forum-sections`, payload).then((r) => r.data.data)
}

export function updateSection(siteId: number, id: number, payload: UpsertForumSectionPayload): Promise<ForumAdminSection> {
  return client.put<{ data: ForumAdminSection }>(`/admin/sites/${siteId}/forum-sections/${id}`, payload).then((r) => r.data.data)
}

export function deleteSection(siteId: number, id: number): Promise<void> {
  return client.delete(`/admin/sites/${siteId}/forum-sections/${id}`).then(() => undefined)
}

export function createCategory(siteId: number, payload: UpsertForumCategoryPayload): Promise<ForumCategory> {
  return client.post<{ data: ForumCategory }>(`/admin/sites/${siteId}/forum-categories`, payload).then((r) => r.data.data)
}

export function updateCategory(siteId: number, id: number, payload: UpsertForumCategoryPayload): Promise<ForumCategory> {
  return client.put<{ data: ForumCategory }>(`/admin/sites/${siteId}/forum-categories/${id}`, payload).then((r) => r.data.data)
}

export function deleteCategory(siteId: number, id: number): Promise<void> {
  return client.delete(`/admin/sites/${siteId}/forum-categories/${id}`).then(() => undefined)
}

// ── articles ─────────────────────────────────────────────────────────────────

export interface ForumArticleFilters {
  page?: number
  per_page?: number
  category_id?: number | null
  status?: string | null
  pinned?: boolean | null
  from?: string | null
  to?: string | null
  search?: string | null
}

export function listArticles(siteId: number, params?: ForumArticleFilters): Promise<Paginated<ForumArticle>> {
  return client.get<Paginated<ForumArticle>>(`/admin/sites/${siteId}/forum-articles`, { params }).then((r) => r.data)
}

export function getArticle(siteId: number, id: number): Promise<ForumArticle> {
  return client.get<{ data: ForumArticle }>(`/admin/sites/${siteId}/forum-articles/${id}`).then((r) => r.data.data)
}

export function createArticle(siteId: number, payload: UpsertForumArticlePayload): Promise<ForumArticle> {
  return client.post<{ data: ForumArticle }>(`/admin/sites/${siteId}/forum-articles`, payload).then((r) => r.data.data)
}

export function updateArticle(siteId: number, id: number, payload: UpsertForumArticlePayload): Promise<ForumArticle> {
  return client.put<{ data: ForumArticle }>(`/admin/sites/${siteId}/forum-articles/${id}`, payload).then((r) => r.data.data)
}

/** Deletes the discussion AND soft-deletes every post under it. */
export function deleteArticle(siteId: number, id: number): Promise<{ posts_removed: number; message: string }> {
  return client
    .delete<{ posts_removed: number; message: string }>(`/admin/sites/${siteId}/forum-articles/${id}`)
    .then((r) => r.data)
}

// ── editorial replies ────────────────────────────────────────────────────────
//
// A reply written by the team, stored against the signed-in admin's real user
// row and published under the site's team name. Members post through the public
// site as they always have; this is only the staff path.

export function createArticlePost(
  siteId: number,
  articleId: number,
  body: string,
  parentId?: number | null,
): Promise<ForumPost> {
  return client
    .post<{ data: ForumPost }>(`/admin/sites/${siteId}/forum-articles/${articleId}/posts`, {
      body,
      parent_id: parentId ?? null,
    })
    .then((r) => r.data.data)
}

/** Only the team's own replies are editable — a member's words stay theirs. */
export function updateArticlePost(
  siteId: number,
  articleId: number,
  postId: number,
  body: string,
): Promise<ForumPost> {
  return client
    .put<{ data: ForumPost }>(`/admin/sites/${siteId}/forum-articles/${articleId}/posts/${postId}`, { body })
    .then((r) => r.data.data)
}

// ── moderation ───────────────────────────────────────────────────────────────

export interface ForumModerationFilters {
  page?: number
  per_page?: number
  site_id?: number | null
  status?: ForumPostStatus | null
  reported?: boolean | null
  search?: string | null
}

export function listModerationPosts(params?: ForumModerationFilters): Promise<Paginated<ForumModerationPost>> {
  return client.get<Paginated<ForumModerationPost>>('/admin/forum-posts', { params }).then((r) => r.data)
}

export function moderationCounts(siteId?: number | null): Promise<ForumModerationCounts> {
  return client
    .get<{ data: ForumModerationCounts }>('/admin/forum-posts/counts', { params: { site_id: siteId ?? undefined } })
    .then((r) => r.data.data)
}

/** Bulk and single share one endpoint — they are the same operation. */
export function moderate(
  ids: number[],
  action: ForumModerationAction,
  reason?: string,
): Promise<{ affected: number; action: ForumModerationAction }> {
  return client
    .post<{ data: { affected: number; action: ForumModerationAction } }>('/admin/forum-posts/act', { ids, action, reason })
    .then((r) => r.data.data)
}

export function setMemberStatus(
  memberId: number,
  status: ForumMemberStatus,
  opts?: { until?: string | null; reason?: string | null },
): Promise<{ id: number; status: ForumMemberStatus; banned_until: string | null }> {
  return client
    .patch<{ data: { id: number; status: ForumMemberStatus; banned_until: string | null } }>(
      `/admin/forum-members/${memberId}`,
      { status, until: opts?.until ?? null, reason: opts?.reason ?? null },
    )
    .then((r) => r.data.data)
}

export function listMemberPosts(memberId: number, page = 1): Promise<Paginated<ForumModerationPost>> {
  return client
    .get<Paginated<ForumModerationPost>>(`/admin/forum-members/${memberId}/posts`, { params: { page } })
    .then((r) => r.data)
}

// ── members ──────────────────────────────────────────────────────────────────

export interface ForumMemberFilters {
  page?: number
  per_page?: number
  site_id?: number | null
  status?: ForumMemberStatus | null
  role?: ForumMemberRole | null
  verified?: boolean | null
  search?: string | null
}

export function listMembers(params?: ForumMemberFilters): Promise<Paginated<ForumMemberRow>> {
  return client.get<Paginated<ForumMemberRow>>('/admin/forum-members', { params }).then((r) => r.data)
}

/**
 * Change a member's role.
 *
 * Its own endpoint, not folded into setMemberStatus: role and status are
 * different axes, and one call that set both would make "ban this moderator"
 * silently demote them.
 */
export function setMemberRole(memberId: number, role: ForumMemberRole): Promise<{ id: number; role: ForumMemberRole }> {
  return client
    .patch<{ data: { id: number; role: ForumMemberRole } }>(`/admin/forum-members/${memberId}/role`, { role })
    .then((r) => r.data.data)
}
