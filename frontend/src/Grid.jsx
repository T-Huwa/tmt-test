export default function Grid({ title, corner, lines, result, colors }) {
  const { bells, breaks_after, break_names, break_times } = result
  const breakIndex = Object.fromEntries(breaks_after.map((p, i) => [p, i]))
  const breakTime = p => break_times[breakIndex[p]]

  const header = []
  bells.forEach((b, i) => {
    const p = i + 1
    header.push(<th key={p}>{p}<br />{b}</th>)
    if (breakIndex[p] !== undefined) {
      header.push(<th key={'b' + p} className="break">{break_names[breakIndex[p]]}<br />{breakTime(p)}</th>)
    }
  })

  const body = lines.map((line, li) => {
    const cells = []
    for (let p = 1; p <= bells.length; ) {
      const c = line.cells[p]
      const len = c ? c.length : 1
      cells.push(
        <td key={p} colSpan={len} style={c ? { background: colors[c.subject] } : undefined}>
          {c && <>{c.top}<br />{c.bottom}</>}
        </td>
      )
      const last = p + len - 1
      if (li === 0 && breakIndex[last] !== undefined) {
        cells.push(
          <td key={'b' + last} rowSpan={lines.length} className="break vertical">
            {break_names[breakIndex[last]]} {breakTime(last)}
          </td>
        )
      }
      p += len
    }
    return <tr key={line.label}><th>{line.label}</th>{cells}</tr>
  })

  return (
    <table>
      <caption>{title}</caption>
      <thead>
        <tr><th>{corner}</th>{header}</tr>
      </thead>
      <tbody>{body}</tbody>
    </table>
  )
}
