import { ScrollView, View } from 'react-native';

import { Text } from 'src/components/ui';
import { cn } from 'src/components/ui/utils';
import { isHttpUrl, openInAppBrowser } from './links';

// ----------------------------------------------------------------------
// Markdown gọn cho câu trả lời của trợ lý (không thêm thư viện): đoạn văn, tiêu đề (#), gạch đầu dòng
// (- • * +), danh sách số (1.), trích dẫn (>), bảng GFM (dòng tiêu đề + dòng ---), khối mã ```,
// **đậm**, _nghiêng_ / *nghiêng*, `mã`, link [chữ](url) và URL trần. Link chỉ http(s) — scheme khác hiện chữ.
// Khối ```spark-ui (nút/ảnh/gợi ý) server đã cắt; ở đây cắt thêm lần nữa cho chắc (kể cả khi đang stream dở).
// ----------------------------------------------------------------------

export type Span = { text: string; bold?: boolean; italic?: boolean; code?: boolean; link?: string };

export type MdBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; level: number; text: string }
  | { type: 'bullet'; text: string; depth: number }
  | { type: 'numbered'; n: string; text: string; depth: number }
  | { type: 'quote'; text: string }
  | { type: 'code'; lang?: string; text: string }
  | { type: 'table'; header: string[]; rows: string[][] }
  | { type: 'rule' };

// Thứ tự quan trọng: link / URL trước để dấu _ * trong URL không bị hiểu là nghiêng.
const INLINE =
  /(\[[^\]\n]+\]\([^)\s]+\)|https?:\/\/[^\s<>()[\]]+|\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|_[^_\s][^_]*_|\*[^*\s][^*]*\*)/g;
const TRAILING_PUNCT = /[.,;:!?'"”’]+$/;

export function parseInline(line: string): Span[] {
  const spans: Span[] = [];
  let last = 0;
  for (const match of line.matchAll(INLINE)) {
    const index = match.index ?? 0;
    if (index > last) spans.push({ text: line.slice(last, index) });
    const token = match[0];
    if (token.startsWith('[')) {
      const m = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token)!;
      const label = m[1]!;
      // Link không phải http(s) (javascript:, tel:…) → chỉ giữ chữ.
      spans.push(isHttpUrl(m[2]) ? { text: label, link: m[2]! } : { text: label });
    } else if (/^https?:\/\//i.test(token)) {
      const trail = TRAILING_PUNCT.exec(token)?.[0] ?? '';
      const url = trail ? token.slice(0, -trail.length) : token;
      spans.push(isHttpUrl(url) ? { text: url, link: url } : { text: url });
      if (trail) spans.push({ text: trail });
    } else if (token.startsWith('**') || token.startsWith('__')) {
      for (const s of parseInline(token.slice(2, -2))) spans.push({ ...s, bold: true });
    } else if (token.startsWith('`')) {
      spans.push({ text: token.slice(1, -1), code: true });
    } else {
      for (const s of parseInline(token.slice(1, -1))) spans.push({ ...s, italic: true });
    }
    last = index + token.length;
  }
  if (last < line.length) spans.push({ text: line.slice(last) });
  return spans;
}

const UI_FENCE = /(^|\n)[ \t]*```[ \t]*spark[\s\S]*$/i;

/** Cắt khối ```spark… (ui) tới hết văn bản — kể cả khối chưa đóng khi đang stream. */
export function stripUiFence(text: string): string {
  const m = UI_FENCE.exec(text);
  return m ? text.slice(0, m.index).replace(/\s+$/, '') : text;
}

/** Tách ô bảng: bỏ | đầu/cuối, \| là ký tự |, không tách trong `mã`. */
function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells: string[] = [];
  let cur = '';
  let inCode = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (ch === '\\' && s[i + 1] === '|') {
      cur += '|';
      i++;
    } else if (ch === '`') {
      inCode = !inCode;
      cur += ch;
    } else if (ch === '|' && !inCode) {
      cells.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur.trim());
  return cells;
}

function isTableSeparator(line: string): boolean {
  if (!line.includes('-')) return false;
  const cells = splitRow(line);
  return cells.length > 0 && cells.every((c) => /^:?-{1,}:?$/.test(c)) && (line.includes('|') || cells.length > 1);
}

