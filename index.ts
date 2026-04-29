import type { IPlugin, IPlatformSDK } from 'vbwd-view-component';
import { userNavRegistry } from '@/plugins/userNavRegistry';
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
  version: '1.0.0',
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
  },

  activate() {
    this._active = true;
    userNavRegistry.register({
      pluginName: 'meinchat',
      to: '/dashboard/messages',
      labelKey: 'meinchat.nav.messages',
      testId: 'nav-messages',
    });
  },

  deactivate() {
    this._active = false;
    userNavRegistry.unregister('meinchat');
  },
};
