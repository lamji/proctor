import { useMemo, useState } from 'react'

type AddReappointmentProps = {
  totalPoints: number
}

type StatKey = 'strength' | 'speed'

export default function AddReappointment({ totalPoints }: AddReappointmentProps) {
  const [stats, setStats] = useState<{ strength: number; speed: number }>({
    strength: 0,
    speed: 0,
  })

  const remainingPoints = useMemo(
    () => totalPoints - (stats.strength + stats.speed),
    [stats.speed, stats.strength, totalPoints]
  )

  const increaseStat = (key: StatKey) => {
    const otherKey: StatKey = key === 'strength' ? 'speed' : 'strength'

    setStats((prev) => {
      if (prev[key] >= totalPoints) {
        return prev
      }

      const spentPoints = prev.strength + prev.speed

      if (spentPoints < totalPoints) {
        return { ...prev, [key]: prev[key] + 1 }
      }

      if (prev[otherKey] > 0) {
        return {
          ...prev,
          [key]: prev[key] + 1,
          [otherKey]: prev[otherKey] - 1,
        }
      }

      return prev
    })
  }

  const decreaseStat = (key: StatKey) => {
    setStats((prev) => {
      if (prev[key] <= 0) {
        return prev
      }

      return { ...prev, [key]: prev[key] - 1 }
    })
  }

  return (
    <div>
      Character stats: <span>{remainingPoints}</span> points
      <div>
        <button onClick={() => decreaseStat('strength')}>-</button>
        <input
          type='number'
          step='1'
          value={stats.strength}
          style={{ width: '50px', textAlign: 'center' }}
          readOnly
        />
        <button onClick={() => increaseStat('strength')}>+</button>
        Strength
      </div>
      <div>
        <button onClick={() => decreaseStat('speed')}>-</button>
        <input
          type='number'
          step='1'
          value={stats.speed}
          style={{ width: '50px', textAlign: 'center' }}
          readOnly
        />
        <button onClick={() => increaseStat('speed')}>+</button>
        Speed
      </div>
    </div>
  )
}
