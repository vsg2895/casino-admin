/** Field definitions driving FieldInput / SimpleCrud / the settings forms. */
export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'toggle'
  | 'select'
  | 'image'
  | 'richtext'
  | 'color'
  | 'lines'

export interface FieldOption {
  label: string
  value: string | number
}

export interface FieldDef {
  key: string
  label: string
  type?: FieldType
  /** Shown as a table column in SimpleCrud. */
  column?: boolean
  required?: boolean
  options?: FieldOption[]
  help?: string
  placeholder?: string
  /** For slugs: auto-fill from this field while creating and the slug is untouched. */
  slugFrom?: string
  /** Default when creating. */
  default?: string | number | boolean | string[] | null
}

export type FieldValue = string | number | boolean | string[] | null

export type FormState = Record<string, FieldValue>

export const SEO_FIELDS: FieldDef[] = [
  { key: 'meta_title', label: 'Meta title', help: 'Browser tab and search result title. Empty = the name.' },
  { key: 'meta_description', label: 'Meta description', type: 'textarea' },
]

export function blankForm(fields: FieldDef[]): FormState {
  const out: FormState = {}
  for (const f of fields) {
    if (f.default !== undefined) out[f.key] = f.default
    else if (f.type === 'toggle') out[f.key] = false
    else if (f.type === 'number') out[f.key] = null
    else if (f.type === 'lines') out[f.key] = []
    else out[f.key] = ''
  }
  return out
}

/** Empty strings become null so "cleared" reaches the API as a real null. */
export function toPayload(form: FormState): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(form)) {
    out[k] = typeof v === 'string' && v.trim() === '' ? null : v
  }
  return out
}
