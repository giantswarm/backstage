import { render, screen } from '@testing-library/react';
import {
  Cell,
  Column,
  Row,
  Table,
  TableBody,
  TableHeader,
} from 'react-aria-components';
import { ExternalCellText } from './ExternalCellText';

function renderCell(cell: React.ReactNode) {
  render(
    <Table aria-label="Repositories">
      <TableHeader>
        <Column isRowHeader>Repository</Column>
        <Column>Other</Column>
      </TableHeader>
      <TableBody>
        <Row>
          {cell}
          <Cell>other</Cell>
        </Row>
      </TableBody>
    </Table>,
  );
}

describe('ExternalCellText', () => {
  it('links out in a new tab, says so to a screen reader, and keeps its description', () => {
    renderCell(
      <ExternalCellText
        title="example-org/api"
        href="https://github.com/example-org/api"
        description="left the selection"
      />,
    );

    const link = screen.getByRole('link', {
      name: 'example-org/api (opens in a new tab)',
    });
    expect(link).toHaveAttribute('href', 'https://github.com/example-org/api');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    // The whole title on hover, where it truncates.
    expect(link).toHaveAttribute('title', 'example-org/api');
    expect(screen.getByText('left the selection')).toBeInTheDocument();
  });

  it('is plain text without an href', () => {
    renderCell(<ExternalCellText title="example-org/api" />);

    expect(screen.getByText('example-org/api')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
