import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  { ignores: ['dist/**', 'src/lib/api/schema.d.ts', 'src/components/ui/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true, allowExportNames: ['detectLocale', 'usePreferences', 'useI18n', 'useAppData', 'useMe', 'focusInvalid', 'useUnsaved', 'iconNames', 'iconRegistry'] }],
    },
  },
  { files: ['vite.config.ts', '**/*.test.{ts,tsx}', 'src/test/**'], languageOptions: { globals: globals.node } },
);
