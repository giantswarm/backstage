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
  // A card in a grid or flex row keeps to its track: without `min-width: 0`
  // an unbroken title or link widens it past its column.
  root: {
    height: '100%',
    minWidth: 0,
  },
  // The title shares its row with the header actions; it wraps, even inside
  // an unbroken path or link, instead of pushing the actions out.
  title: {
    minWidth: 0,
    overflowWrap: 'anywhere',
  },
  headerActions: {
    flexShrink: 0,
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
            <Text
              as="h3"
              variant="title-x-small"
              weight="bold"
              className={classes.title}
            >
              {title}
            </Text>
            {headerActions && (
              <Flex align="center" gap="1" className={classes.headerActions}>
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
