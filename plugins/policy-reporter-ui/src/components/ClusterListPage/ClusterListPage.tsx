import { Progress, Content } from '@backstage/core-components';
import { ClusterTable } from '../ClusterTable';
import { Header, Container } from '@backstage/ui';
import { useConfig } from '../../hooks/useConfig';
import { useNavigate } from 'react-router-dom';

export const ClusterListPage = () => {
    const { value, loading, error } = useConfig();
    const navigate = useNavigate();

    if (loading) {
        return <Progress />;
    }

    if (error) {
        return (
            <>
                <Header title="Clusters" />
                <Container>
                    <p>Error: {error?.message}</p>
                </Container>
            </>
        );
    }

    if ((value?.clusters ?? []).length === 1) {
        navigate(`/policy-reporter-ui/clusters/${value?.clusters?.[0].slug}`);
        return null;
    }

    return (
        <Container>
            <Content>
                <ClusterTable config={value!} />
            </Content>
        </Container>
    );
};
