import { sanitizeShareFormRichText } from './share-form-rich-text';

describe('sanitizeShareFormRichText', () => {
  it('keeps simple text formatting and removes executable or unsupported content', () => {
    const result = sanitizeShareFormRichText(`
      <p style="text-align:center;background:red">
        <b>重点</b>
        <font color="#ff0000" size="5">红色大字</font>
        <span style="font-size:18px;color:rgb(1, 2, 3);position:fixed">说明</span>
        <script>alert(1)</script>
        <img src=x onerror=alert(2)>
      </p>
    `);

    expect(result).toContain('<b>重点</b>');
    expect(result).toContain('<font color="#ff0000" size="5">红色大字</font>');
    expect(result).toContain('font-size:18px');
    expect(result).toContain('color:rgb(1, 2, 3)');
    expect(result).toContain('text-align:center');
    expect(result).not.toContain('background');
    expect(result).not.toContain('position');
    expect(result).not.toContain('script');
    expect(result).not.toContain('img');
    expect(result).not.toContain('alert');
  });

  it('returns null for empty rich text', () => {
    expect(sanitizeShareFormRichText('   ')).toBeNull();
  });
});
