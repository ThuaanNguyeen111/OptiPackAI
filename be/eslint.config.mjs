import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'eslint.config.mjs'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/explicit-function-return-type': [
        'warn',
        { allowExpressions: true, allowTypedFunctionExpressions: true },
      ],

      //!=============================================
      // FIX: tắt no-extraneous-class — MỌI class @Module()/@Controller()
      // rỗng trong NestJS đều ĐÚNG THIẾT KẾ (cấu hình nằm trong decorator,
      // không nằm trong class body). Rule này không hiểu decorator nên báo
      // sai (false positive). Đây là ngoại lệ chuẩn cộng đồng NestJS dùng,
      // KHÔNG phải nới lỏng an toàn — không liên quan gì đến type safety.
      //!=============================================
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },
);
