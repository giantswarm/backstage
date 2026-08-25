import { ButtonLink, Box } from '@backstage/ui';
import { PropsWithChildren } from 'react';
import { Divider, makeStyles } from '@material-ui/core';
import { Header } from '@backstage/core-components';
import { useLayout } from '../../hooks/useLayout';

const useStyles = makeStyles({
    root: {
        display: 'flex',
        height: '100%',
        overflow: 'hidden',
    },
    sidebar: {
        width: 280,
        flexShrink: 0,
        borderRight: '1px solid rgba(0, 0, 0, 0.12)',
        borderLeft: '1px solid rgba(0, 0, 0, 0.12)',
        backgroundColor: '#222',
        // paddingTop: 16,
        overflowY: 'auto',
    },
    navTitle: {
        padding: '0 16px 12px',
    },
    item: {
        marginBottom: 2,
        marginTop: 2,
        backgroundColor: 'rgb(33,85,128)',
        color: 'white',
        width: '100%',
        height: 40,
        borderRadius: 0,
        '& > span': {
            justifyContent: 'flex-start',
            fontSize: '14px',
        },
        '&:hover': {
            backgroundColor: 'rgb(38, 97, 145)',
        },
    },
    nestedItem: {
        backgroundColor: 'rgb(66, 66, 66)',
        color: 'white',
        height: 40,
        borderRadius: 0,
        '& > span': {
            justifyContent: 'flex-start',
            fontSize: '14px',
        },
        '&:hover': {
            backgroundColor: 'rgb(88, 88, 88)',
        },
        marginBottom: 2,
        marginTop: 2,
        textAlign: 'left',
        width: '100%',
    },
    text: {
        fontWeight: 'bold',
        fontSize: '14px',
    },
    content: {
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
    },
});

const capitalize = (source: string) => source.charAt(0).toUpperCase() + source.slice(1)

const formatSubtitle = (title?: string, source?: string, category?: string, namespace?: string) => {
    let sub: string | React.ReactNode = '';

    if (source) {
        sub += sub ? ` | ${capitalize(source)}` : `${capitalize(source)}`;
    }

    if (category) {
        sub += sub ? ` | ${capitalize(category)}` : `${capitalize(category)}`;
    }

    if (namespace) {
        sub = (<>
            <div style={{ paddingTop: 8 }}>Namespace: {namespace}</div>
            <div style={{ paddingTop: 16, fontWeight: "bold" }}>{sub}</div>
        </>)
    } else if (title) {
        sub = (<>
            <div style={{ paddingTop: 8 }}>{title}</div>
            <div style={{ paddingTop: 16, fontWeight: "bold" }}>{sub}</div>
        </>)
    } else if (sub) {
        sub = (<div style={{ paddingTop: 16, fontWeight: "bold" }}>{sub}</div>)
    }

    return sub || 'Global Dashboard';
}

const buildUrl = (cluster: string, path: string) => {
    const base = path.replace('/source/', '')
    const parts = base.split('/')

    if (parts.length > 1) {
        return `/policy-reporter-ui/clusters/${cluster}?source=${parts[0]}&category=${parts[1]}`
    }

    return `/policy-reporter-ui/clusters/${cluster}?source=${parts[0]}`
}

export const PolicyReporterSidebar = ({ children, title, source, cluster, category, subtitle, namespace }: PropsWithChildren<{ title?: string, cluster: string, source?: string, category?: string, subtitle?: string, namespace?: string }>) => {
    const classes = useStyles();

    const { value, loading, error } = useLayout(cluster);

    if (!cluster || loading || error || !value) {
        return (
            <Box style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
                <Header title={title} />
                <Box className={classes.root}>
                    <div className={classes.content}>{children}</div>
                </Box>
            </Box>
        );
    }

    return (
        <Box style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
            <Header title={title} subtitle={formatSubtitle(subtitle, source, category, namespace)} />
            <Box className={classes.root}>
            <Box className={classes.sidebar} aria-label="Policy Reporter Sidebar">
                    <ButtonLink href={`/policy-reporter-ui/clusters/${cluster}`} className={classes.item}>Dashboard</ButtonLink>
                    {value.sources.map((s) => (
                        <div key={s.title}>
                            <ButtonLink href={buildUrl(cluster, s.path)} key={s.id} className={classes.item}>{s.title}</ButtonLink>
                            {s.children && s.children.length > 1 && s.children.map((c) => (
                                <ButtonLink href={`/policy-reporter-ui/clusters/${cluster}?source=${s.id}&category=${c.id}`} key={`${s.id}-${c.id}`} className={classes.nestedItem}>
                                    {c.title}
                                </ButtonLink>
                            ))}
                        </div>
                    ))}
                    {value.customBoards.length > 0 && (<>
                        <Divider style={{ marginTop: 16, marginBottom: 16 }} />
                        {value.customBoards.map((c) => (
                            <ButtonLink href={`/policy-reporter-ui/clusters/${cluster}/custom-board/${c.id}`} key={c.id} className={classes.nestedItem}>
                                {c.title}
                            </ButtonLink>
                        ))}
                    </>)}
                    {value.policies.length > 0 && (<>
                        <Divider style={{ marginTop: 16, marginBottom: 16 }} />
                        <ButtonLink href={`/policy-reporter-ui/clusters/${cluster}/policies`} className={classes.item}>Policy Dashboard</ButtonLink>
                        {value.policies.map((p) => (
                            <ButtonLink href={`/policy-reporter-ui/clusters/${cluster}/policies?source=${p.id}`} key={p.id} className={classes.nestedItem}>
                                {p.title}
                            </ButtonLink>
                        ))}
                    </>)}
            </Box>
            <div className={classes.content}>{children}</div>
            </Box>
        </Box>
    );
};