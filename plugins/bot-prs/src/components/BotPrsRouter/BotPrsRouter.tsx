import { Route, Routes } from 'react-router-dom';
import { BotPrsPage } from '../BotPrsPage';
import { BotPrsProviders } from '../BotPrsProviders';

/** `/bot-prs`: the queue. The team and the filters live in the query string. */
export function BotPrsRouter() {
  return (
    <BotPrsProviders>
      <Routes>
        <Route index element={<BotPrsPage />} />
      </Routes>
    </BotPrsProviders>
  );
}
