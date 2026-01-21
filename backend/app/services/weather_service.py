"""
Weather Service
Integration with OpenWeatherMap API for weather-aware scheduling
"""

from datetime import datetime, date, timedelta, timezone
from typing import Optional
import logging
import httpx

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.config import get_settings
from app.models.common import utc_now

settings = get_settings()
logger = logging.getLogger(__name__)


class WeatherData:
    """Weather data for a specific date"""
    def __init__(
        self,
        date: date,
        temperature_f: float,
        rain_probability: int,
        wind_speed_mph: float,
        conditions: str,
        icon: str
    ):
        self.date = date
        self.temperature_f = temperature_f
        self.rain_probability = rain_probability
        self.wind_speed_mph = wind_speed_mph
        self.conditions = conditions
        self.icon = icon

    def to_dict(self) -> dict:
        return {
            "date": self.date.isoformat(),
            "temperature_f": self.temperature_f,
            "rain_probability": self.rain_probability,
            "wind_speed_mph": self.wind_speed_mph,
            "conditions": self.conditions,
            "icon": self.icon
        }


class WeatherService:
    """Service for weather data and weather-based scheduling decisions"""

    OPENWEATHER_BASE_URL = "https://api.openweathermap.org/data/2.5"

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.cache = db.weather_cache
        self.api_key = settings.OPENWEATHER_API_KEY
        self.cache_ttl = settings.WEATHER_CACHE_TTL_MINUTES

    async def get_forecast(
        self,
        latitude: float,
        longitude: float,
        days: int = 7
    ) -> list[WeatherData]:
        """
        Get weather forecast for a location

        Args:
            latitude: Location latitude
            longitude: Location longitude
            days: Number of days to forecast (max 7)

        Returns:
            List of WeatherData objects
        """
        if not self.api_key:
            logger.warning("OpenWeatherMap API key not configured")
            return []

        # Check cache first
        cache_key = f"forecast:{latitude:.2f}:{longitude:.2f}"
        cached = await self._get_cached(cache_key)
        if cached:
            return [WeatherData(**d) for d in cached]

        try:
            async with httpx.AsyncClient() as client:
                # Use One Call API 3.0 for better forecast data
                response = await client.get(
                    f"{self.OPENWEATHER_BASE_URL}/forecast",
                    params={
                        "lat": latitude,
                        "lon": longitude,
                        "appid": self.api_key,
                        "units": "imperial",
                        "cnt": min(days * 8, 40)  # 3-hour intervals
                    },
                    timeout=10.0
                )

                if response.status_code != 200:
                    logger.error(f"Weather API error: {response.status_code}")
                    return []

                data = response.json()
                forecasts = self._parse_forecast(data)

                # Cache the results
                await self._set_cached(
                    cache_key,
                    [f.to_dict() for f in forecasts]
                )

                return forecasts

        except Exception as e:
            logger.error(f"Failed to fetch weather: {e}")
            return []

    def _parse_forecast(self, data: dict) -> list[WeatherData]:
        """Parse OpenWeatherMap forecast response"""
        forecasts = []
        daily_data = {}

        for item in data.get("list", []):
            dt = datetime.fromtimestamp(item["dt"], tz=timezone.utc)
            day = dt.date()

            if day not in daily_data:
                daily_data[day] = {
                    "temps": [],
                    "rain_probs": [],
                    "wind_speeds": [],
                    "conditions": [],
                    "icons": []
                }

            daily_data[day]["temps"].append(item["main"]["temp"])
            daily_data[day]["wind_speeds"].append(item["wind"]["speed"])
            daily_data[day]["conditions"].append(
                item["weather"][0]["description"] if item["weather"] else ""
            )
            daily_data[day]["icons"].append(
                item["weather"][0]["icon"] if item["weather"] else ""
            )

            # Rain probability from 'pop' field
            rain_prob = item.get("pop", 0) * 100
            daily_data[day]["rain_probs"].append(rain_prob)

        for day, values in sorted(daily_data.items()):
            forecasts.append(WeatherData(
                date=day,
                temperature_f=sum(values["temps"]) / len(values["temps"]),
                rain_probability=int(max(values["rain_probs"])),
                wind_speed_mph=max(values["wind_speeds"]),
                conditions=values["conditions"][len(values["conditions"]) // 2],
                icon=values["icons"][len(values["icons"]) // 2]
            ))

        return forecasts

    async def check_weather_conditions(
        self,
        latitude: float,
        longitude: float,
        check_date: date,
        thresholds: dict
    ) -> dict:
        """
        Check if weather conditions are suitable for outdoor work

        Args:
            latitude: Location latitude
            longitude: Location longitude
            check_date: Date to check
            thresholds: Weather thresholds from business config
                - rain_probability_percent: Max rain % before reschedule
                - min_temperature_f: Min temperature
                - max_temperature_f: Max temperature
                - max_wind_speed_mph: Max wind speed

        Returns:
            Dict with 'suitable', 'reasons', and 'weather' data
        """
        forecasts = await self.get_forecast(latitude, longitude)

        # Find the forecast for the requested date
        weather = None
        for f in forecasts:
            if f.date == check_date:
                weather = f
                break

        if not weather:
            # No forecast available, assume suitable
            return {
                "suitable": True,
                "reasons": [],
                "weather": None,
                "forecast_available": False
            }

        # Check against thresholds
        reasons = []

        rain_threshold = thresholds.get("rain_probability_percent", 70)
        if weather.rain_probability > rain_threshold:
            reasons.append(f"Rain probability {weather.rain_probability}% exceeds {rain_threshold}%")

        min_temp = thresholds.get("min_temperature_f", 32)
        if weather.temperature_f < min_temp:
            reasons.append(f"Temperature {weather.temperature_f:.0f}°F below minimum {min_temp}°F")

        max_temp = thresholds.get("max_temperature_f", 105)
        if weather.temperature_f > max_temp:
            reasons.append(f"Temperature {weather.temperature_f:.0f}°F exceeds maximum {max_temp}°F")

        max_wind = thresholds.get("max_wind_speed_mph", 35)
        if weather.wind_speed_mph > max_wind:
            reasons.append(f"Wind speed {weather.wind_speed_mph:.0f} mph exceeds {max_wind} mph")

        return {
            "suitable": len(reasons) == 0,
            "reasons": reasons,
            "weather": weather.to_dict(),
            "forecast_available": True
        }

    async def find_next_suitable_date(
        self,
        latitude: float,
        longitude: float,
        start_date: date,
        thresholds: dict,
        max_days: int = 7
    ) -> Optional[date]:
        """
        Find the next date with suitable weather

        Args:
            latitude: Location latitude
            longitude: Location longitude
            start_date: Date to start searching from
            thresholds: Weather thresholds
            max_days: Maximum days to search ahead

        Returns:
            Next suitable date, or None if none found
        """
        forecasts = await self.get_forecast(latitude, longitude, days=max_days)

        for f in forecasts:
            if f.date < start_date:
                continue

            check = await self.check_weather_conditions(
                latitude, longitude, f.date, thresholds
            )

            if check["suitable"]:
                return f.date

        return None

    async def _get_cached(self, key: str) -> Optional[list]:
        """Get cached forecast"""
        doc = await self.cache.find_one({"cache_key": key})
        if doc and doc.get("expires_at") > utc_now():
            return doc.get("data")
        return None

    async def _set_cached(self, key: str, data: list) -> None:
        """Cache forecast data"""
        expires_at = utc_now() + timedelta(minutes=self.cache_ttl)
        await self.cache.update_one(
            {"cache_key": key},
            {
                "$set": {
                    "cache_key": key,
                    "data": data,
                    "expires_at": expires_at,
                    "updated_at": utc_now()
                }
            },
            upsert=True
        )
