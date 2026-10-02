import { parseInline, parseMarkdown, stripUiFence } from '../RichText';

describe('parseInline', () => {
  it('tách đậm, nghiêng, mã', () => {
    expect(parseInline('Doanh thu **4.850.000đ** hôm nay, _tăng 12%_, mã `HD001`')).toEqual([
      { text: 'Doanh thu ' },
      { text: '4.850.000đ', bold: true },
      { text: ' hôm nay, ' },
      { text: 'tăng 12%', italic: true },
      { text: ', mã ' },
      { text: 'HD001', code: true },
    ]);
  });

  it('không coi phép nhân có khoảng trắng là in nghiêng', () => {
    expect(parseInline('3 * 4 * 5')).toEqual([{ text: '3 * 4 * 5' }]);
  });

  it('link markdown http(s) → link; scheme khác chỉ giữ chữ', () => {
    expect(parseInline('Xem [chính sách](https://cici21chualang.vn/chinh-sach) nhé')).toEqual([
      { text: 'Xem ' },
      { text: 'chính sách', link: 'https://cici21chualang.vn/chinh-sach' },
      { text: ' nhé' },
    ]);
    expect(parseInline('[bấm](javascript:alert(1))')).toEqual([{ text: 'bấm' }, { text: ')' }]);
    expect(parseInline('[gọi](tel:0900000000)')).toEqual([{ text: 'gọi' }]);
  });

  it('URL trần thành link, bỏ dấu câu cuối; dấu _ trong URL không thành nghiêng', () => {
    expect(parseInline('Mở https://a.vn/x_y_z.')).toEqual([
      { text: 'Mở ' },
      { text: 'https://a.vn/x_y_z', link: 'https://a.vn/x_y_z' },
      { text: '.' },
    ]);
  });

  it('link trong chữ đậm vẫn bấm được', () => {
    expect(parseInline('**[Phiếu](https://a.vn)**')).toEqual([{ text: 'Phiếu', link: 'https://a.vn', bold: true }]);
  });
});

describe('parseMarkdown', () => {
  it('bảng GFM: tiêu đề, dòng --- , ô thừa / thiếu cân theo tiêu đề', () => {
    const md = 'Top bán chạy:\n\n| Sản phẩm | SL |\n|---|:---:|\n| Ốp lưng | 12 |\n| Cáp sạc | 7 | dư |\n| Kính |\n\nHết.';
    expect(parseMarkdown(md)).toEqual([
      { type: 'paragraph', text: 'Top bán chạy:' },
      {
        type: 'table',
        header: ['Sản phẩm', 'SL'],
        rows: [
          ['Ốp lưng', '12'],
          ['Cáp sạc', '7'],
          ['Kính', ''],
        ],
      },
      { type: 'paragraph', text: 'Hết.' },
    ]);
  });

  it('\\| trong ô là ký tự |', () => {
    const [table] = parseMarkdown('| A | B |\n| --- | --- |\n| x \\| y | z |');
    expect(table).toEqual({ type: 'table', header: ['A', 'B'], rows: [['x | y', 'z']] });
  });

  it('khối mã ``` (kể cả chưa đóng khi đang stream)', () => {
    expect(parseMarkdown('Lệnh:\n```bash\nnpm i\nnpm test\n```\nXong')).toEqual([
      { type: 'paragraph', text: 'Lệnh:' },
      { type: 'code', lang: 'bash', text: 'npm i\nnpm test' },
      { type: 'paragraph', text: 'Xong' },
    ]);
    expect(parseMarkdown('```\nđang gõ')).toEqual([{ type: 'code', lang: undefined, text: 'đang gõ' }]);
  });

  it('tiêu đề, gạch đầu dòng lồng, danh sách số, trích dẫn, đoạn nhiều dòng', () => {
    expect(parseMarkdown('## Lịch tuần\n- Thứ 2\n  - Ca sáng\n1. Đổi ca\n> Lưu ý: ca tối\ndòng 1\ndòng 2')).toEqual([
      { type: 'heading', level: 2, text: 'Lịch tuần' },
      { type: 'bullet', text: 'Thứ 2', depth: 0 },
      { type: 'bullet', text: 'Ca sáng', depth: 1 },
      { type: 'numbered', n: '1', text: 'Đổi ca', depth: 0 },
      { type: 'quote', text: 'Lưu ý: ca tối' },
      { type: 'paragraph', text: 'dòng 1\ndòng 2' },
    ]);
  });

  it('bỏ khối spark-ui khỏi phần hiển thị', () => {
    const md = 'Doanh thu **4tr**\n\n```spark-ui\n{"blocks":[]}\n```';
    expect(parseMarkdown(md)).toEqual([{ type: 'paragraph', text: 'Doanh thu **4tr**' }]);
  });
});

describe('stripUiFence', () => {
  it('cắt khối đã đóng', () => {
    expect(stripUiFence('Trả lời.\n\n```spark-ui\n{"blocks":[{"type":"link"}]}\n```\n')).toBe('Trả lời.');
  });

  it('cắt khối chưa đóng (đang stream) và các biến thể tên', () => {
    expect(stripUiFence('Trả lời.\n```spark_ui\n{"blocks":[{"ty')).toBe('Trả lời.');
    expect(stripUiFence('Trả lời.\n  ```  sparkui')).toBe('Trả lời.');
  });

  it('không đụng khối mã thường', () => {
    const md = 'Ví dụ:\n```json\n{"a":1}\n```';
    expect(stripUiFence(md)).toBe(md);
  });
});
