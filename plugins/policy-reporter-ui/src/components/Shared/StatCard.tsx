import { Card, CardBody, Text } from "@backstage/ui";
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
}));

export const StatCard = ({ label, value, colorClass }: { label: string; value: number; colorClass: string }) => {
    const classes = useStyles();
    return (
        <Card className={classes.card}>
            <CardBody className={classes.cardContent}>
                <Text className={classes.statLabel}>{label}</Text>
                <Text className={`${classes.statValue} ${colorClass}`}>{value}</Text>
            </CardBody>
        </Card>
    );
};