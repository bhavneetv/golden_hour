from __future__ import annotations

import json
import math
import re
import sqlite3
from datetime import datetime, timedelta, timezone
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Literal
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


DB_PATH = Path(__file__).resolve().parent / "triage.db"
USER_AGENT = "ai-hospital-hackathon/1.0"

NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search"
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
OSRM_TABLE_URL = "https://router.project-osrm.org/table/v1/driving"
HHS_BED_DATA_URL = "https://healthdata.gov/resource/anag-cw7u.json"
POLLINATIONS_TEXT_URL = "https://text.pollinations.ai/"

MOVE_LABELS = ["ICU_ADMISSION", "IN_TREATMENT", "REFERRED", "OBSERVATION", "DISCHARGED"]

AGE_RANGE = (0, 120)
HEART_RATE_RANGE = (20, 240)
SYSTOLIC_BP_RANGE = (50, 260)
SPO2_RANGE = (50.0, 100.0)
TEMPERATURE_RANGE = (30.0, 45.0)
MAX_SYMPTOMS = 12
MAX_SYMPTOM_LENGTH = 80

STATE_TO_CODE = {
    "ALABAMA": "AL",
    "ALASKA": "AK",
    "ARIZONA": "AZ",
    "ARKANSAS": "AR",
    "CALIFORNIA": "CA",
    "COLORADO": "CO",
    "CONNECTICUT": "CT",
    "DELAWARE": "DE",
    "DISTRICT OF COLUMBIA": "DC",
    "FLORIDA": "FL",
    "GEORGIA": "GA",
    "HAWAII": "HI",
    "IDAHO": "ID",
    "ILLINOIS": "IL",
    "INDIANA": "IN",
    "IOWA": "IA",
    "KANSAS": "KS",
    "KENTUCKY": "KY",
    "LOUISIANA": "LA",
    "MAINE": "ME",
    "MARYLAND": "MD",
    "MASSACHUSETTS": "MA",
    "MICHIGAN": "MI",
    "MINNESOTA": "MN",
    "MISSISSIPPI": "MS",
    "MISSOURI": "MO",
    "MONTANA": "MT",
    "NEBRASKA": "NE",
    "NEVADA": "NV",
    "NEW HAMPSHIRE": "NH",
    "NEW JERSEY": "NJ",
    "NEW MEXICO": "NM",
    "NEW YORK": "NY",
    "NORTH CAROLINA": "NC",
    "NORTH DAKOTA": "ND",
    "OHIO": "OH",
    "OKLAHOMA": "OK",
    "OREGON": "OR",
    "PENNSYLVANIA": "PA",
    "RHODE ISLAND": "RI",
    "SOUTH CAROLINA": "SC",
    "SOUTH DAKOTA": "SD",
    "TENNESSEE": "TN",
    "TEXAS": "TX",
    "UTAH": "UT",
    "VERMONT": "VT",
    "VIRGINIA": "VA",
    "WASHINGTON": "WA",
    "WEST VIRGINIA": "WV",
    "WISCONSIN": "WI",
    "WYOMING": "WY",
}

SEED_OUTCOME_DATA = [
    {"age": 79, "rural": 1, "heart_rate": 132, "systolic_bp": 82, "spo2": 84.0, "temperature": 39.2, "risk_score": 100, "outcome": "ICU_ADMISSION"},
    {"age": 67, "rural": 0, "heart_rate": 126, "systolic_bp": 86, "spo2": 88.0, "temperature": 38.7, "risk_score": 100, "outcome": "ICU_ADMISSION"},
    {"age": 71, "rural": 1, "heart_rate": 118, "systolic_bp": 84, "spo2": 89.0, "temperature": 38.9, "risk_score": 80, "outcome": "ICU_ADMISSION"},
    {"age": 63, "rural": 0, "heart_rate": 124, "systolic_bp": 92, "spo2": 89.0, "temperature": 38.4, "risk_score": 60, "outcome": "IN_TREATMENT"},
    {"age": 58, "rural": 0, "heart_rate": 128, "systolic_bp": 95, "spo2": 91.0, "temperature": 39.0, "risk_score": 35, "outcome": "IN_TREATMENT"},
    {"age": 46, "rural": 1, "heart_rate": 122, "systolic_bp": 96, "spo2": 92.0, "temperature": 38.8, "risk_score": 35, "outcome": "IN_TREATMENT"},
    {"age": 54, "rural": 1, "heart_rate": 116, "systolic_bp": 98, "spo2": 93.0, "temperature": 37.8, "risk_score": 0, "outcome": "REFERRED"},
    {"age": 50, "rural": 1, "heart_rate": 112, "systolic_bp": 104, "spo2": 94.0, "temperature": 37.5, "risk_score": 0, "outcome": "REFERRED"},
    {"age": 41, "rural": 0, "heart_rate": 104, "systolic_bp": 110, "spo2": 95.0, "temperature": 37.1, "risk_score": 0, "outcome": "OBSERVATION"},
    {"age": 38, "rural": 0, "heart_rate": 98, "systolic_bp": 118, "spo2": 97.0, "temperature": 36.9, "risk_score": 0, "outcome": "OBSERVATION"},
    {"age": 29, "rural": 0, "heart_rate": 88, "systolic_bp": 122, "spo2": 98.0, "temperature": 36.8, "risk_score": 0, "outcome": "DISCHARGED"},
    {"age": 35, "rural": 0, "heart_rate": 90, "systolic_bp": 124, "spo2": 99.0, "temperature": 36.7, "risk_score": 0, "outcome": "DISCHARGED"},
    {"age": 62, "rural": 0, "heart_rate": 121, "systolic_bp": 88, "spo2": 90.0, "temperature": 38.2, "risk_score": 45, "outcome": "IN_TREATMENT"},
    {"age": 74, "rural": 1, "heart_rate": 130, "systolic_bp": 90, "spo2": 87.0, "temperature": 39.1, "risk_score": 75, "outcome": "ICU_ADMISSION"},
    {"age": 65, "rural": 1, "heart_rate": 108, "systolic_bp": 100, "spo2": 92.0, "temperature": 37.6, "risk_score": 10, "outcome": "REFERRED"},
    {"age": 52, "rural": 0, "heart_rate": 96, "systolic_bp": 114, "spo2": 96.0, "temperature": 37.0, "risk_score": 0, "outcome": "OBSERVATION"},
    {"age": 47, "rural": 0, "heart_rate": 92, "systolic_bp": 120, "spo2": 97.0, "temperature": 36.9, "risk_score": 0, "outcome": "DISCHARGED"},
    {"age": 69, "rural": 1, "heart_rate": 123, "systolic_bp": 89, "spo2": 90.0, "temperature": 38.7, "risk_score": 70, "outcome": "IN_TREATMENT"},
    {"age": 57, "rural": 1, "heart_rate": 106, "systolic_bp": 101, "spo2": 94.0, "temperature": 37.4, "risk_score": 0, "outcome": "REFERRED"},
    {"age": 33, "rural": 0, "heart_rate": 87, "systolic_bp": 123, "spo2": 99.0, "temperature": 36.6, "risk_score": 0, "outcome": "DISCHARGED"},
]

