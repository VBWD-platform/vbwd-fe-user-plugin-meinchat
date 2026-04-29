<template>
  <div
    class="dialog-backdrop"
    data-testid="token-transfer-dialog"
    @click.self="$emit('cancel')"
  >
    <form
      class="dialog"
      @submit.prevent="onSubmit"
    >
      <h2>{{ $t('meinchat.transfer.title') }}</h2>
      <p class="dialog__sub">
        {{ $t('meinchat.transfer.to') }} <strong>@{{ peerNickname }}</strong>
      </p>
      <label>
        {{ $t('meinchat.transfer.amount') }}
        <input
          v-model.number="amount"
          type="number"
          min="1"
          step="1"
          required
          autofocus
          data-testid="token-transfer-amount"
        >
      </label>
      <label>
        {{ $t('meinchat.transfer.note') }}
        <input
          v-model="note"
          type="text"
          maxlength="200"
          data-testid="token-transfer-note"
        >
      </label>
      <p
        v-if="error"
        class="dialog__error"
      >
        {{ error }}
      </p>
      <p
        v-if="success"
        class="dialog__success"
      >
        {{ success }}
      </p>
      <div class="dialog__actions">
        <button
          type="button"
          @click="$emit('cancel')"
        >
          {{ $t('meinchat.cancel') }}
        </button>
        <button
          type="submit"
          :disabled="amount < 1 || saving"
          data-testid="token-transfer-submit"
        >
          {{ $t('meinchat.transfer.send') }}
        </button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { sendTokens } from '../api';

const props = defineProps<{ peerNickname: string }>();
const emit = defineEmits<{
  sent: [{ transfer_id: string; amount: number; new_balance: number | null }];
  cancel: [];
}>();

const amount = ref<number>(1);
const note = ref('');
const error = ref('');
const success = ref('');
const saving = ref(false);

async function onSubmit() {
  error.value = '';
  success.value = '';
  saving.value = true;
  try {
    const result = await sendTokens({
      to_nickname: props.peerNickname,
      amount: Number(amount.value),
      note: note.value || undefined,
    });
    success.value = `Sent ${result.amount} tokens. New balance: ${result.new_balance ?? '?'}`;
    emit('sent', {
      transfer_id: result.transfer_id,
      amount: result.amount,
      new_balance: result.new_balance,
    });
  } catch (err: any) {
    error.value = err?.error || 'Transfer failed';
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.dialog-backdrop {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000;
}
.dialog {
  background: var(--vbwd-card-bg, #fff);
  color: var(--vbwd-text, #222);
  padding: 1.4rem;
  border-radius: 10px;
  min-width: 320px; max-width: 92vw;
  display: flex; flex-direction: column; gap: 0.7rem;
}
.dialog h2 { margin: 0 0 0.2rem; }
.dialog__sub { margin: 0; color: var(--vbwd-text-muted, #6b7280); }
.dialog label { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.85rem; }
.dialog input {
  padding: 0.45rem 0.6rem;
  border-radius: 6px;
  border: 1px solid var(--vbwd-border, #d1d5db);
  background: var(--vbwd-card-bg, #fff);
  color: var(--vbwd-text, #222);
}
.dialog__error { color: var(--vbwd-color-danger, #e74c3c); margin: 0; }
.dialog__success { color: var(--vbwd-color-success, #16a34a); margin: 0; }
.dialog__actions { display: flex; justify-content: flex-end; gap: 0.5rem; }
.dialog__actions button {
  padding: 0.45rem 0.9rem; border-radius: 6px; border: 0; cursor: pointer;
}
.dialog__actions button[type='submit'] {
  background: var(--vbwd-color-primary, #3b82f6); color: #fff;
}
.dialog__actions button[type='submit']:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
