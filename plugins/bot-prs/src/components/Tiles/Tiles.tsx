import { Card, CardContent, Grid, Typography } from '@material-ui/core';

import type { BotPrRow } from '../../lib/marge';
import { countTiles } from '../../lib/rows';

function Tile({
  title,
  counts,
}: {
  title: string;
  counts: Record<string, number>;
}) {
  const entries = Object.entries(counts).filter(([, count]) => count > 0);
  return (
    <Grid item xs={12} md={4}>
      <Card
        variant="outlined"
        data-testid={`tile-${title.toLowerCase().replace(/\s+/g, '-')}`}
      >
        <CardContent>
          <Typography variant="overline" color="textSecondary">
            {title}
          </Typography>
          <Grid container spacing={2}>
            {entries.length === 0 ? (
              <Grid item>
                <Typography variant="body2" color="textSecondary">
                  —
                </Typography>
              </Grid>
            ) : null}
            {entries.map(([label, count]) => (
              <Grid item key={label}>
                <Typography
                  variant="h5"
                  component="div"
                  data-testid={`count-${label}`}
                >
                  {count}
                </Typography>
                <Typography variant="caption" color="textSecondary">
                  {label}
                </Typography>
              </Grid>
            ))}
          </Grid>
        </CardContent>
      </Card>
    </Grid>
  );
}

/**
 * Counts over the listed rows: per classification as the engine names it,
 * per bot kind, per age band. The same shape as the Repositories page's
 * tiles, so the two inventory pages read alike.
 */
export function Tiles({ rows }: { rows: BotPrRow[] }) {
  const tiles = countTiles(rows);
  return (
    <Grid container spacing={2}>
      <Tile title="Classification" counts={tiles.classification} />
      <Tile title="Bot" counts={tiles.kind} />
      <Tile title="Age" counts={tiles.age} />
    </Grid>
  );
}
