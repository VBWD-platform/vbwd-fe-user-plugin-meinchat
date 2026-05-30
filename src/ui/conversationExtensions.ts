// S28.3b — conversation-view UI seams (core agnostic; gnostic in the plugin).
//
// meinchat owns ConversationView but knows nothing about encryption. A plugin
// (meinchat-plus) registers an OVERLAY component (e.g. the secure-chat pairing
// gate) and a COMPOSER PRECHECK; meinchat renders/consults them. Both are
// optional — meinchat-alone renders no overlay and never blocks the composer.

import type { Component } from 'vue';
import type { ConversationRow } from '../api';

let overlay: Component | null = null;

/** Register a component overlaid inside the conversation (bound `:conversation`). */
export function registerConversationOverlay(component: Component): void {
  overlay = component;
}

export function getConversationOverlay(): Component | null {
  return overlay;
}

export interface ComposerPrecheckResult {
  canSend: boolean;
  hint?: string;
}

export type ComposerPrecheck = (
  conversation: ConversationRow,
) => Promise<ComposerPrecheckResult>;

let precheck: ComposerPrecheck | null = null;

export function registerComposerPrecheck(fn: ComposerPrecheck): void {
  precheck = fn;
}

export function getComposerPrecheck(): ComposerPrecheck | null {
  return precheck;
}

/** Test/teardown helper. */
export function resetConversationExtensions(): void {
  overlay = null;
  precheck = null;
}
