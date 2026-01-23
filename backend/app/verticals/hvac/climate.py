"""
Climate Zone Service

Provides climate zone lookup for HVAC load calculations.
Based on ASHRAE/IECC climate zone definitions.
"""

import json
from pathlib import Path
from typing import Optional, Dict, Any

# Load climate zone data
_data_path = Path(__file__).parent / "data" / "climate_zones.json"
_climate_data: Dict[str, Any] = {}

def _load_climate_data() -> Dict[str, Any]:
    """Load climate zone data from JSON file."""
    global _climate_data
    if not _climate_data:
        try:
            with open(_data_path, "r") as f:
                _climate_data = json.load(f)
        except FileNotFoundError:
            _climate_data = {
                "zones": {},
                "state_defaults": {},
                "zip_prefix_zones": {}
            }
    return _climate_data


def get_climate_zone_by_zip(zip_code: str) -> int:
    """
    Get ASHRAE climate zone for a ZIP code.

    Args:
        zip_code: 5-digit US ZIP code

    Returns:
        Climate zone number (1-8), defaults to 4 if not found
    """
    data = _load_climate_data()
    zip_prefixes = data.get("zip_prefix_zones", {})

    # Clean ZIP code
    zip_clean = zip_code.strip()[:5]

    # Try 3-digit prefix first
    prefix_3 = zip_clean[:3]
    if prefix_3 in zip_prefixes:
        return zip_prefixes[prefix_3]

    # Fall back to state lookup based on ZIP range
    state = _zip_to_state(zip_clean)
    if state:
        return data.get("state_defaults", {}).get(state, 4)

    return 4  # Default to mixed-humid


def get_climate_zone_by_state(state: str) -> int:
    """
    Get default climate zone for a state.

    Args:
        state: 2-letter state abbreviation

    Returns:
        Climate zone number (1-8)
    """
    data = _load_climate_data()
    return data.get("state_defaults", {}).get(state.upper(), 4)


def get_climate_zone_info(zone: int) -> Dict[str, Any]:
    """
    Get detailed information about a climate zone.

    Args:
        zone: Climate zone number (1-8)

    Returns:
        Dict with zone name, design temps, description
    """
    data = _load_climate_data()
    zone_info = data.get("zones", {}).get(str(zone), {})

    if not zone_info:
        return {
            "zone": zone,
            "name": f"Zone {zone}",
            "design_temp_summer_f": 90,
            "design_temp_winter_f": 10,
            "description": "Unknown zone"
        }

    return {
        "zone": zone,
        **zone_info
    }


def get_design_temperatures(zip_code: str) -> Dict[str, int]:
    """
    Get design temperatures for a location.

    Args:
        zip_code: 5-digit ZIP code

    Returns:
        Dict with summer and winter design temperatures
    """
    zone = get_climate_zone_by_zip(zip_code)
    info = get_climate_zone_info(zone)

    return {
        "climate_zone": zone,
        "design_temp_summer_f": info.get("design_temp_summer_f", 90),
        "design_temp_winter_f": info.get("design_temp_winter_f", 10),
    }


