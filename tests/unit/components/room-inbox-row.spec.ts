import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import RoomInboxRow from '../../../src/components/RoomInboxRow.vue';

const room = (over: Partial<any> = {}) => ({
  id: 'r1',
  name: 'Team chat',
  protocol: 'plain',
  capabilities: {},
  last_message_at: '2026-06-13T00:00:00Z',
  last_message_preview: 'welcome',
  unread_count: over.unread_count ?? 0,
  last_read_at: null,
  ...over,
});

describe('RoomInboxRow (S86.1 slice 2)', () => {
  it('renders the room name and last preview', () => {
    const wrapper = mount(RoomInboxRow, { props: { room: room() } });
    expect(wrapper.text()).toContain('Team chat');
    expect(wrapper.text()).toContain('welcome');
  });

  it('shows the unread badge when unread_count > 0', () => {
    const wrapper = mount(RoomInboxRow, { props: { room: room({ unread_count: 5 }) } });
    const badge = wrapper.find('[data-testid="room-row-unread"]');
    expect(badge.exists()).toBe(true);
    expect(badge.text()).toBe('5');
  });

  it('hides the unread badge when unread_count is 0', () => {
    const wrapper = mount(RoomInboxRow, { props: { room: room({ unread_count: 0 }) } });
    expect(wrapper.find('[data-testid="room-row-unread"]').exists()).toBe(false);
  });

  it('emits click when pressed', async () => {
    const wrapper = mount(RoomInboxRow, { props: { room: room() } });
    await wrapper.find('[data-testid="room-row"]').trigger('click');
    expect(wrapper.emitted('click')).toBeTruthy();
  });
});
