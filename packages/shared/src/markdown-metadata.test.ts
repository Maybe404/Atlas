import { describe, expect, test } from 'bun:test';
import { extractMarkdownMetadata } from './markdown-metadata';

describe('extractMarkdownMetadata', () => {
  test('takes title from first ATX heading and summary from first paragraph', () => {
    const md = `# 部署清单\n\n这是**第一段**正文，用作摘要。\n\n## 小节\n更多内容`;
    const { title, summary } = extractMarkdownMetadata(md, { fallbackTitle: 'x.md' });
    expect(title).toBe('部署清单');
    expect(summary).toBe('这是第一段正文，用作摘要。');
  });

  test('falls back to provided title when no heading exists', () => {
    const md = `只是一段普通文字，没有标题。`;
    const { title, summary } = extractMarkdownMetadata(md, { fallbackTitle: 'notes.md' });
    expect(title).toBe('notes');
    expect(summary).toBe('只是一段普通文字，没有标题。');
  });

  test('skips code fences when finding the summary', () => {
    const md = '# T\n\n```js\nconst x = 1;\n```\n\n真正的摘要段落。';
    const { summary } = extractMarkdownMetadata(md, {});
    expect(summary).toBe('真正的摘要段落。');
  });
});
