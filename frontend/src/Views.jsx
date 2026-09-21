import { useState } from 'react'
import Grid from './Grid.jsx'

const cellsOf = (rows, top, bottom) =>
  Object.fromEntries(rows.map(r => [r.period, { length: r.length, top: r[top], bottom: r[bottom], subject: r.subject }]))

function Picker({ options, value, onChange }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}>
      <option value="All">All</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

export function Master({ result, colors }) {
  return result.days.map(day => (
    <Grid
      key={day}
      title={day}
      corner="Class"
      result={result}
      colors={colors}
      lines={result.classes.map(c => ({
        label: c,
        cells: cellsOf(result.rows.filter(r => r.day === day && r.class === c), 'subject', 'teacher')
      }))}
    />
  ))
}

export function ClassView({ result, colors }) {
  const [sel, setSel] = useState('All')
  const shown = sel === 'All' ? result.classes : [sel]
  return (
    <>
      <Picker options={result.classes.map(c => ({ value: c, label: c }))} value={sel} onChange={setSel} />
      {shown.map(c => (
        <Grid
          key={c}
          title={`Class ${c}`}
          corner="Day"
          result={result}
          colors={colors}
          lines={result.days.map(day => ({
            label: day,
            cells: cellsOf(result.rows.filter(r => r.class === c && r.day === day), 'subject', 'teacher')
          }))}
        />
      ))}
    </>
  )
}

export function TeacherView({ result, colors }) {
  const [sel, setSel] = useState('All')
  const codes = Object.keys(result.teachers)
  const shown = sel === 'All' ? codes : [sel]
  const load = code => result.rows.filter(r => r.teacher === code).reduce((a, r) => a + r.length, 0)
  return (
    <>
      <Picker
        options={codes.map(c => ({ value: c, label: `${result.teachers[c]} (${c})` }))}
        value={sel}
        onChange={setSel}
      />
      {shown.map(code => (
        <Grid
          key={code}
          title={`${result.teachers[code]} (${code}) - ${load(code)} periods per week`}
          corner="Day"
          result={result}
          colors={colors}
          lines={result.days.map(day => ({
            label: day,
            cells: cellsOf(result.rows.filter(r => r.teacher === code && r.day === day), 'subject', 'class')
          }))}
        />
      ))}
    </>
  )
}