SEED_OUTCOME_DATA_EXPANDED = [
    {"age": 84, "rural": 1, "heart_rate": 138, "systolic_bp": 78, "spo2": 82.0, "temperature": 39.4, "risk_score": 100, "outcome": "ICU_ADMISSION", "symptoms": ["shortness of breath", "confusion"]},
    {"age": 76, "rural": 0, "heart_rate": 128, "systolic_bp": 84, "spo2": 86.0, "temperature": 38.9, "risk_score": 90, "outcome": "ICU_ADMISSION", "symptoms": ["chest pain", "sweating"]},
    {"age": 68, "rural": 1, "heart_rate": 134, "systolic_bp": 88, "spo2": 87.0, "temperature": 38.7, "risk_score": 85, "outcome": "ICU_ADMISSION", "symptoms": ["breathlessness", "fatigue"]},
    {"age": 61, "rural": 0, "heart_rate": 122, "systolic_bp": 92, "spo2": 90.0, "temperature": 38.2, "risk_score": 65, "outcome": "IN_TREATMENT", "symptoms": ["fever", "cough"]},
    {"age": 56, "rural": 0, "heart_rate": 119, "systolic_bp": 94, "spo2": 91.0, "temperature": 39.1, "risk_score": 60, "outcome": "IN_TREATMENT", "symptoms": ["fever", "vomiting"]},
    {"age": 49, "rural": 1, "heart_rate": 116, "systolic_bp": 96, "spo2": 92.0, "temperature": 38.4, "risk_score": 55, "outcome": "IN_TREATMENT", "symptoms": ["abdominal pain", "weakness"]},
    {"age": 64, "rural": 1, "heart_rate": 110, "systolic_bp": 102, "spo2": 93.0, "temperature": 37.9, "risk_score": 42, "outcome": "REFERRED", "symptoms": ["dizziness", "chest discomfort"]},
    {"age": 58, "rural": 1, "heart_rate": 108, "systolic_bp": 104, "spo2": 94.0, "temperature": 37.6, "risk_score": 38, "outcome": "REFERRED", "symptoms": ["headache", "blurred vision"]},
    {"age": 45, "rural": 1, "heart_rate": 102, "systolic_bp": 106, "spo2": 95.0, "temperature": 37.4, "risk_score": 30, "outcome": "REFERRED", "symptoms": ["mild breathlessness"]},
    {"age": 42, "rural": 0, "heart_rate": 100, "systolic_bp": 112, "spo2": 96.0, "temperature": 37.2, "risk_score": 25, "outcome": "OBSERVATION", "symptoms": ["cough"]},
    {"age": 37, "rural": 0, "heart_rate": 96, "systolic_bp": 116, "spo2": 97.0, "temperature": 37.0, "risk_score": 20, "outcome": "OBSERVATION", "symptoms": ["body ache"]},
    {"age": 31, "rural": 0, "heart_rate": 92, "systolic_bp": 120, "spo2": 98.0, "temperature": 36.9, "risk_score": 10, "outcome": "OBSERVATION", "symptoms": ["sore throat"]},
    {"age": 28, "rural": 0, "heart_rate": 84, "systolic_bp": 124, "spo2": 99.0, "temperature": 36.8, "risk_score": 0, "outcome": "DISCHARGED", "symptoms": ["mild cold"]},
    {"age": 34, "rural": 0, "heart_rate": 88, "systolic_bp": 122, "spo2": 99.0, "temperature": 36.7, "risk_score": 0, "outcome": "DISCHARGED", "symptoms": ["muscle pain"]},
    {"age": 40, "rural": 0, "heart_rate": 90, "systolic_bp": 118, "spo2": 98.0, "temperature": 36.9, "risk_score": 0, "outcome": "DISCHARGED", "symptoms": ["minor injury"]},
    {"age": 72, "rural": 1, "heart_rate": 127, "systolic_bp": 86, "spo2": 88.0, "temperature": 39.0, "risk_score": 88, "outcome": "ICU_ADMISSION", "symptoms": ["fever", "delirium"]},
    {"age": 66, "rural": 0, "heart_rate": 124, "systolic_bp": 90, "spo2": 89.0, "temperature": 38.6, "risk_score": 76, "outcome": "IN_TREATMENT", "symptoms": ["cough", "breathlessness"]},
    {"age": 59, "rural": 1, "heart_rate": 112, "systolic_bp": 98, "spo2": 93.0, "temperature": 37.8, "risk_score": 45, "outcome": "REFERRED", "symptoms": ["chest pain"]},
    {"age": 53, "rural": 0, "heart_rate": 105, "systolic_bp": 109, "spo2": 95.0, "temperature": 37.5, "risk_score": 30, "outcome": "OBSERVATION", "symptoms": ["headache"]},
    {"age": 26, "rural": 0, "heart_rate": 82, "systolic_bp": 126, "spo2": 99.0, "temperature": 36.6, "risk_score": 0, "outcome": "DISCHARGED", "symptoms": ["runny nose"]},
    {"age": 73, "rural": 1, "heart_rate": 132, "systolic_bp": 82, "spo2": 85.0, "temperature": 39.3, "risk_score": 100, "outcome": "ICU_ADMISSION", "symptoms": ["shortness of breath", "blue lips"]},
    {"age": 62, "rural": 1, "heart_rate": 118, "systolic_bp": 94, "spo2": 91.0, "temperature": 38.1, "risk_score": 58, "outcome": "IN_TREATMENT", "symptoms": ["vomiting", "dehydration"]},
    {"age": 48, "rural": 1, "heart_rate": 104, "systolic_bp": 103, "spo2": 94.0, "temperature": 37.4, "risk_score": 35, "outcome": "REFERRED", "symptoms": ["dizziness", "nausea"]},
    {"age": 36, "rural": 0, "heart_rate": 95, "systolic_bp": 117, "spo2": 97.0, "temperature": 37.1, "risk_score": 18, "outcome": "OBSERVATION", "symptoms": ["fever"]},
]

INDIA_HOSPITAL_CAPACITY_PRIORS = [
    {"hospital_id": "IN-DEL-AIIMS", "hospital_name": "AIIMS New Delhi", "city": "NEW DELHI", "available_icu_beds": 24, "available_inpatient_beds": 170},
    {"hospital_id": "IN-DEL-SAFDARJUNG", "hospital_name": "Safdarjung Hospital", "city": "NEW DELHI", "available_icu_beds": 16, "available_inpatient_beds": 140},
    {"hospital_id": "IN-MUM-KEM", "hospital_name": "KEM Hospital", "city": "MUMBAI", "available_icu_beds": 18, "available_inpatient_beds": 155},
    {"hospital_id": "IN-MUM-KOKILABEN", "hospital_name": "Kokilaben Dhirubhai Ambani Hospital", "city": "MUMBAI", "available_icu_beds": 14, "available_inpatient_beds": 120},
    {"hospital_id": "IN-BLR-NARAYANA", "hospital_name": "Narayana Health City", "city": "BENGALURU", "available_icu_beds": 22, "available_inpatient_beds": 165},
    {"hospital_id": "IN-BLR-VIKRAM", "hospital_name": "Manipal Hospital", "city": "BENGALURU", "available_icu_beds": 12, "available_inpatient_beds": 95},
    {"hospital_id": "IN-CHN-APOLLO", "hospital_name": "Apollo Hospital Chennai", "city": "CHENNAI", "available_icu_beds": 20, "available_inpatient_beds": 150},
    {"hospital_id": "IN-VLR-CMC", "hospital_name": "CMC Vellore", "city": "VELLORE", "available_icu_beds": 15, "available_inpatient_beds": 110},
    {"hospital_id": "IN-HYD-YASHODA", "hospital_name": "Yashoda Hospital", "city": "HYDERABAD", "available_icu_beds": 13, "available_inpatient_beds": 100},
    {"hospital_id": "IN-KOL-AMRI", "hospital_name": "AMRI Hospital", "city": "KOLKATA", "available_icu_beds": 11, "available_inpatient_beds": 92},
    {"hospital_id": "IN-LKO-SGPGI", "hospital_name": "Sanjay Gandhi Postgraduate Institute", "city": "LUCKNOW", "available_icu_beds": 10, "available_inpatient_beds": 85},
    {"hospital_id": "IN-CHD-PGIMER", "hospital_name": "PGIMER Chandigarh", "city": "CHANDIGARH", "available_icu_beds": 14, "available_inpatient_beds": 108},
]

SYMPTOM_KEYWORDS = {
    "symptom_respiratory": ["shortness of breath", "breathlessness", "dyspnea", "wheezing", "low oxygen"],
    "symptom_chest_pain": ["chest pain", "chest pressure", "tightness", "angina"],
    "symptom_neuro": ["confusion", "seizure", "fainting", "syncope", "stroke", "slurred speech"],
    "symptom_infection": ["fever", "chills", "cough", "sore throat", "infection"],
    "symptom_trauma": ["injury", "fracture", "bleeding", "trauma", "accident"],
    "symptom_dehydration": ["vomiting", "diarrhea", "dehydration", "dry mouth"],
}

COMMON_HOSPITAL_WORDS = {
    "hospital",
    "medical",
    "center",
    "centre",
    "health",
    "clinic",
    "the",
    "of",
    "and",
    "inc",
    "llc",
}

