import { createBrowserRouter } from 'react-router-dom';
import { AreaCodeGame } from '../screens/AreaCodeGame';
import { Atlas } from '../screens/Atlas';
import { Blocks } from '../screens/Blocks';
import { Country } from '../screens/Country';
import { Drills } from '../screens/Drills';
import { Editor } from '../screens/Editor';
import { Games } from '../screens/Games';
import { Login } from '../screens/Login';
import { NotFound } from '../screens/NotFound';
import { Placement } from '../screens/Placement';
import { Review } from '../screens/Review';
import { Session } from '../screens/Session';
import { Settings } from '../screens/Settings';
import { Stats } from '../screens/Stats';
import { Today } from '../screens/Today';
import { AppShell } from './AppShell';
import { AuthGate } from './AuthGate';

export const router = createBrowserRouter([
  {
    element: <AuthGate />,
    children: [
      { path: '/login', element: <Login /> },
      {
        element: <AppShell />,
        children: [
          { path: '/', element: <Today /> },
          { path: '/session', element: <Session /> },
          { path: '/drills', element: <Drills /> },
          { path: '/games', element: <Games /> },
          { path: '/games/areacode/br', element: <AreaCodeGame /> },
          { path: '/atlas', element: <Atlas /> },
          { path: '/atlas/:country', element: <Country /> },
          { path: '/review', element: <Review /> },
          { path: '/blocks', element: <Blocks /> },
          { path: '/stats', element: <Stats /> },
          { path: '/settings', element: <Settings /> },
          { path: '/editor', element: <Editor /> },
          { path: '/placement/:country', element: <Placement /> },
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
]);