const FENCE_OPEN = /^\s*(`{3,}|~{3,})\s*([\w+#.-]*)\s*$/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const RULE = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/;
const QUOTE = /^\s*>\s?(.*)$/;
const BULLET = /^(\s*)[-•*+]\s+(.*)$/;
const NUMBERED = /^(\s*)(\d{1,3})[.)]\s+(.*)$/;

const depthOf = (indent: string) => Math.min(2, Math.floor(indent.replace(/\t/g, '  ').length / 2));

/** Văn bản markdown → các khối (thuần, có test). */
export function parseMarkdown(text: string): MdBlock[] {
  const lines = stripUiFence(text.replace(/\r\n?/g, '\n')).split('\n');
  const blocks: MdBlock[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ type: 'paragraph', text: para.join('\n') });
    para = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.replace(/\s+$/, '');

    const fence = FENCE_OPEN.exec(line);
    if (fence) {
      flush();
      const marker = fence[1]!;
      const body: string[] = [];
      let j = i + 1;
      while (j < lines.length && !new RegExp(`^\\s*${marker[0] === '`' ? '`' : '~'}{${marker.length},}\\s*$`).test(lines[j]!)) {
        body.push(lines[j]!);
        j++;
      }
      blocks.push({ type: 'code', lang: fence[2] || undefined, text: body.join('\n').replace(/\s+$/, '') });
      i = j; // bỏ qua dòng đóng (chưa đóng khi đang stream → tới hết)
      continue;
    }

    if (!line.trim()) {
      flush();
      continue;
    }

    if (line.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1]!)) {
      flush();
      const header = splitRow(line);
      const rows: string[][] = [];
      let j = i + 2;
      while (j < lines.length && lines[j]!.trim() && lines[j]!.includes('|')) {
        const cells = splitRow(lines[j]!);
        rows.push(header.map((_, c) => cells[c] ?? ''));
        j++;
      }
      blocks.push({ type: 'table', header, rows });
      i = j - 1;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      blocks.push({ type: 'heading', level: heading[1]!.length, text: heading[2]! });
      continue;
    }

    if (RULE.test(line)) {
      flush();
      blocks.push({ type: 'rule' });
      continue;
    }

    const quote = QUOTE.exec(line);
    if (quote) {
      flush();
      const body = [quote[1]!];
      while (i + 1 < lines.length && QUOTE.test(lines[i + 1]!)) body.push(QUOTE.exec(lines[++i]!)![1]!);
      blocks.push({ type: 'quote', text: body.join('\n').trim() });
      continue;
    }

    const bullet = BULLET.exec(line);
    if (bullet) {
      flush();
      blocks.push({ type: 'bullet', text: bullet[2]!, depth: depthOf(bullet[1]!) });
      continue;
    }

    const numbered = NUMBERED.exec(line);
    if (numbered) {
      flush();
      blocks.push({ type: 'numbered', n: numbered[2]!, text: numbered[3]!, depth: depthOf(numbered[1]!) });
      continue;
    }

    para.push(line.trim());
  }
  flush();
  return blocks;
}

/** Câu trả lời có bảng / khối mã → bong bóng nên rộng hết cỡ (bảng cuộn ngang bên trong). */
export function hasWideContent(text: string): boolean {
  return parseMarkdown(text).some((b) => b.type === 'table' || b.type === 'code');
}

function Inline({ text, className }: { text: string; className?: string }) {
  return (
    <Text className={className}>
      {parseInline(text).map((s, i) => (
        <Text
          key={i}
          onPress={s.link ? () => openInAppBrowser(s.link!) : undefined}
          className={cn(
            s.bold && 'font-bold',
            s.italic && 'italic',
            s.code && 'font-mono text-[13px] bg-bg dark:bg-bg-dark',
            s.link && 'text-primary underline'
          )}
        >
          {s.text}
        </Text>
      ))}
    </Text>
  );
}

// Độ rộng cột ước theo độ dài chữ dài nhất (mọi hàng cùng cột phải thẳng hàng trong ScrollView ngang).
function columnWidths(header: string[], rows: string[][]): number[] {
  return header.map((h, c) => {
    const longest = Math.max(h.length, ...rows.map((r) => (r[c] ?? '').replace(/[*_`]/g, '').length));
    return Math.min(220, Math.max(64, Math.round(longest * 7.5) + 20));
  });
}

function Table({ header, rows }: { header: string[]; rows: string[][] }) {
  const widths = columnWidths(header, rows);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="my-0.5">
      <View className="rounded-lg border border-line dark:border-line-dark overflow-hidden">
        {[header, ...rows].map((row, r) => (
          <View
            key={r}
            className={cn('flex-row', r === 0 ? 'bg-bg dark:bg-bg-dark' : 'border-t border-line dark:border-line-dark')}
          >
            {row.map((cell, c) => (
              <View
                key={c}
                style={{ width: widths[c] }}
                className={cn('px-2 py-1.5', c > 0 && 'border-l border-line dark:border-line-dark')}
              >
                <Inline text={cell} className={cn('text-[13px] leading-[18px]', r === 0 && 'font-semibold')} />
              </View>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function CodeBox({ text }: { text: string }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="rounded-lg bg-bg dark:bg-bg-dark">
      <Text selectable className="font-mono text-[13px] leading-[18px] px-3 py-2">
        {text}
      </Text>
    </ScrollView>
  );
}

export function RichText({ text }: { text: string }) {
  const blocks = parseMarkdown(text);
  return (
    <View className="gap-1.5">
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'heading':
            return <Inline key={i} text={b.text} className={cn('font-bold', b.level <= 2 ? 'text-[17px]' : 'text-[16px]')} />;
          case 'bullet':
            return (
              <View key={i} className="flex-row gap-2 pl-1" style={{ marginLeft: b.depth * 14 }}>
                <Text tone="muted">•</Text>
                <View className="flex-1">
                  <Inline text={b.text} />
                </View>
              </View>
            );
          case 'numbered':
            return (
              <View key={i} className="flex-row gap-2 pl-1" style={{ marginLeft: b.depth * 14 }}>
                <Text tone="muted" className="min-w-[18px]">{b.n}.</Text>
                <View className="flex-1">
                  <Inline text={b.text} />
                </View>
              </View>
            );
          case 'quote':
            return (
              <View key={i} className="border-l-2 border-line dark:border-line-dark pl-2.5">
                <Inline text={b.text} className="text-muted" />
              </View>
            );
          case 'code':
            return <CodeBox key={i} text={b.text} />;
          case 'table':
            return <Table key={i} header={b.header} rows={b.rows} />;
          case 'rule':
            return <View key={i} className="h-px bg-line dark:bg-line-dark my-1" />;
          default:
            return <Inline key={i} text={b.text} />;
        }
      })}
    </View>
  );
}