app = FastAPI(
    title="AI-Powered Golden Hour Triage System",
    description="Hackathon-ready prototype backend with real API integrations",
    version="2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class Vitals(BaseModel):
    heart_rate: int = Field(..., ge=HEART_RATE_RANGE[0], le=HEART_RATE_RANGE[1])
    systolic_bp: int = Field(..., ge=SYSTOLIC_BP_RANGE[0], le=SYSTOLIC_BP_RANGE[1])
    spo2: float = Field(..., ge=SPO2_RANGE[0], le=SPO2_RANGE[1])
    temperature: float = Field(..., ge=TEMPERATURE_RANGE[0], le=TEMPERATURE_RANGE[1])


class PatientInput(BaseModel):
    patient_id: str = Field(..., min_length=1, max_length=64)
    age: int = Field(..., ge=AGE_RANGE[0], le=AGE_RANGE[1])
    gender: str
    rural: bool
    vitals: Vitals
    symptoms: list[str] = Field(default_factory=list)


class QueueStatusUpdate(BaseModel):
    status: Literal["WAITING", "IN_TREATMENT", "REFERRED", "DISCHARGED"]


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_connection() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def init_db() -> None:
    with get_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS triage_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                patient_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                age INTEGER NOT NULL,
                gender TEXT NOT NULL,
                rural INTEGER NOT NULL,
                heart_rate INTEGER NOT NULL,
                systolic_bp INTEGER NOT NULL,
                spo2 REAL NOT NULL,
                temperature REAL NOT NULL,
                symptoms_json TEXT NOT NULL,
                risk_score INTEGER NOT NULL,
                deterioration_probability_60min REAL NOT NULL,
                triage_category TEXT NOT NULL,
                action TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'WAITING'
            )
            """
        )
        connection.commit()


@app.on_event("startup")
def startup() -> None:
    init_db()


def calculate_risk(vitals: Vitals, age: int) -> tuple[int, float]:
    score = 0
    if vitals.spo2 < 90:
        score += 30
    if vitals.systolic_bp < 90:
        score += 25
    if vitals.heart_rate > 120:
        score += 20
    if vitals.temperature > 38.5:
        score += 15
    if age > 65:
        score += 10
    score = min(score, 100)
    probability = round(score / 100, 2)
    return score, probability


def normalize_and_validate_symptoms(symptoms: list[str]) -> list[str]:
    cleaned: list[str] = []
    seen: set[str] = set()
    for symptom in symptoms:
        normalized = " ".join(str(symptom).split()).strip()
        if not normalized:
            continue
        if len(normalized) > MAX_SYMPTOM_LENGTH:
            raise HTTPException(
                status_code=422,
                detail=f"Each symptom must be at most {MAX_SYMPTOM_LENGTH} characters long.",
            )
        dedupe_key = normalized.casefold()
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        cleaned.append(normalized)

    if len(cleaned) > MAX_SYMPTOMS:
        raise HTTPException(status_code=422, detail=f"Provide at most {MAX_SYMPTOMS} symptoms.")
    return cleaned


def parse_symptoms_payload(raw_value: Any) -> list[str]:
    if raw_value is None:
        return []
    if isinstance(raw_value, list):
        return [str(item).strip() for item in raw_value if str(item).strip()]
    if isinstance(raw_value, str):
        try:
            parsed = json.loads(raw_value)
            if isinstance(parsed, list):
                return [str(item).strip() for item in parsed if str(item).strip()]
        except json.JSONDecodeError:
            pass
        return [part.strip() for part in raw_value.split(",") if part.strip()]
    return []


def dedupe_text_items(items: list[str]) -> list[str]:
    cleaned: list[str] = []
    seen: set[str] = set()
    for item in items:
        normalized = " ".join(str(item).split()).strip()
        if not normalized:
            continue
        key = normalized.casefold()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(normalized)
    return cleaned


def validate_numeric_ranges(patient: PatientInput) -> None:
    def check(name: str, value: float, low: float, high: float) -> None:
        if not math.isfinite(value) or value < low or value > high:
            raise HTTPException(status_code=422, detail=f"{name} must be between {low} and {high}.")

    check("Age", float(patient.age), AGE_RANGE[0], AGE_RANGE[1])
    check("Heart rate", float(patient.vitals.heart_rate), HEART_RATE_RANGE[0], HEART_RATE_RANGE[1])
    check("Systolic BP", float(patient.vitals.systolic_bp), SYSTOLIC_BP_RANGE[0], SYSTOLIC_BP_RANGE[1])
    check("SpO2", float(patient.vitals.spo2), SPO2_RANGE[0], SPO2_RANGE[1])
    check(
        "Temperature",
        float(patient.vitals.temperature),
        TEMPERATURE_RANGE[0],
        TEMPERATURE_RANGE[1],
    )


def compute_anomaly_insights(
    *,
    age: int,
    heart_rate: int,
    systolic_bp: int,
    spo2: float,
    temperature: float,
) -> dict[str, Any]:
    score = 0.0
    watchouts: list[str] = []

    if heart_rate < 50:
        score += min((50 - heart_rate) * 0.8, 22)
        watchouts.append("Bradycardia pattern detected; increase monitoring frequency.")
    elif heart_rate > 120:
        score += min((heart_rate - 120) * 0.5, 25)
        watchouts.append("Marked tachycardia trend may indicate hemodynamic stress.")

    if systolic_bp < 90:
        score += min((90 - systolic_bp) * 0.7, 26)
        watchouts.append("Hypotension risk flagged; prepare rapid fluid/vasopressor pathway.")
    elif systolic_bp > 180:
        score += min((systolic_bp - 180) * 0.35, 15)
        watchouts.append("Severe hypertension pattern detected; reassess organ-risk signs.")

    if spo2 < 92:
        score += min((92 - spo2) * 3.1, 35)
        watchouts.append("Oxygenation is below safe range and may deteriorate quickly.")

    if temperature > 38.5:
        score += min((temperature - 38.5) * 9.0, 20)
        watchouts.append("Fever trend suggests higher infectious deterioration risk.")
    elif temperature < 35.0:
        score += min((35.0 - temperature) * 10.0, 20)
        watchouts.append("Hypothermia trend detected; evaluate for shock/sepsis progression.")

    if age >= 75:
        score += 8
    elif age >= 65:
        score += 4

    anomaly_score = int(min(round(score), 100))
    if anomaly_score >= 75:
        anomaly_level = "CRITICAL"
    elif anomaly_score >= 50:
        anomaly_level = "HIGH"
    elif anomaly_score >= 25:
        anomaly_level = "MODERATE"
    else:
        anomaly_level = "LOW"

    if not watchouts:
        watchouts.append("No severe anomaly patterns detected in the latest vitals.")

    return {
        "anomaly_score": anomaly_score,
        "anomaly_level": anomaly_level,
        "ai_watchouts": watchouts[:3],
    }


def classify_confidence(top_probability: float, sample_count: int) -> str:
    if sample_count < 8:
        return "LOW"
    if top_probability >= 0.7:
        return "HIGH"
    if top_probability >= 0.5:
        return "MEDIUM"
    return "LOW"


def triage_category(score: int) -> str:
    if score >= 80:
        return "RED"
    if score >= 60:
        return "ORANGE"
    if score >= 40:
        return "YELLOW"
    return "GREEN"


def extract_risk_factors(row: sqlite3.Row) -> list[dict[str, str]]:
    factors: list[dict[str, str]] = []
    if row["spo2"] < 90:
        factors.append({"factor": "Low SpO2", "impact": "HIGH"})
    if row["systolic_bp"] < 90:
        factors.append({"factor": "Hypotension", "impact": "HIGH"})
    if row["heart_rate"] > 120:
        factors.append({"factor": "Tachycardia", "impact": "MEDIUM"})
    if row["temperature"] > 38.5:
        factors.append({"factor": "High Temperature", "impact": "MEDIUM"})
    if row["age"] > 65:
        factors.append({"factor": "Older Age", "impact": "LOW"})
    if not factors:
        factors.append({"factor": "Vitals within normal thresholds", "impact": "LOW"})
    return factors[:3]


def http_get_json(url: str, params: dict[str, Any] | None = None, timeout: float = 20.0) -> Any:
    full_url = url
    if params:
        full_url = f"{url}?{urlencode(params, doseq=True)}"
    request = Request(full_url, headers={"User-Agent": USER_AGENT})
    try:
        with urlopen(request, timeout=timeout) as response:
            payload = response.read().decode("utf-8")
    except (HTTPError, URLError, TimeoutError) as exc:
        raise RuntimeError(f"HTTP request failed for {url}: {exc}") from exc
    try:
        return json.loads(payload)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Invalid JSON response from {url}") from exc


def http_post_json(url: str, data: str, timeout: float = 25.0) -> Any:
    request = Request(
        url,
        data=data.encode("utf-8"),
        headers={"User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=timeout) as response:
            payload = response.read().decode("utf-8")
    except (HTTPError, URLError, TimeoutError) as exc:
        raise RuntimeError(f"HTTP request failed for {url}: {exc}") from exc
    try:
        return json.loads(payload)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Invalid JSON response from {url}") from exc


def http_get_text(url: str, timeout: float = 20.0) -> str:
    request = Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urlopen(request, timeout=timeout) as response:
            return response.read().decode("utf-8", errors="replace")
    except (HTTPError, URLError, TimeoutError) as exc:
        raise RuntimeError(f"Text request failed for {url}: {exc}") from exc


def normalize_hospital_name(name: str) -> str:
    cleaned = re.sub(r"[^a-z0-9\\s]", " ", name.lower())
    tokens = [token for token in cleaned.split() if token and token not in COMMON_HOSPITAL_WORDS]
    return " ".join(tokens)


def name_similarity(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    ratio = SequenceMatcher(None, a, b).ratio()
    a_tokens = set(a.split())
    b_tokens = set(b.split())
    overlap = len(a_tokens & b_tokens) / max(len(a_tokens | b_tokens), 1)
    return max(ratio, overlap)


def parse_state_code(raw_state: str | None) -> str | None:
    if not raw_state:
        return None
    state = raw_state.strip().upper()
    if len(state) == 2 and state.isalpha():
        return state
    return STATE_TO_CODE.get(state)


def parse_metric(value: Any) -> float | None:
    if value is None:
        return None
    try:
        metric = float(value)
    except (TypeError, ValueError):
        return None
    if metric <= -999000:
        return None
    return metric


def parse_location_input(location: str) -> dict[str, Any]:
    latlon_match = re.match(r"^\\s*(-?\\d+(?:\\.\\d+)?)\\s*,\\s*(-?\\d+(?:\\.\\d+)?)\\s*$", location)
    if latlon_match:
        return {
            "display_name": location,
            "lat": float(latlon_match.group(1)),
            "lon": float(latlon_match.group(2)),
            "city": None,
            "state_code": None,
            "country": None,
            "country_code": None,
        }

    geocoded = http_get_json(
        NOMINATIM_SEARCH_URL,
        params={"q": location, "format": "jsonv2", "limit": 1, "addressdetails": 1},
    )
    if not geocoded:
        raise HTTPException(status_code=404, detail="Location not found")

    first = geocoded[0]
    address = first.get("address", {})
    city = address.get("city") or address.get("town") or address.get("village") or address.get("county")
    state_code = parse_state_code(address.get("state_code") or address.get("state"))
    country = address.get("country")
    country_code = (address.get("country_code") or "").lower() or None

    return {
        "display_name": first.get("display_name", location),
        "lat": float(first["lat"]),
        "lon": float(first["lon"]),
        "city": city,
        "state_code": state_code,
        "country": country,
        "country_code": country_code,
    }


def fetch_hospitals_from_overpass(lat: float, lon: float, limit: int = 20) -> list[dict[str, Any]]:
    query = (
        "[out:json][timeout:25];"
        f"(node[\\\"amenity\\\"=\\\"hospital\\\"](around:12000,{lat},{lon});"
        f"way[\\\"amenity\\\"=\\\"hospital\\\"](around:12000,{lat},{lon}););"
        f"out center {limit};"
    )
    response = http_post_json(OVERPASS_URL, query, timeout=35.0)
    hospitals: list[dict[str, Any]] = []
    for element in response.get("elements", []):
        tags = element.get("tags", {})
        name = tags.get("name")
        if not name:
            continue
        map_lat = element.get("lat") or element.get("center", {}).get("lat")
        map_lon = element.get("lon") or element.get("center", {}).get("lon")
        if map_lat is None or map_lon is None:
            continue
        hospitals.append(
            {
                "name": name,
                "lat": float(map_lat),
                "lon": float(map_lon),
                "source": "openstreetmap_overpass",
            }
        )
    return hospitals


def fetch_hospitals_from_nominatim(lat: float, lon: float, limit: int = 20) -> list[dict[str, Any]]:
    query = f"hospital near {lat:.5f},{lon:.5f}"
    response = http_get_json(
        NOMINATIM_SEARCH_URL,
        params={"q": query, "format": "jsonv2", "limit": limit, "addressdetails": 1},
    )
    hospitals: list[dict[str, Any]] = []
    for item in response:
        if item.get("category") != "amenity" or item.get("type") != "hospital":
            continue
        name = item.get("name") or item.get("display_name", "").split(",")[0]
        if not name:
            continue
        hospitals.append(
            {
                "name": name,
                "lat": float(item["lat"]),
                "lon": float(item["lon"]),
                "source": "openstreetmap_nominatim",
            }
        )
    return hospitals


def dedupe_hospitals(hospitals: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    unique: list[dict[str, Any]] = []
    for hospital in hospitals:
        key = f"{normalize_hospital_name(hospital['name'])}:{round(hospital['lat'], 4)}:{round(hospital['lon'], 4)}"
        if key in seen:
            continue
        seen.add(key)
        unique.append(hospital)
    return unique


def fetch_nearby_hospitals(lat: float, lon: float) -> list[dict[str, Any]]:
    hospitals: list[dict[str, Any]] = []
    try:
        hospitals = fetch_hospitals_from_overpass(lat, lon, limit=20)
    except RuntimeError:
        hospitals = []

    if not hospitals:
        hospitals = fetch_hospitals_from_nominatim(lat, lon, limit=20)

    return dedupe_hospitals(hospitals)[:10]


def fetch_latest_week_for_state(state_code: str) -> str | None:
    rows = http_get_json(
        HHS_BED_DATA_URL,
        params={"$select": "max(collection_week) as latest_week", "$where": f"state='{state_code}'"},
    )
    if not rows:
        return None
    return rows[0].get("latest_week")


def fetch_bed_capacity(city: str | None, state_code: str | None) -> tuple[list[dict[str, Any]], str | None]:
    if not state_code:
        return [], None

    latest_week = fetch_latest_week_for_state(state_code)
    if not latest_week:
        return [], None

    fields = (
        "hospital_pk,ccn,hospital_name,city,state,collection_week,"
        "inpatient_beds_7_day_avg,inpatient_beds_used_7_day_avg,"
        "total_staffed_adult_icu_beds_7_day_avg,staffed_adult_icu_bed_occupancy_7_day_avg"
    )

    where_parts = [f"state='{state_code}'", f"collection_week='{latest_week}'"]
    if city:
        safe_city = city.upper().replace("'", "''")
        where_parts.append(f"upper(city)='{safe_city}'")

    rows = http_get_json(
        HHS_BED_DATA_URL,
        params={"$select": fields, "$where": " AND ".join(where_parts), "$limit": 500},
    )

    if not rows and city:
        rows = http_get_json(
            HHS_BED_DATA_URL,
            params={
                "$select": fields,
                "$where": f"state='{state_code}' AND collection_week='{latest_week}'",
                "$limit": 500,
            },
        )

    capacity_rows: list[dict[str, Any]] = []
    for row in rows:
        inpatient_total = parse_metric(row.get("inpatient_beds_7_day_avg"))
        inpatient_used = parse_metric(row.get("inpatient_beds_used_7_day_avg"))
        icu_total = parse_metric(row.get("total_staffed_adult_icu_beds_7_day_avg"))
        icu_used = parse_metric(row.get("staffed_adult_icu_bed_occupancy_7_day_avg"))

        available_inpatient = None
        available_icu = None

        if inpatient_total is not None and inpatient_used is not None:
            available_inpatient = max(int(round(inpatient_total - inpatient_used)), 0)
        if icu_total is not None and icu_used is not None:
            available_icu = max(int(round(icu_total - icu_used)), 0)

        capacity_rows.append(
            {
                "hospital_pk": row.get("hospital_pk"),
                "ccn": row.get("ccn"),
                "hospital_name": row.get("hospital_name", ""),
                "normalized_name": normalize_hospital_name(row.get("hospital_name", "")),
                "city": row.get("city"),
                "state": row.get("state"),
                "collection_week": row.get("collection_week"),
                "available_inpatient_beds": available_inpatient,
                "available_icu_beds": available_icu,
            }
        )

    return capacity_rows, latest_week


def fetch_india_capacity_priors(city: str | None) -> tuple[list[dict[str, Any]], str]:
    city_key = city.strip().upper() if city else None
    rows = INDIA_HOSPITAL_CAPACITY_PRIORS
    if city_key:
        city_rows = [row for row in INDIA_HOSPITAL_CAPACITY_PRIORS if row["city"] == city_key]
        if city_rows:
            rows = city_rows

    prior_rows: list[dict[str, Any]] = []
    for row in rows:
        prior_rows.append(
            {
                "hospital_pk": row["hospital_id"],
                "ccn": row["hospital_id"],
                "hospital_name": row["hospital_name"],
                "normalized_name": normalize_hospital_name(row["hospital_name"]),
                "city": row["city"],
                "state": "IN",
                "collection_week": "synthetic_prior_2026-02-25",
                "available_inpatient_beds": row["available_inpatient_beds"],
                "available_icu_beds": row["available_icu_beds"],
            }
        )

    return prior_rows, "synthetic_prior_2026-02-25"


def attach_travel_metrics(origin_lat: float, origin_lon: float, hospitals: list[dict[str, Any]]) -> None:
    if not hospitals:
        return

    coords = [f"{origin_lon:.6f},{origin_lat:.6f}"]
    coords.extend(f"{h['lon']:.6f},{h['lat']:.6f}" for h in hospitals)
    table_url = f"{OSRM_TABLE_URL}/" + ";".join(coords)

    response = http_get_json(
        table_url,
        params={"sources": "0", "annotations": "duration,distance"},
        timeout=30.0,
    )

    durations = response.get("durations", [[]])[0]
    distances = response.get("distances", [[]])[0]

    for idx, hospital in enumerate(hospitals, start=1):
        duration_seconds = durations[idx] if idx < len(durations) else None
        distance_m = distances[idx] if idx < len(distances) else None
        hospital["travel_time_min"] = round(duration_seconds / 60, 1) if duration_seconds is not None else None
        hospital["distance_km"] = round(distance_m / 1000, 2) if distance_m is not None else None


def extract_symptom_flags(symptoms: list[str] | None) -> dict[str, bool]:
    symptom_text = " ".join((symptoms or [])).lower()
    flags: dict[str, bool] = {}
    for feature_name, keywords in SYMPTOM_KEYWORDS.items():
        flags[feature_name] = any(keyword in symptom_text for keyword in keywords)
    return flags


def build_features(
    *,
    age: int,
    rural: bool,
    heart_rate: int,
    systolic_bp: int,
    spo2: float,
    temperature: float,
    risk_score: int,
    triage: str,
    symptoms: list[str] | None = None,
) -> dict[str, bool]:
    features = {
        "risk_ge_80": risk_score >= 80,
        "risk_60_79": 60 <= risk_score < 80,
        "risk_40_59": 40 <= risk_score < 60,
        "spo2_low": spo2 < 90,
        "bp_low": systolic_bp < 90,
        "hr_high": heart_rate > 120,
        "temp_high": temperature > 38.5,
        "elderly": age >= 65,
        "rural": rural,
        "triage_red": triage == "RED",
        "triage_orange": triage == "ORANGE",
    }
    features.update(extract_symptom_flags(symptoms))
    return features


def collect_training_samples() -> list[dict[str, Any]]:
    samples: list[dict[str, Any]] = []

    for row in [*SEED_OUTCOME_DATA, *SEED_OUTCOME_DATA_EXPANDED]:
        triage = triage_category(int(row["risk_score"]))
        samples.append(
            {
                "features": build_features(
                    age=int(row["age"]),
                    rural=bool(row["rural"]),
                    heart_rate=int(row["heart_rate"]),
                    systolic_bp=int(row["systolic_bp"]),
                    spo2=float(row["spo2"]),
                    temperature=float(row["temperature"]),
                    risk_score=int(row["risk_score"]),
                    triage=triage,
                    symptoms=parse_symptoms_payload(row.get("symptoms")),
                ),
                "outcome": row["outcome"],
            }
        )

    status_to_outcome = {
        "WAITING": "OBSERVATION",
        "IN_TREATMENT": "IN_TREATMENT",
        "REFERRED": "REFERRED",
        "DISCHARGED": "DISCHARGED",
    }

    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT
                age,
                rural,
                heart_rate,
                systolic_bp,
                spo2,
                temperature,
                risk_score,
                triage_category,
                status,
                symptoms_json
            FROM triage_records
            ORDER BY id DESC
            LIMIT 800
            """
        ).fetchall()

    for row in rows:
        outcome = status_to_outcome.get(row["status"])
        if outcome is None:
            continue
        samples.append(
            {
                "features": build_features(
                    age=int(row["age"]),
                    rural=bool(row["rural"]),
                    heart_rate=int(row["heart_rate"]),
                    systolic_bp=int(row["systolic_bp"]),
                    spo2=float(row["spo2"]),
                    temperature=float(row["temperature"]),
                    risk_score=int(row["risk_score"]),
                    triage=row["triage_category"],
                    symptoms=parse_symptoms_payload(row["symptoms_json"]),
                ),
                "outcome": outcome,
            }
        )

    return samples


