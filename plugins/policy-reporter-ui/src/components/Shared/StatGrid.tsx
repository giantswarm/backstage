import { Box, Grid, Text } from "@backstage/ui";
import { StatCard } from "./StatCard";
import { makeStyles } from "@material-ui/core";

const useStyles = makeStyles(theme => ({
    card: {
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
    },
    cardContent: {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: theme.spacing(3),
        flex: 1,
    },
    statLabel: {
        fontSize: '0.875rem',
        color: theme.palette.text.secondary,
        marginBottom: theme.spacing(1),
        textTransform: 'uppercase',
        fontWeight: 600,
        letterSpacing: '0.5px',
    },
    statValue: {
        fontSize: '2.5rem',
        fontWeight: 700,
        lineHeight: 1,
    },
    passColor: {
        color: theme.palette.success.main,
    },
    failColor: {
        color: theme.palette.error.main,
    },
    warnColor: {
        color: theme.palette.warning.main,
    },
    errorColor: {
        color: '#9c27b0',
    },
    section: {
        marginBottom: theme.spacing(2),
    },
}));

export const StatGrid = ({ stats }: { stats: { pass: number; fail: number; warn: number; error: number } }) => {
    const classes = useStyles();
    
    return (
        <Box className={classes.section}>
            <div style={{ marginBottom: '8px' }}><Text variant="title-small">Total Results</Text></div>
            <Grid.Root columns={{ initial: '4', md: '4', sm: '2', xs: '1' }} gap="4">
                <StatCard label="Pass" value={stats.pass} colorClass={classes.passColor} />
                <StatCard label="Fail" value={stats.fail} colorClass={classes.failColor} />
                <StatCard label="Warn" value={stats.warn} colorClass={classes.warnColor} />
                <StatCard label="Error" value={stats.error} colorClass={classes.errorColor} />
            </Grid.Root>
        </Box>
    )
}