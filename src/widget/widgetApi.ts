/**
 * S86.3 — narrow API surface the `MeinchatChatWidget` depends on (ISP).
 *
 * The widget consumes only these functions; re-exporting them through one
 * module keeps the component's dependency narrow and gives tests a single,
 * stable mock point instead of stubbing global `fetch` ad hoc.
 */
export { isAuthenticated } from '@/api';
export {
  getMyNickname,
  setMyNickname,
  startWidgetConversation,
  listRoomMessages,
  sendRoomMessage,
  markRoomRead,
  getWidgetBalance,
} from '../api';
export type {
  MessageRow,
  RoomMemberRow,
  WidgetStartResult,
  RoomSendResult,
} from '../api';
