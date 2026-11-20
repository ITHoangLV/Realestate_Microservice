/** `@Transform(trim)`: cắt khoảng trắng hai đầu chuỗi trước khi kiểm độ dài (không đổi giá trị không phải chuỗi). */
export const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;
