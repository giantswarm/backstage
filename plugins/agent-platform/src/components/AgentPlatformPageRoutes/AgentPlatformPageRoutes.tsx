import type { ReactElement } from 'react';
import { Helmet } from 'react-helmet';
import { Navigate, Route, Routes } from 'react-router-dom';
import { BreadcrumbEntry } from '@backstage/frontend-plugin-api';
import { PageHeaderActionsProvider } from '@giantswarm/backstage-plugin-ui-react';

export type AgentPlatformSubPage = {
  path: string;
  title?: string;
  element: ReactElement;
};

/**
 * The page's sub-pages routed the way `PageBlueprint` routes its tabs, for the
 * page rendered without its tab strip: a bare path lands on the first one, and
 * each names itself in the document title as its tab would.
 *
 * No header of its own: every view in the shell draws its page frame itself
 * (`ShellPage`, `WizardFrame`) or redirects. A generic sub-page header here —
 * "Agents" in a different type scale and position, standing aside once the
 * view's frame claimed the header — was all a person saw while the view's
 * code chunk or its cookie loaded: on every navigation into an agent, a
 * session or a model, the section's list header first, then the real page
 * (T95/T46b-B2). Until the view renders, the content area stays empty.
 *
 * The page renders without the app's page layout, so the header-actions slot
 * that layout would provide is mounted here: the actions a sub-page registers
 * with `useProvidePageHeaderActions` render in its frame's header.
 */
export function AgentPlatformPageRoutes({
  pageTitle,
  pages,
}: {
  pageTitle: string;
  pages: AgentPlatformSubPage[];
}) {
  const firstPath = pages[0]?.path;
  return (
    <PageHeaderActionsProvider>
      <Routes>
        {firstPath && (
          <Route index element={<Navigate to={firstPath} replace />} />
        )}
        {pages.map(page => {
          const label = page.title || page.path;
          return (
            <Route
              key={page.path}
              path={`${page.path}/*`}
              element={
                <BreadcrumbEntry entry={{ label, href: page.path }}>
                  <Helmet title={`${label} · ${pageTitle}`} />
                  {page.element}
                </BreadcrumbEntry>
              }
            />
          );
        })}
      </Routes>
    </PageHeaderActionsProvider>
  );
}
