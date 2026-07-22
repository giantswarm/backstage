import { ReactNode } from 'react';
import {
  Accordion,
  AccordionGroup,
  AccordionPanel,
  AccordionTrigger,
} from '@backstage/ui';

type SimpleAccordionProps = {
  title: string;
  children: ReactNode;
};

export const SimpleAccordion = ({ title, children }: SimpleAccordionProps) => {
  return (
    <AccordionGroup>
      <Accordion id={title}>
        <AccordionTrigger>{title}</AccordionTrigger>
        <AccordionPanel>{children}</AccordionPanel>
      </Accordion>
    </AccordionGroup>
  );
};
