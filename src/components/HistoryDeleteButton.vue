<script setup lang="ts">
/**
 * Delete ONE row of a send history, with a confirmation.
 *
 * Shared by all six logs in Email History rather than written six times: the
 * question ("remove this record?"), the consequence ("the message is not
 * un-sent") and the failure handling are identical everywhere, and six copies
 * would be six places for them to drift.
 *
 * ── Why it confirms ─────────────────────────────────────────────────────────
 *
 * The row is an audit record and the delete is immediate and unrecoverable —
 * there is no trash, by design. The dialog also carries the one sentence an
 * operator needs before pressing it: removing the record does not undo the
 * send.
 *
 * ── What it is NOT for ──────────────────────────────────────────────────────
 *
 * Clearing a log. That is `histories:clear` on the server, which says out loud
 * how many rows it is about to take and asks for confirmation in production. A
 * button in a table should only ever remove the thing it is next to.
 */
import { ref } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import { useToast } from 'primevue/usetoast'

const props = defineProps<{
  /** What is being removed, shown in the dialog — usually the address. */
  label: string
  /** The API call. Resolves on success, rejects on failure. */
  remove: () => Promise<void>
}>()

const emit = defineEmits<{ deleted: [] }>()

const toast = useToast()
const open = ref(false)
const busy = ref(false)

async function confirm(): Promise<void> {
  busy.value = true
  try {
    await props.remove()
    open.value = false
    // The parent reloads rather than this splicing the row out locally: the
    // paginator's totals are server-side, and a row removed from a page
    // without them would leave the count disagreeing with the table.
    emit('deleted')
    toast.add({ severity: 'success', summary: 'Deleted', detail: 'The record was removed.', life: 2500 })
  } catch {
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: 'Could not delete that record.',
      life: 4000,
    })
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <Button
    icon="pi pi-trash"
    text
    severity="danger"
    size="small"
    aria-label="Delete this record"
    @click="open = true"
  />

  <Dialog v-model:visible="open" modal header="Delete record" :style="{ width: '420px' }">
    <p class="text-sm text-gray-700">
      Remove the history record for <strong>{{ props.label }}</strong>?
    </p>
    <p class="mt-2 text-xs text-gray-500">
      This deletes the RECORD only — the message was already sent, and removing the row does not
      undo it. There is no undo for the row either.
    </p>

    <template #footer>
      <Button label="Cancel" text :disabled="busy" @click="open = false" />
      <Button label="Delete" severity="danger" :loading="busy" @click="confirm" />
    </template>
  </Dialog>
</template>
