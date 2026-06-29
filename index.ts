import type { IPlugin, IPlatformSDK } from 'vbwd-view-component';
import { userNavRegistry } from '@/plugins/userNavRegistry';
import { registerProfileSection } from '@/registries/profileSectionsRegistry';
import ProfileNicknameSection from './src/components/ProfileNicknameSection.vue';
import MeinchatRetentionSection from './src/components/MeinchatRetentionSection.vue';
import { useMeinchatStore } from './src/stores/useMeinchatStore';
import { useLocalMessageCache } from './src/composables/useLocalMessageCache';
import { loadKek } from './src/composables/loadKek';
import en from './locales/en.json';
import de from './locales/de.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import ja from './locales/ja.json';
import ru from './locales/ru.json';
import th from './locales/th.json';
import zh from './locales/zh.json';

export const meinchatPlugin: IPlugin = {
  name: 'meinchat',
  version: '26.6.1',
  description:
    'Direct messaging between users — nickname directory, address book, ' +
    'image attachments, peer token transfer.',
  _active: false,

  install(sdk: IPlatformSDK) {
    sdk.addRoute({
      path: '/dashboard/messages',
      name: 'meinchat-inbox',
      component: () => import('./src/views/InboxView.vue'),
      meta: { requiresAuth: true },
    });
    sdk.addRoute({
      path: '/dashboard/messages/contacts',
      name: 'meinchat-contacts',
      component: () => import('./src/views/ContactsView.vue'),
      meta: { requiresAuth: true },
    });
    // S86.1 — room view. Registered BEFORE the catch-all `:nickname` route so
    // `/dashboard/messages/rooms/<id>` resolves to the room view, not a
    // conversation with a peer literally nicknamed "rooms".
    sdk.addRoute({
      path: '/dashboard/messages/rooms/:roomId',
      name: 'meinchat-room',
      component: () => import('./src/views/RoomView.vue'),
      meta: { requiresAuth: true },
      props: true,
    });
    sdk.addRoute({
      path: '/dashboard/messages/:nickname',
      name: 'meinchat-conversation',
      component: () => import('./src/views/ConversationView.vue'),
      meta: { requiresAuth: true },
      props: true,
    });
    sdk.addRoute({
      path: '/dashboard/profile/nickname',
      name: 'meinchat-nickname-settings',
      component: () => import('./src/views/NicknameSettingsView.vue'),
      meta: { requiresAuth: true },
    });

    sdk.addTranslations('en', en);
    sdk.addTranslations('de', de);
    sdk.addTranslations('es', es);
    sdk.addTranslations('fr', fr);
    sdk.addTranslations('ja', ja);
    sdk.addTranslations('ru', ru);
    sdk.addTranslations('th', th);
    sdk.addTranslations('zh', zh);

    // S86.3 — register the bot-widget as a CMS `vue-component` widget so a CMS
    // editor can drop a `MeinchatChatWidget` into a layout. Soft dependency:
    // if the CMS plugin is absent the registry import fails harmlessly and the
    // rest of messaging works unchanged.
    import('../cms/src/registry/vueComponentRegistry')
      .then(({ registerCmsVueComponent }) => {
        import('./src/components/MeinchatChatWidget.vue').then((module) => {
          registerCmsVueComponent('MeinchatChatWidget', module.default);
        });
      })
      .catch(() => {
        // CMS plugin not installed — skip widget registration.
      });

    // Inject a compact nickname picker ABOVE the core Profile cards —
    // the user picks a handle first, then sees the rest of Profile.
    // Mirrors the iOS ``ProfileNicknameSection`` placement.
    registerProfileSection({
      id: 'meinchat-nickname',
      component: ProfileNicknameSection,
      placement: 'top',
      order: 10,
    });

    // Retention info card — sits below the core Profile cards, telling
    // the user how long their chats are kept (device + server). Numbers
    // come live from /messaging/limits.
    registerProfileSection({
      id: 'meinchat-retention',
      component: MeinchatRetentionSection,
      placement: 'bottom',
      order: 50,
    });
  },

  activate() {
    this._active = true;
    userNavRegistry.register({
      pluginName: 'meinchat',
      to: '/dashboard/messages',
      labelKey: 'meinchat.nav.messages',
      testId: 'nav-messages',
    });

    // Wire the encrypted-at-rest local message cache + its eviction sweep
    // (S28.2). Best-effort: WebCrypto/IndexedDB may be unavailable (old
    // browsers, SSR, locked-down contexts) — a failure here must not break
    // messaging, which always falls back to the server window.
    void (async () => {
      try {
        const kek = await loadKek();
        const cache = useLocalMessageCache(kek);
        useMeinchatStore().boot({ cache });
      } catch {
        // Cache stays disabled; openConversation runs server-only.
      }
    })();
  },

  deactivate() {
    this._active = false;
    userNavRegistry.unregister('meinchat');
  },
};
