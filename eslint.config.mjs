import {defineConfig,globalIgnores} from 'eslint/config';
import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default defineConfig([
  {...js.configs.recommended,languageOptions:{...js.configs.recommended.languageOptions,globals:{...globals.browser,...globals.node}}},
  {
    files:['**/*.{ts,tsx}'],
    languageOptions:{parser:tsParser,parserOptions:{ecmaVersion:'latest',sourceType:'module',ecmaFeatures:{jsx:true}}},
    plugins:{'@typescript-eslint':tsPlugin,react,'react-hooks':reactHooks},
    settings:{react:{version:'detect'}},
    rules:{'no-undef':'off',...tsPlugin.configs.recommended.rules,...react.configs.recommended.rules,...reactHooks.configs.recommended.rules,'no-unused-vars':'off','@typescript-eslint/no-unused-vars':['warn',{argsIgnorePattern:'^_',varsIgnorePattern:'^_'}],'react/prop-types':'off','react/react-in-jsx-scope':'off','no-control-regex':'off','no-empty':'off','no-useless-escape':'off'},
  },
  {
    files:['components/ui/**/*.{ts,tsx}','hooks/use-mobile.ts'],
    rules:{'@typescript-eslint/no-unused-vars':'off','react-hooks/purity':'off','react-hooks/set-state-in-effect':'off'},
  },
  globalIgnores(['.next/**','out/**','dist/**','build/**','node_modules/**','tests/fixtures/**','next-env.d.ts']),
]);
