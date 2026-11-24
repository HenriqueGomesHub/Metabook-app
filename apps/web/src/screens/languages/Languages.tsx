import { Link } from 'react-router-dom';
import { useAppData } from '../../app/AppData';
import { ChevronIcon } from '../../components/Button';
import { Header } from '../../components/Header';
import { ItemList } from '../../components/ItemList';
import { Status } from '../../components/Status';
import './languages.css';

interface Course {
  title: string;
  blurb: string;
  glyph: string;
  to: string;
}

const COURSES: Course[] = [
  {
    title: 'Cyrillic',
    blurb: 'Russian, Ukrainian, Serbian and three more',
    glyph: 'Я',
    to: '/languages/cyrillic',
  },
];

/** `/languages`: the alphabets to learn to read, one row each. */
export function Languages() {
  const { data, error } = useAppData();
  if (!data) return <Status error={error} />;
  return (
    <div className="page page-scroll">
      <Header user={data.user} />
      <main className="page-main">
        <div className="page-title rise">
          <div>
            <h1 className="headline">Languages</h1>
            <p>Read the alphabets on the signs.</p>
          </div>
        </div>
        <ItemList
          className="row-list"
          list
          label="Alphabets"
          items={COURSES}
          keyOf={(course) => course.title}
          render={(course) => (
            <Link className="row-item cy-row" to={course.to}>
              <span className="cy-row-glyph cyr" aria-hidden="true">
                {course.glyph}
              </span>
              <span className="row-text">
                <span className="row-name">{course.title}</span>
                <span className="row-sub">{course.blurb}</span>
              </span>
              <span />
              <ChevronIcon />
            </Link>
          )}
        />
      </main>
    </div>
  );
}
