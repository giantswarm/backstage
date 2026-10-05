import { Key } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Content, EmptyState, Progress } from '@backstage/core-components';
import { Box, Tab, TabList, TabPanel, Tabs } from '@backstage/ui';
import { useApi } from '@backstage/frontend-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { plansApiRef } from '../../apis';
import { MagazineHistoryTab } from '../MagazineHistoryTab';
import { MagazineKnowledgeTab } from '../MagazineKnowledgeTab';
import { MagazineNowTab } from '../MagazineNowTab';
import { PlansErrorAlert } from '../PlansErrorAlert';

const TABS = ['now', 'history', 'knowledge'] as const;
type MagazineTab = (typeof TABS)[number];

function tabFromParam(value: string | null): MagazineTab {
  return TABS.find(tab => tab === value) ?? 'now';
}

/**
 * The team's product magazine: what it works on now, what shipped, and
 * what it knows, read from the repository in `plans.magazine`. The tab
 * lives in `?tab=`, so every view is a shareable link.
 */
export function MagazinePage() {
  const plansApi = useApi(plansApiRef);
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = tabFromParam(searchParams.get('tab'));

  const selectTab = (key: Key) =>
    setSearchParams(
      prev => {
        // Each tab keeps only its own parameters.
        const params = new URLSearchParams();
        params.set('tab', String(key));
        if (key === 'history' && prev.has('window')) {
          params.set('window', prev.get('window')!);
        }
        if (key === 'knowledge' && prev.has('doc')) {
          params.set('doc', prev.get('doc')!);
        }
        return params;
      },
      { replace: true },
    );

  const { data, isLoading, error } = useQuery({
    queryKey: ['plans', 'magazine-config'],
    queryFn: () => plansApi.getMagazine(),
  });

  if (isLoading) {
    return (
      <Content>
        <Progress />
      </Content>
    );
  }
  if (error) {
    return (
      <Content>
        <PlansErrorAlert
          title="Failed to load the magazine"
          error={error as Error}
        />
      </Content>
    );
  }
  if (!data?.configured) {
    return (
      <Content>
        <EmptyState
          missing="info"
          title="No magazine here"
          description="This portal has no product magazine configured (plans.magazine.repository)."
        />
      </Content>
    );
  }

  const generated = { repository: data.repository, ref: data.ref };
  const knowledge = { repository: data.repository, ref: data.knowledgeRef };

  return (
    <Content>
      <Tabs selectedKey={tab} onSelectionChange={selectTab}>
        <TabList aria-label="Magazine views">
          <Tab id="now">Now</Tab>
          <Tab id="history">History</Tab>
          <Tab id="knowledge">Knowledge</Tab>
        </TabList>
        <TabPanel id="now">
          <Box pt="4">
            <MagazineNowTab source={generated} />
          </Box>
        </TabPanel>
        <TabPanel id="history">
          <Box pt="4">
            <MagazineHistoryTab source={generated} />
          </Box>
        </TabPanel>
        <TabPanel id="knowledge">
          <Box pt="4">
            <MagazineKnowledgeTab source={knowledge} />
          </Box>
        </TabPanel>
      </Tabs>
    </Content>
  );
}
