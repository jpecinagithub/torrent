import { useEffect, useRef, useState } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

interface DataPoint { t: number; down: number; up: number }

interface Props {
  downloadSpeed: number
  uploadSpeed: number
}

const MAX_POINTS = 60

export function SpeedChart({ downloadSpeed, uploadSpeed }: Props) {
  const [data, setData] = useState<DataPoint[]>([])
  const tickRef = useRef(0)

  useEffect(() => {
    setData((prev) => {
      const next = [...prev, { t: tickRef.current++, down: downloadSpeed, up: uploadSpeed }]
      return next.slice(-MAX_POINTS)
    })
  }, [downloadSpeed, uploadSpeed])

  function fmtSpeed(bps: number) {
    if (bps < 1024 ** 2) return `${(bps / 1024).toFixed(0)} KB/s`
    return `${(bps / 1024 ** 2).toFixed(1)} MB/s`
  }

  return (
    <ResponsiveContainer width="100%" height={64}>
      <AreaChart data={data} margin={{ top: 2, right: 4, bottom: 0, left: 4 }}>
        <defs>
          <linearGradient id="colorDown" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#89b4fa" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#89b4fa" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="colorUp" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#fab387" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#fab387" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis hide dataKey="t" />
        <YAxis hide />
        <Tooltip
          contentStyle={{ background: '#181825', border: '1px solid #313244', fontSize: 11 }}
          formatter={(v: number, name: string) => [fmtSpeed(v), name === 'down' ? '↓' : '↑']}
          labelFormatter={() => ''}
        />
        <Area type="monotone" dataKey="down" stroke="#89b4fa" fill="url(#colorDown)" strokeWidth={1.5} dot={false} />
        <Area type="monotone" dataKey="up" stroke="#fab387" fill="url(#colorUp)" strokeWidth={1.5} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}
