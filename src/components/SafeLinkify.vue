<template>
  <span>
    <template
      v-for="(part, idx) in parts"
      :key="idx"
    >
      <a
        v-if="part.type === 'link'"
        :href="part.text"
        target="_blank"
        rel="noopener noreferrer"
      >{{ part.text }}</a>
      <template v-else>{{ part.text }}</template>
    </template>
  </span>
</template>

<script setup lang="ts">
/**
 * Linkify text safely — only emit <a> for parsed URLs whose scheme is
 * http: or https:. Everything else falls through to a text node, which
 * Vue auto-escapes against XSS.
 *
 * Why not innerHTML+regex: any `v-html` exposes the surface to script
 * injection. Keeping URL detection as a pure split into typed segments
 * makes the template render via {{ }} interpolation only — Vue handles
 * the escaping.
 */
import { computed } from 'vue';

const props = defineProps<{ text: string }>();

interface TextPart { type: 'text'; text: string; }
interface LinkPart { type: 'link'; text: string; }
type Part = TextPart | LinkPart;

const URL_RE = /\bhttps?:\/\/[^\s<>]+/g;

function isSafe(candidate: string): boolean {
  // Use the URL parser instead of regex-only — `javascript:` URLs that
  // somehow slipped past the regex would still fail the scheme check.
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

const parts = computed<Part[]>(() => {
  const out: Part[] = [];
  let lastIndex = 0;
  for (const match of props.text.matchAll(URL_RE)) {
    const start = match.index ?? 0;
    if (start > lastIndex) {
      out.push({ type: 'text', text: props.text.slice(lastIndex, start) });
    }
    const candidate = match[0];
    if (isSafe(candidate)) {
      out.push({ type: 'link', text: candidate });
    } else {
      out.push({ type: 'text', text: candidate });
    }
    lastIndex = start + candidate.length;
  }
  if (lastIndex < props.text.length) {
    out.push({ type: 'text', text: props.text.slice(lastIndex) });
  }
  return out;
});
</script>

<style scoped>
a {
  color: var(--vbwd-color-primary, #3b82f6);
  text-decoration: underline;
  word-break: break-all;
}
</style>