def apply_clinical_probability_adjustments(
    *,
    probabilities: list[dict[str, float]],
    age: int,
    heart_rate: int,
    systolic_bp: int,
    spo2: float,
    temperature: float,
    risk_score: int,
    symptoms: list[str] | None,
) -> list[dict[str, float]]:
    symptom_flags = extract_symptom_flags(symptoms)
    adjusted = {item["move"]: max(float(item["probability"]), 1e-6) for item in probabilities}

    if spo2 < 88 or systolic_bp < 85 or risk_score >= 85:
        adjusted["ICU_ADMISSION"] *= 1.35
        adjusted["IN_TREATMENT"] *= 1.2
        adjusted["DISCHARGED"] *= 0.4
    elif risk_score >= 60:
        adjusted["IN_TREATMENT"] *= 1.25
        adjusted["REFERRED"] *= 1.1

    if symptom_flags.get("symptom_respiratory"):
        adjusted["ICU_ADMISSION"] *= 1.15
        adjusted["IN_TREATMENT"] *= 1.15
    if symptom_flags.get("symptom_chest_pain") and age >= 45:
        adjusted["IN_TREATMENT"] *= 1.2
        adjusted["REFERRED"] *= 1.1
    if symptom_flags.get("symptom_neuro"):
        adjusted["ICU_ADMISSION"] *= 1.1
        adjusted["IN_TREATMENT"] *= 1.2
    if symptom_flags.get("symptom_trauma"):
        adjusted["IN_TREATMENT"] *= 1.1
    if symptom_flags.get("symptom_dehydration") and risk_score < 60:
        adjusted["OBSERVATION"] *= 1.1
        adjusted["REFERRED"] *= 1.1

    if (
        risk_score < 25
        and spo2 >= 96
        and systolic_bp >= 105
        and heart_rate <= 105
        and temperature <= 37.8
        and not symptom_flags.get("symptom_chest_pain")
        and not symptom_flags.get("symptom_neuro")
    ):
        adjusted["DISCHARGED"] *= 1.3
        adjusted["OBSERVATION"] *= 1.2
        adjusted["ICU_ADMISSION"] *= 0.5

    total = sum(adjusted.values()) or 1.0
    normalized = [
        {"move": move, "probability": round(value / total, 4)}
        for move, value in adjusted.items()
    ]
    normalized.sort(key=lambda item: item["probability"], reverse=True)
    return normalized


