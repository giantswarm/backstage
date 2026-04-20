import { lazy } from 'react';
import { SubPageBlueprint } from '@backstage/frontend-plugin-api';

const LazyGeneralSettings = lazy(async () => {
  const [
    {
      UserSettingsProfileCard,
      UserSettingsAppearanceCard,
      UserSettingsIdentityCard,
    },
    { Content },
    { default: Grid },
  ] = await Promise.all([
    import('@backstage/plugin-user-settings'),
    import('@backstage/core-components'),
    import('@material-ui/core/Grid'),
  ]);

  return {
    default: ({ showIdentityCard }: { showIdentityCard: boolean }) => (
      <Content>
        <Grid container direction="row" spacing={3}>
          <Grid item xs={12} md={6}>
            <UserSettingsProfileCard />
          </Grid>
          <Grid item xs={12} md={6}>
            <UserSettingsAppearanceCard />
          </Grid>
          {showIdentityCard && (
            <Grid item xs={12} md={6}>
              <UserSettingsIdentityCard />
            </Grid>
          )}
        </Grid>
      </Content>
    ),
  };
});

export const GeneralPage = SubPageBlueprint.makeWithOverrides({
  name: 'general',
  config: {
    schema: {
      showIdentityCard: z => z.boolean().default(true),
    },
  },
  factory(originalFactory, { config }) {
    const showIdentityCard = config.showIdentityCard;
    return originalFactory({
      path: 'general',
      title: 'General',
      loader: async () => (
        <LazyGeneralSettings showIdentityCard={showIdentityCard} />
      ),
    });
  },
});
