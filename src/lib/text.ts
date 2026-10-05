/** Plain-text excerpt of a markdown string for cards and search results. */
export function excerpt(markdown: string | undefined | null, max = 160): string {
  if (!markdown) return '';
  const text = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^\s*\|?\s*:?-{3,}.*$/gm, ' ') // table separator rows
    .replace(/^\s*([-*_]\s*){3,}$/gm, ' ') // horizontal rules
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ') // images
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1') // links -> text
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '') // headings, quotes, lists
    .replace(/[*_~`|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

export function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '');
}

export function timeAgo(iso: string | undefined): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}
