import { useState } from 'react'
import BellTimes from './BellTimes.jsx'
import Crud from './Crud.jsx'
import Generate from './Generate.jsx'
import ImportPage from './ImportPage.jsx'
import Lessons from './Lessons.jsx'
import Rules from './Rules.jsx'
import School from './School.jsx'
import TimetablePage from './TimetablePage.jsx'

const PAGES = [
  ['school', 'School'],
  ['bells', 'Bell times'],
  ['subjects', 'Subjects'],
  ['teachers', 'Teachers'],
  ['classes', 'Classes'],
  ['lessons', 'Lessons'],
  ['rules', 'Rules'],
  ['import', 'Import'],
  ['generate', 'Generate'],
  ['timetable', 'Timetable'],
]

export default function App() {
  const [page, setPage] = useState('school')
  const [runId, setRunId] = useState(null)

  const done = id => {
    setRunId(id)
    setPage('timetable')
  }

  return (
    <div className="layout">
      <nav>
        {PAGES.map(([key, label]) => (
          <button key={key} className={page === key ? 'active' : ''} onClick={() => setPage(key)}>{label}</button>
        ))}
      </nav>
      <main>
        {page === 'school' && <School />}
        {page === 'bells' && <BellTimes />}
        {page === 'subjects' && (
          <Crud title="Subjects" path="/subjects" fields={[{ key: 'name', label: 'Name' }, { key: 'short', label: 'Short' }, { key: 'color', label: 'Colour', type: 'color' }]} />
        )}
        {page === 'teachers' && (
          <Crud title="Teachers" path="/teachers" fields={[{ key: 'name', label: 'Name' }, { key: 'short', label: 'Short' }]} />
        )}
        {page === 'classes' && (
          <Crud title="Classes" path="/classes" fields={[{ key: 'name', label: 'Name' }, { key: 'label', label: 'Label' }]} />
        )}
        {page === 'lessons' && <Lessons />}
        {page === 'rules' && <Rules />}
        {page === 'import' && <ImportPage />}
        {page === 'generate' && <Generate onDone={done} />}
        {page === 'timetable' && <TimetablePage key={runId} runId={runId} />}
      </main>
    </div>
  )
}
