import base from '@bleachers/config/eslint/base';

export default [
  ...base,
  {
    rules: {
      // Nest DI relies on decorator metadata; allow parameter properties etc.
      '@typescript-eslint/no-extraneous-class': 'off',
      // NestJS injects classes via constructor metadata at runtime. `consistent-type-imports`
      // can't see that and would rewrite injected deps to `import type`, erasing the metadata
      // and breaking DI. Disable it for the API — value imports of injected classes are correct.
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
];
