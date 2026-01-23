"""
Price List Parser Service
Parses CSV files from various distributors
"""

import csv
import io
import logging
from typing import Optional, List, Dict, Any
from datetime import datetime, date

from app.models.pricelist import PriceListCategory, PriceListItem, PriceListUploadResult

logger = logging.getLogger(__name__)


# Common column name mappings
COLUMN_MAPPINGS = {
    "part_number": ["part_number", "part#", "partnum", "item_number", "item#", "sku", "product_id", "catalog#"],
    "description": ["description", "desc", "item_description", "product_name", "name", "item_name"],
    "cost": ["cost", "dealer_cost", "price", "unit_cost", "net_price", "your_price", "dealer_price"],
    "msrp": ["msrp", "list_price", "retail", "list", "suggested_retail", "srp"],
    "brand": ["brand", "manufacturer", "mfg", "mfr", "vendor"],
    "model": ["model", "model_number", "model#"],
    "category": ["category", "cat", "type", "product_category", "item_type"],
    "unit": ["unit", "uom", "unit_of_measure", "each"],
    "in_stock": ["in_stock", "available", "stock_status", "availability"],
    "lead_time": ["lead_time", "lead_time_days", "delivery_days", "ship_days"]
}


def normalize_column_name(col: str) -> str:
    """Normalize a column name to standard format"""
    col_lower = col.lower().strip().replace(" ", "_").replace("-", "_")

    for standard_name, variants in COLUMN_MAPPINGS.items():
        if col_lower in variants:
            return standard_name

    return col_lower


def detect_category(description: str, part_number: str = "") -> PriceListCategory:
    """Detect category from description and part number"""
    text = f"{description} {part_number}".lower()

    # Equipment keywords
    equipment_keywords = [
        "furnace", "air handler", "condenser", "heat pump", "package unit",
        "split system", "mini split", "boiler", "air conditioner", "ac unit"
    ]
    for kw in equipment_keywords:
        if kw in text:
            return PriceListCategory.EQUIPMENT

    # Refrigerant keywords
    refrigerant_keywords = ["r-410a", "r410a", "r-22", "r22", "r-134a", "refrigerant", "freon"]
    for kw in refrigerant_keywords:
        if kw in text:
            return PriceListCategory.REFRIGERANT

    # Materials keywords
    material_keywords = [
        "line set", "lineset", "copper", "wire", "duct", "flex",
        "insulation", "tape", "sealant", "pipe", "tubing"
    ]
    for kw in material_keywords:
        if kw in text:
            return PriceListCategory.MATERIALS

    # Parts keywords
    parts_keywords = [
        "capacitor", "contactor", "relay", "motor", "fan", "blade",
        "compressor", "coil", "valve", "thermostat", "sensor",
        "filter", "disconnect", "breaker", "fuse"
    ]
    for kw in parts_keywords:
        if kw in text:
            return PriceListCategory.PARTS

    # Tools keywords
    tool_keywords = ["gauge", "manifold", "vacuum pump", "tool", "meter", "detector"]
    for kw in tool_keywords:
        if kw in text:
            return PriceListCategory.TOOLS

    return PriceListCategory.OTHER


def parse_cost(value: str) -> Optional[float]:
    """Parse a cost value from string"""
    if not value:
        return None

    # Remove currency symbols and commas
    cleaned = value.replace("$", "").replace(",", "").strip()

    try:
        return float(cleaned)
    except ValueError:
        return None


def parse_boolean(value: str) -> bool:
    """Parse a boolean from various string representations"""
    if not value:
        return True  # Default to in stock

    value_lower = value.lower().strip()
    true_values = ["yes", "y", "true", "1", "in stock", "available", "in_stock"]
    return value_lower in true_values


def parse_integer(value: str) -> Optional[int]:
    """Parse an integer from string"""
    if not value:
        return None

    try:
        return int(float(value))
    except ValueError:
        return None


