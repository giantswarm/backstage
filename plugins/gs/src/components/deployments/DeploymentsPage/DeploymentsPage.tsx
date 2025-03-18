import React from 'react';
import { useOutlet } from 'react-router-dom';
import {
  DefaultDeploymentsPage,
  DefaultDeploymentsPageProps,
} from './DefaultDeploymentsPage';

export function DeploymentsPage(props: DefaultDeploymentsPageProps) {
  const outlet = useOutlet();

  return outlet || <DefaultDeploymentsPage {...props} />;
}
