import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../api/client'
import { WeatherData, AirQualityData, weatherIcon, weatherLabel, courtCondition, conditionColors, dayLabel, aqiLabel, aqiColor, aqiEmoji } from '../utils/weather'

export default function Conditions() {
  const { isBoard } = useAuth()
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [airQuality, setAirQuality] = useState<AirQualityData | null>(null)
  const [cameraURL, setCameraURL] = useState<string | null>(null)
  const [cameraDown, setCameraDown] = useState(false)

  useEffect(() => {
    api.weather.get().then(d => setWeather(d as WeatherData)).catch(() => {})
    api.weather.airQuality().then(d => setAirQuality(d as AirQualityData)).catch(() => {})
    api.camera.embedURL().then(d => setCameraURL(d.url)).catch(() => setCameraURL('/camera'))
  }, [])

  useEffect(() => {
    if (!isBoard) return
    const checkCamera = () =>
      api.camera.adminStatus().then(d => setCameraDown(!d.online)).catch(() => {})
    checkCamera()
    const cameraInterval = setInterval(checkCamera, 60000)
    return () => clearInterval(cameraInterval)
  }, [isBoard])

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Conditions</h1>

      {/* Weather */}
      {weather && <WeatherWidget weather={weather} airQuality={airQuality} />}

      {/* Court Camera */}
      <div>
        <div className="mb-3">
          <h2 className="text-lg font-semibold text-gray-700">Court Camera</h2>
        </div>
        {isBoard && cameraDown && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-3 text-sm text-red-700">
            <span className="text-base">⚠️</span>
            <span><strong>Camera offline.</strong> The server has attempted an automatic restart. Check back in a few minutes or contact your system administrator.</span>
          </div>
        )}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          {cameraURL ? (
            <iframe
              src={cameraURL + (cameraURL.includes('?') ? '&' : '?') + 'embed=1'}
              title="Court Camera"
              className="w-full aspect-video"
              style={{ border: 'none' }}
              allowFullScreen
            />
          ) : (
            <div className="w-full aspect-video bg-gray-100 flex items-center justify-center text-gray-400 text-sm">
              Loading camera…
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function WeatherWidget({ weather, airQuality }: { weather: WeatherData; airQuality: AirQualityData | null }) {
  const cur = weather.current
  const daily = weather.daily
  const todayCode = daily.weathercode[0] ?? cur.weathercode
  const todayPrecip = daily.precipitation_probability_max[0] ?? 0
  const condition = courtCondition(todayCode, todayPrecip)
  const aqi = airQuality?.current?.us_aqi ?? null

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      {/* Current conditions */}
      <div className="flex items-start gap-3 px-4 py-3 border-b border-gray-100">
        <span className="text-3xl shrink-0">{weatherIcon(cur.weathercode)}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-xl font-bold text-gray-800">{Math.round(cur.temperature_2m)}°F</span>
            <span className="text-sm text-gray-500">{weatherLabel(cur.weathercode)}</span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${conditionColors[condition]}`}>
              {condition === 'good' ? '✓ Good' : condition === 'caution' ? '⚠ Caution' : '✗ Poor'}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-xs text-gray-400">
            <span>💨 {Math.round(cur.windspeed_10m)} mph</span>
            <span>💧 {cur.relativehumidity_2m}%</span>
            {todayPrecip > 0 && <span>🌂 {todayPrecip}%</span>}
            {aqi !== null && (
              <span className={`font-medium px-1.5 py-0.5 rounded border ${aqiColor(aqi)}`}>
                {aqiEmoji(aqi)} AQI {aqi} · {aqiLabel(aqi)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 7-day forecast strip */}
      <div className="grid grid-cols-7 divide-x divide-gray-100">
        {daily.time.map((date, i) => {
          const code = daily.weathercode[i]
          const precip = daily.precipitation_probability_max[i]
          const cond = courtCondition(code, precip)
          return (
            <div key={date} className="flex flex-col items-center gap-0.5 py-3 px-1">
              <span className="text-xs font-medium text-gray-500">{dayLabel(date)}</span>
              <span className="text-lg">{weatherIcon(code)}</span>
              <span className="text-xs font-semibold text-gray-700">{Math.round(daily.temperature_2m_max[i])}°</span>
              <span className="text-xs text-gray-400">{Math.round(daily.temperature_2m_min[i])}°</span>
              {precip > 0 && <span className="text-xs text-blue-500">{precip}%</span>}
              <span className={`w-2 h-2 rounded-full mt-0.5 ${cond === 'good' ? 'bg-green-400' : cond === 'caution' ? 'bg-yellow-400' : 'bg-red-400'}`} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
