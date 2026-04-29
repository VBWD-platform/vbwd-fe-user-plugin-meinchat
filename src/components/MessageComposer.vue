<template>
  <div>
    <div
      v-if="previewUrl"
      class="composer__preview"
      data-testid="composer-preview"
    >
      <img
        :src="previewUrl"
        alt="attachment preview"
      >
      <button
        type="button"
        class="composer__preview-x"
        :title="$t('meinchat.cancel')"
        @click="clearAttachment"
      >
        ✕
      </button>
    </div>
    <p
      v-if="attachmentError"
      class="composer__error"
      data-testid="composer-attach-error"
    >
      {{ attachmentError }}
    </p>
    <form
      class="composer"
      data-testid="message-composer"
      @submit.prevent="onSubmit"
    >
      <input
        ref="fileInput"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        style="display: none"
        data-testid="composer-file-input"
        @change="onFilePicked"
      >
      <button
        type="button"
        class="composer__attach"
        data-testid="composer-attach"
        :disabled="disabled"
        @click="fileInput?.click()"
      >
        📎
      </button>
      <textarea
        v-model="body"
        class="composer__input"
        :placeholder="$t('meinchat.composer.placeholder')"
        :disabled="disabled"
        :maxlength="4000"
        rows="1"
        data-testid="composer-input"
        @keydown.enter.exact.prevent="onSubmit"
      />
      <button
        type="submit"
        class="composer__send"
        data-testid="composer-send"
        :disabled="disabled || (!body.trim() && !pendingFile)"
      >
        ▶
      </button>
    </form>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import { useImageAttach } from '../composables/useImageAttach';

const props = defineProps<{ disabled?: boolean }>();
const emit = defineEmits<{
  send: [{ body: string; file: File | null }];
}>();

const body = ref('');
const pendingFile = ref<File | null>(null);
const previewUrl = ref<string | null>(null);
const attachmentError = ref<string>('');
const fileInput = ref<HTMLInputElement | null>(null);

const attach = useImageAttach();

function onFilePicked(event: Event) {
  attachmentError.value = '';
  const target = event.target as HTMLInputElement;
  const picked = target.files?.[0] ?? null;
  if (!picked) return;

  const result = attach.validate(picked);
  if (!result.ok) {
    attachmentError.value = result.reason ?? 'Invalid file';
    target.value = '';  // reset so the same file can be re-picked after fix
    return;
  }
  // Replace any prior preview before holding a new one.
  if (previewUrl.value) attach.revokePreview(previewUrl.value);
  pendingFile.value = picked;
  previewUrl.value = attach.makePreview(picked);
}

function clearAttachment() {
  if (previewUrl.value) attach.revokePreview(previewUrl.value);
  previewUrl.value = null;
  pendingFile.value = null;
  if (fileInput.value) fileInput.value.value = '';
}

function onSubmit() {
  if (props.disabled) return;
  const trimmed = body.value.trim();
  if (!trimmed && !pendingFile.value) return;
  emit('send', { body: trimmed, file: pendingFile.value });
  body.value = '';
  clearAttachment();
}

onBeforeUnmount(() => {
  if (previewUrl.value) attach.revokePreview(previewUrl.value);
});
</script>

<style scoped>
.composer {
  display: flex;
  gap: 0.5rem;
  padding: 0.6rem 0.8rem;
  border-top: 1px solid var(--vbwd-border, #e5e7eb);
  background: var(--vbwd-card-bg, #fff);
  align-items: end;
}
.composer__input {
  flex: 1;
  resize: none;
  border: 1px solid var(--vbwd-border, #d1d5db);
  border-radius: 18px;
  padding: 0.55rem 0.9rem;
  font-family: inherit;
  font-size: 0.95rem;
  background: var(--vbwd-card-bg, #fff);
  color: var(--vbwd-text, #222);
  max-height: 8rem;
  line-height: 1.4;
}
.composer__attach,
.composer__send {
  padding: 0.5rem 0.8rem;
  background: var(--vbwd-color-primary, #3b82f6);
  color: #fff;
  border: 0;
  border-radius: 18px;
  cursor: pointer;
  font-size: 1rem;
}
.composer__attach { background: var(--vbwd-card-bg-soft, #f3f4f6); color: var(--vbwd-text, #222); }
.composer__send:disabled,
.composer__attach:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.composer__preview {
  display: inline-block;
  position: relative;
  margin: 0.4rem 0.8rem 0;
}
.composer__preview img {
  max-width: 140px;
  max-height: 140px;
  border-radius: 8px;
  display: block;
}
.composer__preview-x {
  position: absolute;
  top: -0.4rem; right: -0.4rem;
  width: 1.4rem; height: 1.4rem;
  border-radius: 50%; border: 0;
  background: var(--vbwd-color-danger, #e74c3c);
  color: #fff; font-size: 0.7rem;
  cursor: pointer;
}
.composer__error {
  color: var(--vbwd-color-danger, #e74c3c);
  font-size: 0.8rem;
  margin: 0.2rem 0.8rem 0;
}
</style>
