import { View } from 'react-native';

import { Text } from 'src/components/ui';

// ----------------------------------------------------------------------
// Markdown tối giản cho câu trả lời của trợ lý: đoạn văn, gạch đầu dòng (- • *), danh sách số (1.),
// tiêu đề (#), **đậm**, _nghiêng_ / *nghiêng*, `mã`. Không cần thư viện markdown đầy đủ — model chỉ
// được dặn trả lời ngắn, gạch đầu dòng, số liệu in đậm.
// ----------------------------------------------------------------------

type Span = { text: string; bold?: boolean; italic?: boolean; code?: boolean };

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|_[^_\s][^_]*_|\*[^*\s][^*]*\*)/g;

export function parseInline(line: string): Span[] {
  const spans: Span[] = [];
  let last = 0;
  for (const match of line.matchAll(INLINE)) {
    const index = match.index ?? 0;
    if (index > last) spans.push({ text: line.slice(last, index) });
    const token = match[0];
    if (token.startsWith('**')) spans.push({ text: token.slice(2, -2), bold: true });
    else if (token.startsWith('`')) spans.push({ text: token.slice(1, -1), code: true });
    else spans.push({ text: token.slice(1, -1), italic: true });
    last = index + token.length;
  }
  if (last < line.length) spans.push({ text: line.slice(last) });
  return spans;
}

function Inline({ text, className }: { text: string; className?: string }) {
  return (
    <Text className={className}>
      {parseInline(text).map((s, i) => (
        <Text
          key={i}
          className={
            s.bold ? 'font-bold' : s.code ? 'font-mono text-[13px] bg-bg dark:bg-bg-dark' : s.italic ? 'italic' : undefined
          }
        >
          {s.text}
        </Text>
      ))}
    </Text>
  );
}

export function RichText({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  return (
    <View className="gap-1">
      {lines.map((raw, i) => {
        const line = raw.trimEnd();
        if (!line.trim()) return <View key={i} className="h-1" />;

        const heading = /^#{1,4}\s+(.*)$/.exec(line);
        if (heading) return <Inline key={i} text={heading[1]!} className="font-bold text-[16px]" />;

        const bullet = /^\s*[-•*]\s+(.*)$/.exec(line);
        if (bullet) {
          return (
            <View key={i} className="flex-row gap-2 pl-1">
              <Text tone="muted">•</Text>
              <View className="flex-1">
                <Inline text={bullet[1]!} />
              </View>
            </View>
          );
        }

        const numbered = /^\s*(\d+)[.)]\s+(.*)$/.exec(line);
        if (numbered) {
          return (
            <View key={i} className="flex-row gap-2 pl-1">
              <Text tone="muted" className="min-w-[18px]">{numbered[1]}.</Text>
              <View className="flex-1">
                <Inline text={numbered[2]!} />
              </View>
            </View>
          );
        }

        return <Inline key={i} text={line} />;
      })}
    </View>
  );
}
