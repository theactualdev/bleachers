import react from '@bleachers/config/eslint/react';

export default [
  ...react,
  {
    ignores: ['.next/**', 'next-env.d.ts', 'tests-e2e/**', 'scripts/**', 'public/**'],
  },
];
