import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AreaCodeGame } from '../screens/AreaCodeGame';
import { AreaCodeIntro, AreaCodes } from '../screens/AreaCodes';
import { Atlas } from '../screens/Atlas';
import { Blocks } from '../screens/Blocks';
import { Country } from '../screens/Country';
import { Curate } from '../screens/Curate';
import { Drills } from '../screens/Drills';
import { Editor } from '../screens/Editor';
import { Login } from '../screens/Login';
import { NotFound } from '../screens/NotFound';
import { Placement } from '../screens/Placement';
import { Review } from '../screens/Review';
import { Round } from '../screens/Round';
import { Session } from '../screens/Session';
import { Settings } from '../screens/Settings';
import { Stats } from '../screens/Stats';
import { Today } from '../screens/Today';
import { AppShell } from './AppShell';
import { AuthGate } from './AuthGate';
import { CourseHome } from '../screens/languages/CourseHome';
import { LanguageGroup, Languages } from '../screens/languages/Languages';
import { Lesson } from '../screens/languages/Lesson';
import { Practice } from '../screens/languages/Practice';

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
          // Mini-games held only the area-code game, which opens from Area codes now
          { path: '/games', element: <Navigate to="/areacodes" replace /> },
          { path: '/games/areacode/:country', element: <AreaCodeGame /> },
          { path: '/areacodes', element: <AreaCodes /> },
          { path: '/areacodes/:country', element: <AreaCodeIntro /> },
          { path: '/atlas', element: <Atlas /> },
          { path: '/atlas/:country', element: <Country /> },
          { path: '/review', element: <Review /> },
          { path: '/round', element: <Round /> },
          { path: '/blocks', element: <Blocks /> },
          { path: '/stats', element: <Stats /> },
          { path: '/languages', element: <Languages /> },
          { path: '/languages/g/:group', element: <LanguageGroup /> },
          { path: '/languages/:course', element: <CourseHome /> },
          { path: '/languages/:course/lesson/:id', element: <Lesson /> },
          { path: '/languages/:course/practice', element: <Practice /> },
          { path: '/settings', element: <Settings /> },
          { path: '/curate', element: <Curate /> },
          { path: '/editor', element: <Editor /> },
          { path: '/placement/:country', element: <Placement /> },
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
]);
