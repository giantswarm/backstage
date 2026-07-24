// Ambient module declaration so the scoped Storybook typecheck
// (tsconfig.storybook.json) accepts the bui CSS side-effect import in
// preview.tsx. At runtime the Vite builder handles `.css` imports natively; the
// app itself gets these types from `@backstage/cli/asset-types`.
declare module '*.css';
