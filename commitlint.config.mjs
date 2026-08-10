// Format commit kết hợp Conventional Commits + mã ticket Jira (scope):
//   type(AOFP-12): mô tả ngắn gọn
// Ví dụ: feat(AOFP-12): add Shopee webhook configuration
//        fix(AOFP-15): resolve duplicate order detection bug
//
// Kế thừa toàn bộ rule chuẩn của Conventional Commits (type-enum, subject-case,
// subject-full-stop, header-max-length...) + thêm rule bắt buộc scope đúng format AOFP-<số>.

const VAGUE_WORDS = ['update', 'fix stuff', 'wip', 'misc', 'changes', 'stuff'];

export default {
  extends: ['@commitlint/config-conventional'],
  plugins: [
    {
      rules: {
        'scope-ticket-format': (parsed) => {
          const { scope } = parsed;
          if (!scope) {
            return [
              false,
              'Thiếu mã ticket. Format bắt buộc: type(AOFP-12): mô tả, ví dụ: feat(AOFP-12): add Shopee webhook configuration',
            ];
          }
          if (!/^AOFP-\d+$/.test(scope)) {
            return [
              false,
              `Scope "${scope}" sai format. Phải đúng dạng AOFP-<số>, ví dụ: feat(AOFP-12): ...`,
            ];
          }
          return [true];
        },
        'subject-not-vague': (parsed) => {
          const { subject } = parsed;
          if (!subject) return [true];
          const lower = subject.toLowerCase().trim();
          if (VAGUE_WORDS.some((w) => lower === w || lower.startsWith(w + ' '))) {
            return [
              false,
              `Mô tả commit quá chung chung ("${subject}"). Hãy nói rõ đã thay đổi gì.`,
            ];
          }
          return [true];
        },
      },
    },
  ],
  rules: {
    'header-max-length': [2, 'always', 100],
    'scope-empty': [2, 'never'], // bắt buộc phải có scope = mã ticket
    'scope-ticket-format': [2, 'always'],
    'subject-not-vague': [2, 'always'],
  },
};
