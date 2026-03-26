import { ReactNode } from 'react';
import {
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  Text,
  Flex,
} from '@backstage/ui';
import { makeStyles } from '@material-ui/core/styles';
import classNames from 'classnames';

const useStyles = makeStyles({
  root: {
    height: '100%',
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
  },
});

export interface InfoCardProps {
  title?: ReactNode;
  headerActions?: ReactNode;
  footerActions?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function InfoCard(props: InfoCardProps) {
  const { title, headerActions, footerActions, children, className } = props;
  const classes = useStyles();

  return (
    <Card className={classNames(classes.root, className)}>
      {title && (
        <CardHeader>
          <Flex justify="between" align="center">
            <Text as="h3" variant="title-x-small" weight="bold">
              {title}
            </Text>
            {headerActions && (
              <Flex align="center" gap="1">
                {headerActions}
              </Flex>
            )}
          </Flex>
        </CardHeader>
      )}
      <CardBody>{children}</CardBody>
      {footerActions && (
        <CardFooter className={classes.footer}>{footerActions}</CardFooter>
      )}
    </Card>
  );
}
