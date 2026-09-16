import { Card, CardContent, Grid, Typography } from '@material-ui/core';
import { RepositoryRow } from '../apis';
import { countTiles } from '../lib/rows';

function Tile({
  title,
  counts,
}: {
  title: string;
  counts: Record<string, number>;
}) {
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
            {Object.entries(counts).map(([label, count]) => (
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

/** Counts over the listed rows: per set-up state, orphan score band, lifecycle. */
export function Tiles({ rows }: { rows: RepositoryRow[] }) {
  const tiles = countTiles(rows);
  return (
    <Grid container spacing={2}>
      <Tile title="Set-up state" counts={tiles.setup} />
      <Tile
        title="Orphan score"
        counts={{
          'healthy (< 30)': tiles.score.healthy,
          'watch (30–59)': tiles.score.watch,
          'orphan (≥ 60)': tiles.score.orphan,
        }}
      />
      <Tile title="Lifecycle" counts={tiles.lifecycle} />
    </Grid>
  );
}
