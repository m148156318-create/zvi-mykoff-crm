"""Fetch Bank of Israel representative rates (USD, EUR) and write rates.json."""
import csv, io, json, sys, urllib.request, datetime

UA = {"User-Agent": "Mozilla/5.0 (zvi-mykoff-crm rates bot)"}

def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8")

def from_public_api():
    data = json.loads(get("https://boi.org.il/PublicApi/GetExchangeRates"))
    out = {}
    for x in data.get("exchangeRates", []):
        if x.get("key") in ("USD", "EUR"):
            out[x["key"]] = round(float(x["currentExchangeRate"]) / float(x.get("unit") or 1), 4)
            out["date"] = str(x.get("lastUpdate", ""))[:10]
    return out

def from_sdmx():
    start = (datetime.date.today() - datetime.timedelta(days=14)).isoformat()
    url = ("https://edge.boi.gov.il/FusionEdgeServer/sdmx/v2/data/dataflow/BOI.STATISTICS/EXR/1.0/"
           f"RER_USD_ILS,RER_EUR_ILS?startperiod={start}&format=csv")
    rows = list(csv.DictReader(io.StringIO(get(url))))
    out = {}
    for cur in ("USD", "EUR"):
        rs = [r for r in rows if f"RER_{cur}_ILS" in (r.get("SERIES_CODE") or "")]
        rs.sort(key=lambda r: r.get("TIME_PERIOD", ""))
        if rs:
            out[cur] = round(float(rs[-1]["OBS_VALUE"]), 4)
            out["date"] = rs[-1]["TIME_PERIOD"]
    return out

rates = {}
for fn in (from_public_api, from_sdmx):
    try:
        rates = fn()
        if rates.get("USD") and rates.get("EUR"):
            break
    except Exception as e:  # try the next source
        print(f"{fn.__name__} failed: {e}", file=sys.stderr)
if not (rates.get("USD") and rates.get("EUR")):
    print("No rates fetched; keeping the previous file.", file=sys.stderr)
    sys.exit(0)
rates["source"] = "בנק ישראל - שער יציג"
with open("rates.json", "w", encoding="utf-8") as f:
    json.dump(rates, f, ensure_ascii=False)
print(rates)