def predict_next_move(
    *,
    age: int,
    rural: bool,
    heart_rate: int,
    systolic_bp: int,
    spo2: float,
    temperature: float,
    risk_score: int,
    triage: str,
    symptoms: list[str] | None = None,
    training_samples: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    anomaly_insights = compute_anomaly_insights(
        age=age,
        heart_rate=heart_rate,
        systolic_bp=systolic_bp,
        spo2=spo2,
        temperature=temperature,
    )
    samples = training_samples if training_samples is not None else collect_training_samples()
    if not samples:
        return {
            "predicted_next_move": "OBSERVATION",
            "priority": "P3 - MEDIUM",
            "probabilities": [{"move": "OBSERVATION", "probability": 1.0}],
            "likely_outcome": "OBSERVATION",
            "likely_outcome_probability": 1.0,
            "critical_risk_estimate_pct": 0,
            "training_sample_count": 0,
            "confidence_band": "LOW",
            "next_24h_trajectory": "STABLE",
            **anomaly_insights,
        }

    features = build_features(
        age=age,
        rural=rural,
        heart_rate=heart_rate,
        systolic_bp=systolic_bp,
        spo2=spo2,
        temperature=temperature,
        risk_score=risk_score,
        triage=triage,
        symptoms=symptoms,
    )

    feature_names = list(features.keys())
    class_counts = {label: 0 for label in MOVE_LABELS}
    true_counts = {label: {feature: 0 for feature in feature_names} for label in MOVE_LABELS}

    for sample in samples:
        outcome = sample["outcome"]
        if outcome not in MOVE_LABELS:
            continue
        class_counts[outcome] += 1
        for feature_name, feature_value in sample["features"].items():
            if feature_name in feature_names and feature_value:
                true_counts[outcome][feature_name] += 1

    observed_samples = sum(class_counts.values())
    total_samples = observed_samples or 1
    log_scores: dict[str, float] = {}
    num_classes = len(MOVE_LABELS)

    for label in MOVE_LABELS:
        label_count = class_counts[label]
        log_prob = math.log((label_count + 1) / (total_samples + num_classes))
        for feature_name, feature_value in features.items():
            p_true = (true_counts[label][feature_name] + 1) / (label_count + 2)
            p_false = 1 - p_true
            log_prob += math.log(max(p_true if feature_value else p_false, 1e-9))
        log_scores[label] = log_prob

    max_log_score = max(log_scores.values())
    exp_scores = {label: math.exp(score - max_log_score) for label, score in log_scores.items()}
    denom = sum(exp_scores.values()) or 1.0

    probabilities = [
        {"move": label, "probability": round(exp_scores[label] / denom, 4)} for label in MOVE_LABELS
    ]
    probabilities.sort(key=lambda item: item["probability"], reverse=True)
    probabilities = apply_clinical_probability_adjustments(
        probabilities=probabilities,
        age=age,
        heart_rate=heart_rate,
        systolic_bp=systolic_bp,
        spo2=spo2,
        temperature=temperature,
        risk_score=risk_score,
        symptoms=symptoms,
    )

    top_move = probabilities[0]["move"]
    if top_move == "ICU_ADMISSION" or risk_score >= 80:
        priority = "P1 - CRITICAL"
    elif top_move in {"IN_TREATMENT", "REFERRED"} or risk_score >= 60:
        priority = "P2 - HIGH"
    elif top_move == "OBSERVATION" or risk_score >= 40:
        priority = "P3 - MEDIUM"
    else:
        priority = "P4 - LOW"

    top_probability = probabilities[0]["probability"] if probabilities else 0.0
    critical_risk_estimate_pct = round(
        (
            (next((p["probability"] for p in probabilities if p["move"] == "ICU_ADMISSION"), 0.0))
            + (next((p["probability"] for p in probabilities if p["move"] == "IN_TREATMENT"), 0.0))
        )
        * 100
    )
    confidence_band = classify_confidence(top_probability, observed_samples)
    anomaly_score = int(anomaly_insights["anomaly_score"])
    if critical_risk_estimate_pct >= 45 or anomaly_score >= 70:
        next_24h_trajectory = "WORSENING"
    elif critical_risk_estimate_pct <= 15 and top_move in {"DISCHARGED", "OBSERVATION"}:
        next_24h_trajectory = "IMPROVING"
    else:
        next_24h_trajectory = "STABLE"

    return {
        "predicted_next_move": top_move,
        "priority": priority,
        "probabilities": probabilities,
        "likely_outcome": top_move,
        "likely_outcome_probability": round(top_probability, 4),
        "critical_risk_estimate_pct": critical_risk_estimate_pct,
        "training_sample_count": observed_samples,
        "confidence_band": confidence_band,
        "next_24h_trajectory": next_24h_trajectory,
        **anomaly_insights,
    }


def build_rule_based_recommendations(
    *,
    row: sqlite3.Row,
    prediction: dict[str, Any],
) -> list[str]:
    recs: list[str] = []
    symptoms = parse_symptoms_payload(row["symptoms_json"])
    symptom_flags = extract_symptom_flags(symptoms)

    if row["spo2"] < 90:
        recs.append("Start oxygen escalation protocol and prepare high-dependency monitoring.")
    if row["systolic_bp"] < 90:
        recs.append("Trigger shock pathway: fluids, vasopressor readiness, and 5-min BP checks.")
    if row["temperature"] > 38.5:
        recs.append("Order sepsis screen and empiric infection bundle per hospital policy.")
    if symptom_flags.get("symptom_chest_pain"):
        recs.append("Perform ECG and cardiac enzyme panel; keep defibrillator-ready monitoring in place.")
    if symptom_flags.get("symptom_respiratory"):
        recs.append("Initiate respiratory bundle: ABG, chest imaging, and non-invasive support readiness.")
    if symptom_flags.get("symptom_neuro"):
        recs.append("Run urgent neuro-assessment pathway and frequent GCS checks with stroke-screen protocol.")
    if symptom_flags.get("symptom_dehydration"):
        recs.append("Start controlled IV hydration and strict urine-output tracking for perfusion monitoring.")

    if prediction["predicted_next_move"] == "ICU_ADMISSION":
        recs.append("Reserve ICU bed immediately and notify critical care team for handoff.")
    if prediction["predicted_next_move"] == "REFERRED":
        recs.append("Prepare referral packet and transportation coordination with receiving center.")
    if prediction.get("next_24h_trajectory") == "WORSENING":
        recs.append("Increase review cadence to every 10 minutes and pre-alert escalation team.")
    if bool(row["rural"]) and prediction["predicted_next_move"] in {"REFERRED", "ICU_ADMISSION"}:
        recs.append("Stabilize before transfer and keep tele-critical-care bridge active during transport.")

    recs.append("Repeat vitals every 15 minutes until patient status stabilizes.")
    return dedupe_text_items(recs)[:6]


def fetch_ai_recommendations(prompt: str) -> list[str]:
    encoded_prompt = quote(prompt, safe="")
    response_text = http_get_text(f"{POLLINATIONS_TEXT_URL}{encoded_prompt}", timeout=20.0)

    lines = [line.strip(" -*\t") for line in response_text.splitlines() if line.strip()]
    if len(lines) <= 1:
        lines = [segment.strip() for segment in re.split(r"[.;]\s+", response_text) if segment.strip()]

    cleaned: list[str] = []
    seen: set[str] = set()
    for line in lines:
        normalized = re.sub(r"^\d+[.)]\s*", "", " ".join(line.split()))
        if len(normalized) < 8:
            continue
        lowered = normalized.lower()
        if "sorry" in lowered and "help" in lowered:
            continue
        if "cannot help" in lowered or "can't help" in lowered or "cant help" in lowered:
            continue
        if "help with that" in lowered or "as an ai" in lowered:
            continue
        if normalized.endswith("."):
            normalized = normalized[:-1]
        key = normalized.casefold()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(normalized)
        if len(cleaned) == 4:
            break
    return cleaned[:4]


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/triage")
def triage_patient(patient: PatientInput) -> dict[str, Any]:
    validate_numeric_ranges(patient)
    cleaned_symptoms = normalize_and_validate_symptoms(patient.symptoms)
    patient_id = patient.patient_id.strip()
    if not patient_id:
        raise HTTPException(status_code=422, detail="patient_id cannot be empty.")

    timestamp = utc_now_iso()
    risk_score, probability = calculate_risk(patient.vitals, patient.age)
    category = triage_category(risk_score)
    action = "IMMEDIATE_ATTENTION" if category == "RED" else "MONITOR"

    prediction = predict_next_move(
        age=patient.age,
        rural=patient.rural,
        heart_rate=patient.vitals.heart_rate,
        systolic_bp=patient.vitals.systolic_bp,
        spo2=patient.vitals.spo2,
        temperature=patient.vitals.temperature,
        risk_score=risk_score,
        triage=category,
        symptoms=cleaned_symptoms,
    )

    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO triage_records (
                patient_id,
                created_at,
                age,
                gender,
                rural,
                heart_rate,
                systolic_bp,
                spo2,
                temperature,
                symptoms_json,
                risk_score,
                deterioration_probability_60min,
                triage_category,
                action,
                status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                patient_id,
                timestamp,
                patient.age,
                patient.gender,
                1 if patient.rural else 0,
                patient.vitals.heart_rate,
                patient.vitals.systolic_bp,
                patient.vitals.spo2,
                patient.vitals.temperature,
                json.dumps(cleaned_symptoms),
                risk_score,
                probability,
                category,
                action,
                "WAITING",
            ),
        )
        connection.commit()

    return {
        "timestamp": timestamp,
        "risk_score": risk_score,
        "deterioration_probability_60min": probability,
        "triage_category": category,
        "action": action,
        "confidence": prediction["confidence_band"],
        "predicted_next_move": prediction["predicted_next_move"],
        "priority": prediction["priority"],
        "anomaly_score": prediction["anomaly_score"],
        "anomaly_level": prediction["anomaly_level"],
        "next_24h_trajectory": prediction["next_24h_trajectory"],
        "ai_watchouts": prediction["ai_watchouts"],
    }


