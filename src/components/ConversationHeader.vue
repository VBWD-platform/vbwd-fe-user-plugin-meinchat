<template>
  <header
    class="conv-header"
    data-testid="conversation-header"
  >
    <button
      class="conv-header__back"
      type="button"
      data-testid="conversation-back"
      @click="$emit('back')"
    >
      ←
    </button>
    <div class="conv-header__peer">
      <strong>@{{ peerNickname }}</strong>
    </div>
    <button
      class="conv-header__tokens"
      type="button"
      data-testid="conversation-send-tokens"
      :disabled="disabled"
      @click="$emit('send-tokens')"
    >
      💰 {{ $t('meinchat.header.sendTokens') }}
    </button>
  </header>
</template>

<script setup lang="ts">
defineProps<{
  peerNickname: string;
  disabled?: boolean;
}>();

defineEmits<{
  back: [];
  'send-tokens': [];
}>();
</script>

<style scoped>
.conv-header {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.6rem 0.9rem;
  border-bottom: 1px solid var(--vbwd-border, #e5e7eb);
  background: var(--vbwd-card-bg, #fff);
}
.conv-header__back {
  border: 0;
  background: transparent;
  font-size: 1.2rem;
  cursor: pointer;
  color: var(--vbwd-text, #222);
}
.conv-header__peer {
  flex: 1;
  font-size: 1rem;
}
.conv-header__tokens {
  background: var(--vbwd-color-primary, #3b82f6);
  color: #fff;
  border: 0;
  padding: 0.4rem 0.8rem;
  border-radius: 14px;
  cursor: pointer;
  font-size: 0.85rem;
}
.conv-header__tokens:disabled { opacity: 0.45; cursor: not-allowed; }
</style>