class PriceListParser:
    """Parser for distributor price list CSV files"""

    def __init__(self, business_id: str, distributor_id: str):
        self.business_id = business_id
        self.distributor_id = distributor_id
        self.errors: List[str] = []
        self.warnings: List[str] = []

    def parse_csv(self, file_content: bytes) -> List[Dict[str, Any]]:
        """Parse CSV content and return list of item dictionaries"""
        items = []

        try:
            # Try different encodings
            content = None
            for encoding in ["utf-8", "utf-8-sig", "latin-1", "cp1252"]:
                try:
                    content = file_content.decode(encoding)
                    break
                except UnicodeDecodeError:
                    continue

            if content is None:
                self.errors.append("Unable to decode file. Please use UTF-8 encoding.")
                return []

            # Parse CSV
            reader = csv.DictReader(io.StringIO(content))

            # Normalize column names
            if reader.fieldnames:
                normalized_fields = [normalize_column_name(f) for f in reader.fieldnames]
                original_to_normalized = dict(zip(reader.fieldnames, normalized_fields))
            else:
                self.errors.append("No columns found in CSV")
                return []

            # Check for required columns
            if "part_number" not in normalized_fields:
                self.errors.append("Missing required column: part_number")
                return []
            if "description" not in normalized_fields:
                self.errors.append("Missing required column: description")
                return []
            if "cost" not in normalized_fields:
                self.warnings.append("No cost column found - items will have $0 cost")

            row_num = 1
            for row in reader:
                row_num += 1

                # Map to normalized names
                normalized_row = {}
                for orig_key, value in row.items():
                    norm_key = original_to_normalized.get(orig_key, orig_key)
                    normalized_row[norm_key] = value

                # Extract values
                part_number = normalized_row.get("part_number", "").strip()
                description = normalized_row.get("description", "").strip()

                if not part_number:
                    self.warnings.append(f"Row {row_num}: Missing part number, skipping")
                    continue

                if not description:
                    self.warnings.append(f"Row {row_num}: Missing description for {part_number}")
                    description = part_number

                cost = parse_cost(normalized_row.get("cost", "0"))
                if cost is None:
                    self.warnings.append(f"Row {row_num}: Invalid cost for {part_number}, using 0")
                    cost = 0

                item = {
                    "business_id": self.business_id,
                    "distributor_id": self.distributor_id,
                    "part_number": part_number,
                    "description": description,
                    "cost": cost,
                    "msrp": parse_cost(normalized_row.get("msrp", "")),
                    "brand": normalized_row.get("brand", "").strip() or None,
                    "model": normalized_row.get("model", "").strip() or None,
                    "manufacturer": normalized_row.get("manufacturer", "").strip() or None,
                    "unit": normalized_row.get("unit", "each").strip() or "each",
                    "in_stock": parse_boolean(normalized_row.get("in_stock", "yes")),
                    "lead_time_days": parse_integer(normalized_row.get("lead_time", "")),
                    "category": self._detect_category(
                        normalized_row.get("category", ""),
                        description,
                        part_number
                    ),
                    "effective_date": date.today(),
                    "created_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow()
                }

                items.append(item)

            logger.info(f"Parsed {len(items)} items from CSV")
            return items

        except Exception as e:
            self.errors.append(f"Error parsing CSV: {str(e)}")
            logger.error(f"CSV parsing error: {e}")
            return []

    def _detect_category(self, category_str: str, description: str, part_number: str) -> str:
        """Detect or map category"""
        if category_str:
            category_lower = category_str.lower()
            category_map = {
                "equipment": PriceListCategory.EQUIPMENT,
                "parts": PriceListCategory.PARTS,
                "part": PriceListCategory.PARTS,
                "materials": PriceListCategory.MATERIALS,
                "material": PriceListCategory.MATERIALS,
                "refrigerant": PriceListCategory.REFRIGERANT,
                "tools": PriceListCategory.TOOLS,
                "tool": PriceListCategory.TOOLS,
            }
            if category_lower in category_map:
                return category_map[category_lower].value

        # Auto-detect
        return detect_category(description, part_number).value


def get_csv_template() -> str:
    """Generate a CSV template for price list uploads"""
    headers = [
        "part_number",
        "description",
        "cost",
        "msrp",
        "brand",
        "model",
        "category",
        "unit",
        "in_stock",
        "lead_time_days"
    ]

    sample_rows = [
        ["24ACC636A003", "Am Std Silver 15 3.5T Condenser", "5400.00", "7200.00", "American Standard", "Silver 15", "equipment", "each", "yes", "3"],
        ["CP-35/5", "35/5 MFD Dual Run Capacitor", "12.50", "35.00", "Generic", "", "parts", "each", "yes", ""],
        ["LS-3830", "Line Set 3/8x3/4 30ft", "165.00", "220.00", "", "", "materials", "each", "yes", "1"],
        ["R410A-25", "R-410A Refrigerant 25lb", "185.00", "275.00", "Chemours", "", "refrigerant", "cylinder", "yes", ""],
    ]

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(headers)
    for row in sample_rows:
        writer.writerow(row)

    return output.getvalue()
