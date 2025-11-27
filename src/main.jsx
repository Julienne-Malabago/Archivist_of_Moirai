// main.jsx

import React from 'react';
import ReactDOM from 'react-dom/client';

import './index.css'; // Path for global styles
import { Registration } from './Components/Registrations/Registration.jsx'; // Path for component

const container = document.getElementById('root');
const root = ReactDOM.createRoot(container);

root.render(
  <React.StrictMode>
    <Registration /> 
  </React.StrictMode>
);