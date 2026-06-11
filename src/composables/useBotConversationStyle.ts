/**
 * S70.4 — fetch the active portable bot-conversation style and apply its
 * tokens as `--vbwd-botchat-*` CSS custom properties on a target element.
 *
 * The bubble component already styles cards / menu / cart entirely from these
 * vars with baked-in fallbacks, so a missing or failed fetch simply leaves the
 * defaults in place — applying the style NEVER blocks or breaks rendering.
 *
 * Tokens arrive snake_cased (server whitelist: `card_bg`, `card_border`,
 * `card_radius`, `card_fg`, `accent`, `badge_bg`, `badge_fg`, `hint`, `gap`)
 * and map 1:1 to `--vbwd-botchat-<kebab-case>`.
 */
import { getActiveBotConversationStyle } from '../api';

function toCssVariableName(tokenKey: string): string {
  return `--vbwd-botchat-${tokenKey.replace(/_/g, '-')}`;
}

export async function applyBotConversationStyle(target: HTMLElement): Promise<void> {
  try {
    const style = await getActiveBotConversationStyle();
    for (const [tokenKey, value] of Object.entries(style.tokens ?? {})) {
      target.style.setProperty(toCssVariableName(tokenKey), value);
    }
  } catch {
    // Best-effort theming — the CSS fallbacks in MessageBubble stay in effect.
  }
}