def _zip_to_state(zip_code: str) -> Optional[str]:
    """Map ZIP code to state abbreviation."""
    # ZIP code prefix to state mapping (first digit regions)
    zip_state_map = {
        "0": ["CT", "MA", "ME", "NH", "NJ", "NY", "PR", "RI", "VT", "VI"],
        "1": ["DE", "NY", "PA"],
        "2": ["DC", "MD", "NC", "SC", "VA", "WV"],
        "3": ["AL", "FL", "GA", "MS", "TN"],
        "4": ["IN", "KY", "MI", "OH"],
        "5": ["IA", "MN", "MT", "ND", "SD", "WI"],
        "6": ["IL", "KS", "MO", "NE"],
        "7": ["AR", "LA", "OK", "TX"],
        "8": ["AZ", "CO", "ID", "NM", "NV", "UT", "WY"],
        "9": ["AK", "CA", "HI", "OR", "WA"],
    }

    # More specific mappings
    prefix_state = {
        # Florida
        "320": "FL", "321": "FL", "322": "FL", "323": "FL", "324": "FL",
        "325": "FL", "326": "FL", "327": "FL", "328": "FL", "329": "FL",
        "330": "FL", "331": "FL", "332": "FL", "333": "FL", "334": "FL",
        "335": "FL", "336": "FL", "337": "FL", "338": "FL", "339": "FL",
        "340": "FL", "341": "FL", "342": "FL", "344": "FL", "346": "FL",
        "347": "FL", "349": "FL",
        # Texas
        "750": "TX", "751": "TX", "752": "TX", "753": "TX", "754": "TX",
        "755": "TX", "756": "TX", "757": "TX", "758": "TX", "759": "TX",
        "760": "TX", "761": "TX", "762": "TX", "763": "TX", "764": "TX",
        "765": "TX", "766": "TX", "767": "TX", "768": "TX", "769": "TX",
        "770": "TX", "771": "TX", "772": "TX", "773": "TX", "774": "TX",
        "775": "TX", "776": "TX", "777": "TX", "778": "TX", "779": "TX",
        "780": "TX", "781": "TX", "782": "TX", "783": "TX", "784": "TX",
        "785": "TX", "786": "TX", "787": "TX", "788": "TX", "789": "TX",
        "790": "TX", "791": "TX", "792": "TX", "793": "TX", "794": "TX",
        "795": "TX", "796": "TX", "797": "TX", "798": "TX", "799": "TX",
        # California
        "900": "CA", "901": "CA", "902": "CA", "903": "CA", "904": "CA",
        "905": "CA", "906": "CA", "907": "CA", "908": "CA", "910": "CA",
        "911": "CA", "912": "CA", "913": "CA", "914": "CA", "915": "CA",
        "916": "CA", "917": "CA", "918": "CA", "919": "CA", "920": "CA",
        "921": "CA", "922": "CA", "923": "CA", "924": "CA", "925": "CA",
        "926": "CA", "927": "CA", "928": "CA", "930": "CA", "931": "CA",
        "932": "CA", "933": "CA", "934": "CA", "935": "CA", "936": "CA",
        "937": "CA", "938": "CA", "939": "CA", "940": "CA", "941": "CA",
        "942": "CA", "943": "CA", "944": "CA", "945": "CA", "946": "CA",
        "947": "CA", "948": "CA", "949": "CA", "950": "CA", "951": "CA",
        "952": "CA", "953": "CA", "954": "CA", "955": "CA", "956": "CA",
        "957": "CA", "958": "CA", "959": "CA", "960": "CA", "961": "CA",
        # Georgia
        "300": "GA", "301": "GA", "302": "GA", "303": "GA", "304": "GA",
        "305": "GA", "306": "GA", "307": "GA", "308": "GA", "309": "GA",
        "310": "GA", "311": "GA", "312": "GA", "313": "GA", "314": "GA",
        "315": "GA", "316": "GA", "317": "GA", "318": "GA", "319": "GA",
        # Illinois
        "600": "IL", "601": "IL", "602": "IL", "603": "IL", "604": "IL",
        "605": "IL", "606": "IL", "607": "IL", "608": "IL", "609": "IL",
        "610": "IL", "611": "IL", "612": "IL", "613": "IL", "614": "IL",
        "615": "IL", "616": "IL", "617": "IL", "618": "IL", "619": "IL",
        "620": "IL", "622": "IL", "623": "IL", "624": "IL", "625": "IL",
        "626": "IL", "627": "IL", "628": "IL", "629": "IL",
        # Minnesota
        "550": "MN", "551": "MN", "553": "MN", "554": "MN", "555": "MN",
        "556": "MN", "557": "MN", "558": "MN", "559": "MN", "560": "MN",
        "561": "MN", "562": "MN", "563": "MN", "564": "MN", "565": "MN",
        "566": "MN", "567": "MN",
        # Alaska
        "995": "AK", "996": "AK", "997": "AK", "998": "AK", "999": "AK",
        # Hawaii
        "967": "HI", "968": "HI",
    }

    prefix = zip_code[:3]
    if prefix in prefix_state:
        return prefix_state[prefix]

    # Fall back to first digit
    first_digit = zip_code[0]
    if first_digit in zip_state_map:
        # Return first state in region as default
        return zip_state_map[first_digit][0]

    return None


def get_all_zones() -> Dict[str, Dict[str, Any]]:
    """Get all climate zone definitions."""
    data = _load_climate_data()
    return data.get("zones", {})