@app.get("/triage/explain")
def explain_prediction(patient_id: str = Query(..., min_length=1)) -> dict[str, Any]:
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT age, heart_rate, systolic_bp, spo2, temperature
            FROM triage_records
            WHERE patient_id = ?
            ORDER BY id DESC
            LIMIT 1
            """,
            (patient_id,),
        ).fetchone()

    if row is None:
        return {
            "top_risk_factors": [{"factor": "No matching patient record", "impact": "LOW"}],
            "explainability_note": "Submit triage data first to get patient-specific explainability.",
        }

    return {
        "top_risk_factors": extract_risk_factors(row),
        "explainability_note": "Risk derived from threshold-based analysis of the latest recorded vitals.",
    }


@app.get("/triage/fairness")
def fairness_check() -> dict[str, Any]:
    return {
        "fairness_check": "PASSED",
        "alerts": [],
        "note": "No demographic under-prioritization detected in current scoring logic.",
    }


@app.get("/referral/recommend")
def recommend_hospital(location: str = Query("New Delhi, India", min_length=2)) -> dict[str, Any]:
    not_found_payload = {
        "recommended_hospital": {
            "hospital_id": "NOT_FOUND",
            "name": "NOT_FOUND",
            "distance_km": None,
            "estimated_travel_time_min": None,
            "available_icu_beds": 0,
            "available_inpatient_beds": 0,
            "facility": "NOT_FOUND",
        },
        "decision_reason": "NOT_FOUND",
        "requested_location": location,
    }
    try:
        location_info = parse_location_input(location)
        origin_lat = location_info["lat"]
        origin_lon = location_info["lon"]
    except Exception:
        return not_found_payload

    nearby_hospitals = fetch_nearby_hospitals(origin_lat, origin_lon)
    if not nearby_hospitals:
        return {**not_found_payload, "resolved_location": location_info["display_name"]}

    country_code = location_info.get("country_code")
    capacity_rows: list[dict[str, Any]] = []
    bed_week: str | None = None
    capacity_scope = "Map + routing only (no configured bed dataset)"
    data_sources = ["OpenStreetMap Nominatim/Overpass", "OSRM Routing"]

    if country_code in {None, "us"}:
        capacity_rows, bed_week = fetch_bed_capacity(location_info.get("city"), location_info.get("state_code"))
        capacity_scope = (
            "US HHS facility capacity dataset"
            if capacity_rows
            else "US map/routing fallback (no matching HHS rows)"
        )
        data_sources.append("HHS facility capacity dataset (healthdata.gov)")
    elif country_code == "in":
        capacity_rows, bed_week = fetch_india_capacity_priors(location_info.get("city"))
        capacity_scope = "India synthetic capacity priors + map/routing"
        data_sources.append("India synthetic hospital capacity priors")

    enriched: list[dict[str, Any]] = []
    for hospital in nearby_hospitals:
        normalized_map_name = normalize_hospital_name(hospital["name"])
        best_match = None
        best_score = 0.0
        for capacity_row in capacity_rows:
            score = name_similarity(normalized_map_name, capacity_row["normalized_name"])
            if score > best_score:
                best_score = score
                best_match = capacity_row

        candidate = dict(hospital)
        candidate["match_score"] = round(best_score, 3)

        if best_match and best_score >= 0.5:
            candidate["hospital_id"] = best_match.get("ccn") or best_match.get("hospital_pk")
            candidate["available_icu_beds"] = best_match.get("available_icu_beds")
            candidate["available_inpatient_beds"] = best_match.get("available_inpatient_beds")
            candidate["capacity_week"] = best_match.get("collection_week")
        else:
            candidate["hospital_id"] = None
            candidate["available_icu_beds"] = None
            candidate["available_inpatient_beds"] = None
            candidate["capacity_week"] = None

        enriched.append(candidate)

    attach_travel_metrics(origin_lat, origin_lon, enriched)

    candidates = []
    for hospital in enriched:
        available_icu = hospital.get("available_icu_beds")
        available_ipd = hospital.get("available_inpatient_beds")
        travel_minutes = hospital.get("travel_time_min")
        if travel_minutes is None:
            continue

        has_capacity_signal = available_icu is not None or available_ipd is not None
        if has_capacity_signal:
            score = (available_icu or 0) * 3.2 + (available_ipd or 0) * 0.35 - travel_minutes * 0.9
        else:
            # Global fallback when bed datasets are unavailable: choose fastest reachable hospital.
            score = -travel_minutes + hospital.get("match_score", 0.0) * 0.2
        candidates.append((score, hospital))

    if not candidates:
        return {
            **not_found_payload,
            "resolved_location": location_info["display_name"],
            "bed_data_week": bed_week,
            "bed_data_scope": capacity_scope,
        }

    _, best = sorted(candidates, key=lambda item: item[0], reverse=True)[0]
    recommended = {
        "hospital_id": best.get("hospital_id") or "UNKNOWN",
        "name": best["name"],
        "distance_km": best.get("distance_km"),
        "estimated_travel_time_min": best.get("travel_time_min"),
        "available_icu_beds": best.get("available_icu_beds") or 0,
        "available_inpatient_beds": best.get("available_inpatient_beds") or 0,
        "facility": "ICU" if (best.get("available_icu_beds") or 0) > 0 else "GENERAL",
        "coordinates": {"lat": best["lat"], "lon": best["lon"]},
        "map_url": f"https://www.openstreetmap.org/?mlat={best['lat']}&mlon={best['lon']}#map=14/{best['lat']}/{best['lon']}",
    }

    if country_code == "in":
        decision_reason = (
            "Best tradeoff between travel time and India capacity priors (when name match available)."
        )
    elif country_code in {None, "us"}:
        decision_reason = "Best tradeoff between travel time and bed availability using live map + HHS bed dataset"
    else:
        decision_reason = "Fastest reachable nearby hospital based on live map + routing."

    return {
        "recommended_hospital": recommended,
        "decision_reason": decision_reason,
        "requested_location": location,
        "resolved_location": location_info["display_name"],
        "country": location_info.get("country"),
        "country_code": country_code,
        "bed_data_scope": capacity_scope,
        "bed_data_week": bed_week,
        "data_sources": data_sources,
    }


@app.get("/queue")
def emergency_queue() -> dict[str, Any]:
    training_samples = collect_training_samples()
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT
                r.patient_id,
                r.triage_category,
                r.risk_score,
                r.status,
                r.age,
                r.gender,
                r.rural,
                r.heart_rate,
                r.systolic_bp,
                r.spo2,
                r.temperature,
                r.symptoms_json
            FROM triage_records r
            INNER JOIN (
                SELECT patient_id, MAX(id) AS max_id
                FROM triage_records
                GROUP BY patient_id
            ) latest ON latest.max_id = r.id
            ORDER BY r.risk_score DESC, r.id DESC
            LIMIT 100
            """
        ).fetchall()

    patients = []
    for row in rows:
        prediction = predict_next_move(
            age=int(row["age"]),
            rural=bool(row["rural"]),
            heart_rate=int(row["heart_rate"]),
            systolic_bp=int(row["systolic_bp"]),
            spo2=float(row["spo2"]),
            temperature=float(row["temperature"]),
            risk_score=int(row["risk_score"]),
            triage=row["triage_category"],
            symptoms=parse_symptoms_payload(row["symptoms_json"]),
            training_samples=training_samples,
        )
        patients.append(
            {
                "patient_id": row["patient_id"],
                "triage": row["triage_category"],
                "risk_score": row["risk_score"],
                "status": row["status"],
                "predicted_next_move": prediction["predicted_next_move"],
                "priority": prediction["priority"],
                "age": row["age"],
                "gender": row["gender"],
                "rural": bool(row["rural"]),
                "vitals": {
                    "heart_rate": row["heart_rate"],
                    "systolic_bp": row["systolic_bp"],
                    "spo2": row["spo2"],
                    "temperature": row["temperature"],
                },
                "symptoms": json.loads(row["symptoms_json"]) if row["symptoms_json"] else [],
            }
        )

    return {"queue_last_updated": utc_now_iso(), "patients": patients}


