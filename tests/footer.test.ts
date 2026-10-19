import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Footer from '../src/components/Footer';
import { brand } from '../src/config/brand';
import { copy } from '../src/content/copy';

const relayGroups = ['1128696905', '1128696207', '1073906047', '1131157206'];

describe('community QQ contacts', () => {
  it('preserves the main group and the supplied relay group order', () => {
    expect(brand.qqGroup).toBe('1097270072');
    expect(brand.qqRelayGroups).toEqual(relayGroups);
  });

  for (const locale of ['zh', 'en'] as const) {
    it(`renders four labeled relay groups with distinct copy controls in ${locale}`, () => {
      const t = copy[locale];
      const html = renderToStaticMarkup(createElement(Footer, { t }));
      expect(html).toContain('<strong>1097270072</strong>');
      expect(html.match(/class="qq-group qq-relay-group"/g)).toHaveLength(4);
      relayGroups.forEach((number, index) => {
        const label = locale === 'zh' ? `聊天中转${index + 1}群` : `Chat relay ${index + 1}`;
        expect(html).toContain(`${label} <strong>${number}</strong>`);
        expect(html).toContain(`aria-label="${t.copyQq} ${number}"`);
        if (index > 0) expect(html.indexOf(number)).toBeGreaterThan(html.indexOf(relayGroups[index - 1]));
      });
      expect(html).toContain(`href="${brand.telegramUrl}"`);
      expect(html).toContain('https://m.debox.pro/group?id=eoaydsq4&amp;code=zgvne98v');
      expect(html).not.toMatch(/href="[^"]*(?:qun\.qq\.com|mqqapi:)/);
    });
  }
});
