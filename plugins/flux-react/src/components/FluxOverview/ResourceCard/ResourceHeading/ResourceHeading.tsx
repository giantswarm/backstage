import { Box, Text } from '@backstage/ui';
import MiddleEllipsis from 'react-middle-ellipsis';

type ResourceHeadingProps = {
  name: string;
  inactive?: boolean;
  nowrap?: boolean;
  emphasized?: boolean;
};

export const ResourceHeading = ({
  name,
  inactive,
  nowrap = false,
  emphasized = false,
}: ResourceHeadingProps) => {
  const color = inactive ? 'secondary' : 'primary';
  // The details panel (emphasized) gets a larger, bold title; the tree-view
  // node keeps its original, smaller size until it is migrated separately.
  // The title stays a non-heading `div`: in the panel it renders inside the
  // AccordionTrigger's <button> (itself wrapped in a react-aria heading), and a
  // heading nested in a button nested in a heading is invalid HTML.
  const weight = emphasized ? 'bold' : 'regular';
  const variant = emphasized ? 'title-small' : 'title-x-small';

  return nowrap ? (
    <Box grow style={{ whiteSpace: 'nowrap', overflow: 'hidden' }}>
      <Text as="div" variant={variant} weight={weight} color={color}>
        <MiddleEllipsis>
          <span title={name}>{name}</span>
        </MiddleEllipsis>
      </Text>
    </Box>
  ) : (
    <Text as="div" variant={variant} weight={weight} color={color}>
      {name}
    </Text>
  );
};
