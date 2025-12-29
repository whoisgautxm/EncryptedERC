import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Orderbook from './pages/Orderbook';
import MyOffers from './pages/MyOffers';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="orderbook" element={<Orderbook />} />
        <Route path="my-offers" element={<MyOffers />} />
      </Route>
    </Routes>
  );
}

export default App;