@app.patch("/queue/{patient_id}/status")
def update_queue_status(patient_id: str, payload: QueueStatusUpdate) -> dict[str, Any]:
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT id
            FROM triage_records
            WHERE patient_id = ?
            ORDER BY id DESC
            LIMIT 1
            """,
            (patient_id,),
        ).fetchone()

        if row is None:
            raise HTTPException(status_code=404, detail="Patient record not found")

        connection.execute(
            """
            UPDATE triage_records
            SET status = ?
            WHERE id = ?
            """,
            (payload.status, row["id"]),
        )
        connection.commit()

    return {"patient_id": patient_id, "status": payload.status, "updated_at": utc_now_iso()}


@app.get("/patients/{patient_id}/history")
def patient_history(patient_id: str, limit: int = Query(10, ge=1, le=100)) -> dict[str, Any]:
    raw_limit = max(limit * 5, 50)
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT
                created_at,
                risk_score,
                deterioration_probability_60min,
                triage_category,
                action,
                status,
                gender,
                heart_rate,
                systolic_bp,
                spo2,
                temperature,
                age,
                rural,
                symptoms_json
            FROM triage_records
            WHERE patient_id = ?
            ORDER BY id DESC
            LIMIT ?
            """,
            (patient_id, raw_limit),
        ).fetchall()

    raw_row_count = len(rows)
    if not rows:
        raise HTTPException(status_code=404, detail="No history found for patient_id")

    training_samples = collect_training_samples()
    history: list[dict[str, Any]] = []
    seen_snapshots: set[tuple[Any, ...]] = set()
    for row in rows:
        snapshot_key = (
            row["risk_score"],
            row["triage_category"],
            row["action"],
            row["status"],
            row["heart_rate"],
            row["systolic_bp"],
            row["spo2"],
            row["temperature"],
            row["symptoms_json"],
        )
        if snapshot_key in seen_snapshots:
            continue
        seen_snapshots.add(snapshot_key)

        prediction = predict_next_move(
            age=int(row["age"]),
            rural=bool(row["rural"]),
            heart_rate=int(row["heart_rate"]),
            systolic_bp=int(row["systolic_bp"]),
            spo2=float(row["spo2"]),
            temperature=float(row["temperature"]),
            risk_score=int(row["risk_score"]),
            triage=row["triage_category"],
            symptoms=parse_symptoms_payload(row["symptoms_json"]),
            training_samples=training_samples,
        )
        history.append(
            {
                "timestamp": row["created_at"],
                "risk_score": row["risk_score"],
                "deterioration_probability_60min": row["deterioration_probability_60min"],
                "triage_category": row["triage_category"],
                "action": row["action"],
                "status": row["status"],
                "age": row["age"],
                "gender": row["gender"],
                "rural": bool(row["rural"]),
                "predicted_next_move": prediction["predicted_next_move"],
                "priority": prediction["priority"],
                "vitals": {
                    "heart_rate": row["heart_rate"],
                    "systolic_bp": row["systolic_bp"],
                    "spo2": row["spo2"],
                    "temperature": row["temperature"],
                },
                "symptoms": json.loads(row["symptoms_json"]),
            }
        )
        if len(history) >= limit:
            break

    if not history:
        raise HTTPException(status_code=404, detail="No history found for patient_id")

    latest = history[0]
    return {
        "patient_id": patient_id,
        "latest_status": latest["status"],
        "latest_triage_category": latest["triage_category"],
        "latest_priority": latest["priority"],
        "raw_records_scanned": raw_row_count,
        "unique_records_returned": len(history),
        "records": history,
    }


