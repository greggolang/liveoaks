export interface WeatherCurrent {
  temperature_2m: number
  precipitation: number
  weathercode: number
  windspeed_10m: number
  relativehumidity_2m: number
}

export interface WeatherDaily {
  time: string[]
  temperature_2m_max: number[]
  temperature_2m_min: number[]
  precipitation_probability_max: number[]
  weathercode: number[]
  windspeed_10m_max: number[]
}

export interface WeatherData {
  current: WeatherCurrent
  daily: WeatherDaily
}

export interface AirQualityData {
  current: { us_aqi: number }
}

export function aqiLabel(aqi: number): string {
  if (aqi <= 50)  return 'Good'
  if (aqi <= 100) return 'Moderate'
  if (aqi <= 150) return 'Unhealthy for Sensitive Groups'
  if (aqi <= 200) return 'Unhealthy'
  if (aqi <= 300) return 'Very Unhealthy'
  return 'Hazardous'
}

export function aqiColor(aqi: number): string {
  if (aqi <= 50)  return 'text-green-700 bg-green-50 border-green-200'
  if (aqi <= 100) return 'text-yellow-700 bg-yellow-50 border-yellow-200'
  if (aqi <= 150) return 'text-orange-700 bg-orange-50 border-orange-200'
  if (aqi <= 200) return 'text-red-700 bg-red-50 border-red-200'
  if (aqi <= 300) return 'text-purple-700 bg-purple-50 border-purple-200'
  return 'text-gray-800 bg-gray-900 border-gray-700'
}

export function aqiEmoji(aqi: number): string {
  if (aqi <= 50)  return '🟢'
  if (aqi <= 100) return '🟡'
  if (aqi <= 150) return '🟠'
  if (aqi <= 200) return '🔴'
  if (aqi <= 300) return '🟣'
  return '⚫'
}

export function weatherIcon(code: number): string {
  if (code === 0) return '☀️'
  if (code === 1) return '🌤️'
  if (code === 2) return '⛅'
  if (code === 3) return '☁️'
  if (code <= 48) return '🌫️'
  if (code <= 55) return '🌦️'
  if (code <= 67) return '🌧️'
  if (code <= 77) return '❄️'
  if (code <= 82) return '🌦️'
  if (code <= 86) return '❄️'
  return '⛈️'
}

export function weatherLabel(code: number): string {
  if (code === 0) return 'Clear'
  if (code === 1) return 'Mainly Clear'
  if (code === 2) return 'Partly Cloudy'
  if (code === 3) return 'Overcast'
  if (code <= 48) return 'Foggy'
  if (code <= 55) return 'Drizzle'
  if (code <= 67) return 'Rain'
  if (code <= 77) return 'Snow'
  if (code <= 82) return 'Showers'
  if (code <= 86) return 'Snow Showers'
  return 'Thunderstorm'
}

// Returns 'good' | 'caution' | 'bad' for tennis suitability
export function courtCondition(code: number, precipProb: number): 'good' | 'caution' | 'bad' {
  if (code >= 55) return 'bad'
  if (code >= 3 || precipProb >= 40) return 'caution'
  return 'good'
}

export const conditionColors = {
  good:    'text-green-700 bg-green-50 border-green-200',
  caution: 'text-yellow-700 bg-yellow-50 border-yellow-200',
  bad:     'text-red-700 bg-red-50 border-red-200',
}

export function dayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === tomorrow.toDateString()) return 'Tmrw'
  return d.toLocaleDateString('en-US', { weekday: 'short' })
}
