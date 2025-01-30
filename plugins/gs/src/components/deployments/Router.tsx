import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { DeploymentsPage } from './DeploymentsPage';

export const Router = () => {
  return (
    <Routes>
      <Route path="/" element={<DeploymentsPage />} />
    </Routes>
  );
};