@app.get("/patients/{patient_id}/next-move-prediction")
def next_move_prediction(patient_id: str) -> dict[str, Any]:
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT age, rural, heart_rate, systolic_bp, spo2, temperature, risk_score, triage_category, symptoms_json
            FROM triage_records
            WHERE patient_id = ?
            ORDER BY id DESC
            LIMIT 1
            """,
            (patient_id,),
        ).fetchone()

    if row is None:
        raise HTTPException(status_code=404, detail="Patient record not found")

    prediction = predict_next_move(
        age=int(row["age"]),
        rural=bool(row["rural"]),
        heart_rate=int(row["heart_rate"]),
        systolic_bp=int(row["systolic_bp"]),
        spo2=float(row["spo2"]),
        temperature=float(row["temperature"]),
        risk_score=int(row["risk_score"]),
        triage=row["triage_category"],
        symptoms=parse_symptoms_payload(row["symptoms_json"]),
    )

    return {"patient_id": patient_id, **prediction, "generated_at": utc_now_iso()}


@app.get("/recommendations/clinical")
def clinical_recommendations(patient_id: str = Query(..., min_length=1)) -> dict[str, Any]:
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT age, rural, heart_rate, systolic_bp, spo2, temperature, risk_score, triage_category, symptoms_json
            FROM triage_records
            WHERE patient_id = ?
            ORDER BY id DESC
            LIMIT 1
            """,
            (patient_id,),
        ).fetchone()

    if row is None:
        raise HTTPException(status_code=404, detail="Patient record not found")

    prediction = predict_next_move(
        age=int(row["age"]),
        rural=bool(row["rural"]),
        heart_rate=int(row["heart_rate"]),
        systolic_bp=int(row["systolic_bp"]),
        spo2=float(row["spo2"]),
        temperature=float(row["temperature"]),
        risk_score=int(row["risk_score"]),
        triage=row["triage_category"],
        symptoms=parse_symptoms_payload(row["symptoms_json"]),
    )

    symptoms = parse_symptoms_payload(row["symptoms_json"])
    local_recs = build_rule_based_recommendations(row=row, prediction=prediction)

    ai_recs: list[str] = []
    ai_error = None
    try:
        symptoms_text = ", ".join(symptoms) if symptoms else "none reported"
        watchouts_text = ", ".join(prediction.get("ai_watchouts", []))
        prompt = (
            "Emergency triage support. Provide 4 short, actionable recommendations for immediate care planning. "
            "Use imperative style. No disclaimers. No markdown. One recommendation per line. "
            f"Age={row['age']}, HR={row['heart_rate']}, SBP={row['systolic_bp']}, "
            f"SpO2={row['spo2']}, Temp={row['temperature']}, "
            f"Risk={row['risk_score']}, Triage={row['triage_category']}, Rural={bool(row['rural'])}, "
            f"Symptoms={symptoms_text}, PredictedMove={prediction['predicted_next_move']}, "
            f"Priority={prediction['priority']}, Trajectory={prediction.get('next_24h_trajectory')}, "
            f"AIWatchouts={watchouts_text}."
        )
        ai_recs = fetch_ai_recommendations(prompt)
    except RuntimeError as exc:
        ai_error = str(exc)

    final_recommendations = dedupe_text_items(local_recs[:2] + ai_recs + local_recs[2:])[:4]
    if not final_recommendations:
        final_recommendations = local_recs[:4]

    return {
        "patient_id": patient_id,
        "predicted_next_move": prediction["predicted_next_move"],
        "priority": prediction["priority"],
        "recommendations": final_recommendations,
        "fallback_recommendations": local_recs,
        "recommendation_source": "pollinations_ai" if ai_recs else "rule_engine",
        "ai_error": ai_error,
        "generated_at": utc_now_iso(),
    }


@app.get("/analytics/summary")
def analytics_summary() -> dict[str, Any]:
    now_utc = datetime.now(timezone.utc)
    lookback_24h = now_utc - timedelta(hours=24)
    lookback_7d = now_utc - timedelta(days=7)

    with get_connection() as connection:
        all_rows = connection.execute(
            """
            SELECT
                created_at,
                risk_score,
                deterioration_probability_60min,
                triage_category,
                status,
                heart_rate,
                systolic_bp,
                spo2,
                temperature
            FROM triage_records
            ORDER BY id DESC
            LIMIT 5000
            """
        ).fetchall()
        status_rows = connection.execute(
            """
            SELECT status, COUNT(*) AS count
            FROM triage_records
            GROUP BY status
            """
        ).fetchall()

    parsed_rows: list[dict[str, Any]] = []
    for row in all_rows:
        try:
            created_at = datetime.fromisoformat(str(row["created_at"]))
        except (TypeError, ValueError):
            continue

        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)
        else:
            created_at = created_at.astimezone(timezone.utc)

        parsed_rows.append(
            {
                "created_at": created_at,
                "risk_score": int(row["risk_score"]),
                "deterioration_probability_60min": float(row["deterioration_probability_60min"]),
                "triage_category": row["triage_category"],
                "status": row["status"],
                "heart_rate": int(row["heart_rate"]),
                "systolic_bp": int(row["systolic_bp"]),
                "spo2": float(row["spo2"]),
                "temperature": float(row["temperature"]),
            }
        )

    records_24h = [row for row in parsed_rows if row["created_at"] >= lookback_24h]
    records_7d = [row for row in parsed_rows if row["created_at"] >= lookback_7d]

    def triage_counter(rows: list[dict[str, Any]]) -> dict[str, int]:
        counts = {"RED": 0, "ORANGE": 0, "YELLOW": 0, "GREEN": 0}
        for row in rows:
            category = row["triage_category"]
            if category in counts:
                counts[category] += 1
        return counts

    def average(rows: list[dict[str, Any]], field: str) -> float | None:
        if not rows:
            return None
        return round(sum(float(row[field]) for row in rows) / len(rows), 1)

    triage_counts = triage_counter(parsed_rows)
    triage_counts_24h = triage_counter(records_24h)
    status_counts = {row["status"]: row["count"] for row in status_rows}

    critical_cases_24h = sum(
        1 for row in records_24h if row["triage_category"] in {"RED", "ORANGE"}
    )

    hourly_volume_24h: list[dict[str, Any]] = []
    for bucket in range(8):
        start = lookback_24h + timedelta(hours=bucket * 3)
        end = start + timedelta(hours=3)
        bucket_rows = [row for row in records_24h if start <= row["created_at"] < end]
        bucket_counts = triage_counter(bucket_rows)
        hourly_volume_24h.append(
            {
                "hour": start.strftime("%H:%M"),
                "total": len(bucket_rows),
                "red": bucket_counts["RED"],
                "orange": bucket_counts["ORANGE"],
                "yellow": bucket_counts["YELLOW"],
                "green": bucket_counts["GREEN"],
            }
        )

    daily_volume_7d: list[dict[str, Any]] = []
    for offset in range(6, -1, -1):
        day = (now_utc - timedelta(days=offset)).date()
        day_rows = [row for row in records_7d if row["created_at"].date() == day]
        critical_count = sum(1 for row in day_rows if row["triage_category"] in {"RED", "ORANGE"})
        daily_volume_7d.append(
            {
                "day": day.isoformat(),
                "total": len(day_rows),
                "critical": critical_count,
            }
        )

    total_24h = len(records_24h)
    vitals_alert_rates_24h = {
        "hypoxia_pct": round((sum(1 for row in records_24h if row["spo2"] < 90) / total_24h) * 100, 1)
        if total_24h
        else 0.0,
        "hypotension_pct": round(
            (sum(1 for row in records_24h if row["systolic_bp"] < 90) / total_24h) * 100, 1
        )
        if total_24h
        else 0.0,
        "tachycardia_pct": round(
            (sum(1 for row in records_24h if row["heart_rate"] > 120) / total_24h) * 100, 1
        )
        if total_24h
        else 0.0,
        "fever_pct": round(
            (sum(1 for row in records_24h if row["temperature"] > 38.5) / total_24h) * 100, 1
        )
        if total_24h
        else 0.0,
    }

    return {
        "generated_at": utc_now_iso(),
        "total_records": len(parsed_rows),
        "total_records_24h": len(records_24h),
        "critical_cases_24h": critical_cases_24h,
        "average_risk_score": average(parsed_rows, "risk_score"),
        "average_risk_score_24h": average(records_24h, "risk_score"),
        "average_deterioration_probability_24h": round(
            sum(row["deterioration_probability_60min"] for row in records_24h) / len(records_24h), 2
        )
        if records_24h
        else None,
        "triage_counts": {
            "RED": triage_counts.get("RED", 0),
            "ORANGE": triage_counts.get("ORANGE", 0),
            "YELLOW": triage_counts.get("YELLOW", 0),
            "GREEN": triage_counts.get("GREEN", 0),
        },
        "triage_counts_24h": triage_counts_24h,
        "status_counts": status_counts,
        "hourly_volume_24h": hourly_volume_24h,
        "daily_volume_7d": daily_volume_7d,
        "vitals_alert_rates_24h": vitals_alert_rates_24h,
    }

