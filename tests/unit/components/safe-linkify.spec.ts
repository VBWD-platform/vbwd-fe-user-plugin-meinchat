import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import SafeLinkify from '../../../src/components/SafeLinkify.vue';

describe('SafeLinkify', () => {
  it('renders plain text unchanged', () => {
    const wrapper = mount(SafeLinkify, { props: { text: 'hello world' } });
    expect(wrapper.text()).toBe('hello world');
  });

  it('escapes HTML — never renders <script> or arbitrary tags', () => {
    const xss = '<script>alert(1)</script>';
    const wrapper = mount(SafeLinkify, { props: { text: xss } });
    // No script element ever ends up in the DOM.
    expect(wrapper.find('script').exists()).toBe(false);
    // The literal text appears as a text node, escaped by Vue.
    expect(wrapper.text()).toContain('alert(1)');
  });

  it('linkifies http(s) URLs into safe <a> tags', () => {
    const wrapper = mount(SafeLinkify, {
      props: { text: 'see https://example.com for more' },
    });
    const link = wrapper.find('a');
    expect(link.exists()).toBe(true);
    expect(link.attributes('href')).toBe('https://example.com');
    expect(link.attributes('target')).toBe('_blank');
    expect(link.attributes('rel')).toBe('noopener noreferrer');
    expect(link.text()).toBe('https://example.com');
  });

  it('rejects javascript: URLs (XSS protection)', () => {
    const wrapper = mount(SafeLinkify, {
      props: { text: 'click javascript:alert(1) please' },
    });
    expect(wrapper.find('a').exists()).toBe(false);
    // Falls through as plain (escaped) text.
    expect(wrapper.text()).toContain('javascript:alert(1)');
  });

  it('rejects unknown / non-http schemes', () => {
    const wrapper = mount(SafeLinkify, {
      props: { text: 'email me at mailto:bob@example.com' },
    });
    expect(wrapper.find('a').exists()).toBe(false);
  });

  it('handles multiple URLs in a single message', () => {
    const wrapper = mount(SafeLinkify, {
      props: { text: 'https://a.com and https://b.com' },
    });
    const links = wrapper.findAll('a');
    expect(links).toHaveLength(2);
    expect(links[0].attributes('href')).toBe('https://a.com');
    expect(links[1].attributes('href')).toBe('https://b.com');
  });
});
