import { Fragment } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { EntityContentLayoutProps } from '@backstage/plugin-catalog-react/alpha';
import { EntityChartProvider } from '../EntityChartContext';

const useStyles = makeStyles(theme => ({
  root: {
    display: 'flex',
    flexFlow: 'column nowrap',
    gap: theme.spacing(3),
  },
  mainContent: {
    display: 'flex',
    flexFlow: 'column',
    gap: theme.spacing(3),
    alignItems: 'stretch',
    minWidth: 0,
  },
  infoArea: {
    display: 'flex',
    flexFlow: 'column nowrap',
    alignItems: 'stretch',
    gap: theme.spacing(3),
    minWidth: 0,
    '& > *': { flexShrink: 0, flexGrow: 0 },
  },
  contentArea: {
    display: 'flex',
    flexFlow: 'column',
    gap: theme.spacing(3),
    alignItems: 'stretch',
    minWidth: 0,
  },
  [theme.breakpoints.up('md')]: {
    root: {
      display: 'grid',
      gap: theme.spacing(3),
      gridTemplateAreas: `"content info"`,
      gridTemplateColumns: (_props: { infoCards: boolean }) =>
        _props.infoCards ? '2fr 1fr' : '1fr',
      alignItems: 'start',
    },
    mainContent: { display: 'contents' },
    contentArea: { gridArea: 'content' },
    infoArea: {
      gridArea: 'info',
      position: 'sticky',
      top: theme.spacing(3),
      maxHeight: '100vh',
      overflowY: 'auto',
      alignSelf: 'start',
      scrollbarWidth: 'none',
      msOverflowStyle: 'none',
      '&::-webkit-scrollbar': { display: 'none' },
    },
  },
}));

/**
 * Custom overview layout for helm chart entities.
 * Wraps all cards in EntityChartProvider so they share chart selection
 * context (chart picker + useCurrentEntityChart). Follows the same
 * info-sidebar / content-main layout as the upstream default.
 */
export function HelmChartContentLayout(props: EntityContentLayoutProps) {
  const { cards } = props;
  const infoCards = cards.filter(card => card.type === 'info');
  const contentCards = cards.filter(
    card => !card.type || card.type === 'content',
  );
  const classes = useStyles({ infoCards: !!infoCards.length });

  return (
    <EntityChartProvider>
      <div className={classes.root}>
        {infoCards.length > 0 ? (
          <div className={classes.infoArea}>
            {infoCards.map((card, index) => (
              <Fragment key={card.element.key ?? index}>
                {card.element}
              </Fragment>
            ))}
          </div>
        ) : null}
        <div className={classes.mainContent}>
          {contentCards.length > 0 ? (
            <div className={classes.contentArea}>
              {contentCards.map((card, index) => (
                <Fragment key={card.element.key ?? index}>
                  {card.element}
                </Fragment>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </EntityChartProvider>
  );
}
