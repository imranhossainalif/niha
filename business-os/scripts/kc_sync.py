#!/usr/bin/env python3
"""Kids Care sales-team sync: 3 Google Sheets -> Business OS db docs (aggregates only, no customer PII).
Usage: python3 -I kc_sync.py <call_live.csv> <upsales.xlsx> <daily.xlsx> <outdir> [v6.xlsx ups_old.xlsx [existing_calls_daily_dir]]
The optional old sheets (Call System v6, old Up-sales Tracker) are merged in: reps still log there.
Writes <outdir>/writes.json (list of {collection, doc_id, data}) ready for an ArtifactData batch.
"""
import sys, csv, json, re, datetime, os
import openpyxl

call_csv, ups_x, daily_x, out = sys.argv[1:5]
os.makedirs(out, exist_ok=True)
NOW = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
REPS = ["Lamia", "Nusrat", "Shayla", "Jhumur", "Maruf"]
YEAR = datetime.date.today().year

def num(v):
    if v is None: return 0
    if isinstance(v, (int, float)): return v
    s = str(v).replace("৳", "").replace(",", "").replace("%", "").strip()
    try: return float(s) if "." in s else int(s)
    except: return 0

def iso(v):
    if isinstance(v, datetime.datetime): return v.date().isoformat()
    if isinstance(v, datetime.date): return v.isoformat()
    return None

writes = []
def put(col, doc, data): writes.append({"collection": col, "doc_id": doc, "data": data})

# ---------- 1. Call system Live_Dashboard (CSV) ----------
rows = [r[1:] if r else r for r in csv.reader(open(call_csv, encoding="utf-8"))]
sections, cur = {}, None
for r in rows:
    if not r or not any(c.strip() for c in r): continue
    m = re.match(r"^([①②③④⑤⑥⑦⑧⑨])", r[0])
    if m: cur = m.group(1); sections[cur] = []; continue
    if cur: sections[cur].append(r)

def table(key):
    t = sections.get(key) or []
    if not t: return [], []
    hdr = [h.replace("\n", " ").strip() for h in t[0]]
    return hdr, t[1:]

def rep_rows(key, fields):
    hdr, body = table(key)
    res = []
    for r in body:
        if not r[0].strip(): continue
        d = {"name": "Total" if r[0].strip() == "মোট" else r[0].strip()}
        for i, f in enumerate(fields, start=1):
            if f and i < len(r): d[f] = num(r[i]) if f != "status" else r[i]
        res.append(d)
    return res

F_CALL = ["calls", "received", "rcv_pct", "orders", "conv_pct", "order_tk", "whatsapp", "target", "left", "status"]
F_AVG = ["calls", "received", "rcv_pct", "orders", "conv_pct", "order_tk", "whatsapp", "avg_calls", "avg_orders"]
live = {
    "asof": NOW,
    "today": rep_rows("①", F_CALL),
    "selected_day": rep_rows("②", F_CALL),
    "last7": rep_rows("③", F_AVG),
    "month": rep_rows("④", F_AVG),
    "pipeline": rep_rows("⑥", ["leads", "not_called", "due_today", "overdue", "no_answer", "talked", "interested", "ordered", "not_interested", "dropped"]),
    "segments": rep_rows("⑦", ["champion", "regular", "new", "at_risk", "sleeping", "lost", "avg_score", "score70"]),
    "datacheck": rep_rows("⑧", ["order_no_tk", "date_as_text", "result_no_date", "future_date", "pre2023", "bad_result"]),
    "courier": rep_rows("⑨", ["checked", "reliable", "ok", "new_courier", "risk", "reported", "avg_success"]),
}
# selected date label
for r in rows:
    if len(r) > 6 and r[0].strip() == "আজ": live["today_label"] = r[1]; live["selected_label"] = r[6]
hdr, body = table("⑤")
trend = []
MON = {m: i for i, m in enumerate(["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"], 1)}
for r in body:
    m = re.match(r"(\d+)\s+(\w{3})", r[0])
    if not m: continue
    mo = MON[m.group(2)]; yr = YEAR if mo <= datetime.date.today().month + 1 else YEAR - 1
    d = datetime.date(yr, mo, int(m.group(1))).isoformat()
    row = {"date": d, "reps": {REPS[i]: num(r[1 + i]) for i in range(5)},
           "calls": num(r[6]), "received": num(r[7]), "orders": num(r[8])}
    trend.append(row)
    put("calls_daily", d, dict(row, asof=NOW))
live["trend14"] = trend
put("sales_team", "live_calls", live)

# ---------- 2. Up-sell tracker ----------
wb = openpyxl.load_workbook(ups_x, data_only=True, read_only=True)
dash = [list(r) for r in wb["Dashboard"].iter_rows(values_only=True)]
dash = [r[1:] for r in dash if any(c not in (None, "") for c in r)]

def find(prefix):
    for i, r in enumerate(dash):
        if r and isinstance(r[0], str) and r[0].startswith(prefix): return i
    return -1

ups = {"asof": NOW}
# section 3: month by rep
i = find("৩)")
months = []
for r in dash[i + 2:]:
    if not isinstance(r[0], str) or not re.match(r"\d{4} \w{3}", r[0]): break
    reps = {REPS[k]: num(r[1 + k]) for k in range(5)}
    months.append({"month": r[0], "reps": reps, "total": num(r[11])})
ups["months"] = [m for m in months if m["total"]]
# section 2: chosen-month detail (whatever month the sheet shows)
i = find("২)")
ups["month_detail_label"] = str(dash[i + 1][1]) if i >= 0 else ""
det = []
for r in dash[i + 3:i + 9]:
    if r[0] in REPS or r[0] == "সব মিলিয়ে":
        det.append({"name": "Total" if r[0] == "সব মিলিয়ে" else r[0], "sales": num(r[1]), "orders": num(r[2]),
                    "upsell_n": num(r[3]), "upsell_tk": num(r[4]), "old_n": num(r[5]), "new_n": num(r[6]),
                    "card_n": num(r[7]), "cancel": num(r[8]), "commission": num(r[9]), "payable": num(r[10])})
ups["month_detail"] = det
# section 4: leaderboard
i = find("৪)")
lb = []
for r in dash[i + 2:i + 9]:
    if r[1] in REPS:
        lb.append({"rank": num(r[0]), "name": r[1], "sales": num(r[2]), "orders": num(r[3]), "aov": num(r[4]),
                   "hits": num(r[5]), "streak": num(r[6]), "commission": num(r[7]), "bonus": num(r[8]), "total": num(r[9])})
ups["leaderboard"] = lb
# section 7: dues
i = find("৭)")
dues = []
for r in dash[i + 2:i + 9]:
    if r[0] in REPS or r[0] == "সব মিলিয়ে":
        dues.append({"name": "Total" if r[0] == "সব মিলিয়ে" else r[0], "new_rule": num(r[1]), "old_rule": num(r[2]),
                     "owed": num(r[3]), "paid": num(r[4]), "due": num(r[5])})
ups["dues"] = dues
# section 8: data checks
i = find("৮)")
chk = []
for r in dash[i + 2:i + 14]:
    if isinstance(r[0], str) and r[0] and not r[0].startswith("৯"):
        chk.append({"issue": r[0], "count": num(r[4]), "fix": r[5] or ""})
    elif isinstance(r[0], str) and r[0].startswith("৯"): break
ups["checks"] = chk
# payments
pay = []
for r in list(wb["Payments"].iter_rows(values_only=True))[3:]:
    if r and iso(r[0]) and r[1]:
        pay.append({"date": iso(r[0]), "name": r[1], "amount": num(r[2]), "for": r[3] or "", "note": (r[4] or "")[:80]})
ups["payments"] = pay
# cycle summary: rows with activity, or current/previous cycle
cyc = []
cs = list(wb["Cycle Summary"].iter_rows(values_only=True))
today = datetime.date.today()
cur_cycle = f"{today.year} {today.strftime('%b')} {'01' if today.day <= 15 else '02'}"
for r in cs[3:]:
    if not r or r[2] not in REPS: continue
    if num(r[10]) or r[0] == cur_cycle:
        cyc.append({"cycle": r[0], "name": r[2], "rule": r[3], "target": num(r[9]), "sales": num(r[10]),
                    "pct": num(r[11]), "orders": num(r[12]), "upsell_n": num(r[13]), "upsell_tk": num(r[14]),
                    "cancel": num(r[23]), "deliv_pct": num(r[25]), "hit": str(r[26] or ""),
                    "streak": num(r[27]), "commission": num(r[29]) if len(r) > 29 else 0})
ups["cycles"] = cyc
ups["current_cycle"] = cur_cycle
put("sales_team", "upsell", ups)

# daily up-sell sales per rep (Old tab + rep tabs), no customer fields kept
daily = {}
def add(d, rep, sales, delivered, cancelled):
    if not d or rep not in REPS: return
    x = daily.setdefault(d, {}).setdefault(rep, {"sales": 0, "lines": 0, "delivered": 0, "cancel": 0})
    x["sales"] += sales; x["lines"] += 1; x["delivered"] += delivered; x["cancel"] += cancelled
for r in list(wb["Old"].iter_rows(values_only=True))[4:]:
    if not r or not iso(r[0]): continue
    st = str(r[8] or "")
    add(iso(r[0]), r[1], num(r[12]) if "হয়েছে" in st else 0, int("হয়েছে" in st), int("ফেরত" in st or "ক্যান্সেল" in st))
for rep in REPS:
    for r in list(wb[rep].iter_rows(values_only=True))[4:]:
        if not r or not iso(r[0]): continue
        st = str(r[14] or "")
        add(iso(r[0]), rep, num(r[28]) if "হয়েছে" in st else 0, int("হয়েছে" in st), int("ফেরত" in st or "ক্যান্সেল" in st))
put("sales_team", "upsell_daily", {"asof": NOW, "days": [
    {"date": d, "reps": daily[d], "total": sum(v["sales"] for v in daily[d].values())} for d in sorted(daily)]})

# ---------- 3. Staff daily reports ----------
wb = openpyxl.load_workbook(daily_x, data_only=True, read_only=True)
people = []
def hm(v):  # time cell -> "HH:MM" (text or datetime.time), "" if empty
    if isinstance(v, (datetime.time, datetime.datetime)): return v.strftime("%H:%M")
    m = re.match(r"^\s*(\d{1,2})[:.](\d{2})", str(v or ""))
    return "%02d:%s" % (int(m.group(1)), m.group(2)) if m else ""
office = {}
if "সেটিংস" in wb.sheetnames:
    cfg_rows = [list(r) for r in wb["সেটিংস"].iter_rows(values_only=True)]
    lab = {str(r[1]).strip(): r[2] for r in cfg_rows if len(r) > 2 and r[1]}
    office = {"in": hm(lab.get("অফিসে ঢোকার সময়")), "out": hm(lab.get("অফিস থেকে বের হওয়ার সময়")),
              "off_day": num(lab.get("সাপ্তাহিক ছুটির দিন")), "fine_after": num(lab.get("কত দিন রিপোর্ট না দিলে জরিমানা")),
              "fine_tk": num(lab.get("জরিমানার টাকা (৳)")), "fine_from": iso(lab.get("জরিমানা গণনা শুরু")) or ""}
    hdr_i = next((k for k, r in enumerate(cfg_rows) if len(r) > 2 and r[1] == "Tab" and r[2] == "নাম"), None)
    targets = {}
    if hdr_i is not None:
        for r in cfg_rows[hdr_i + 1:]:
            if len(r) < 17 or not r[2]: break
            targets[str(r[2])] = {"metrics": [str(x) for x in r[4:10]], "targets": [num(x) for x in r[10:16]], "hours": num(r[16])}
    office["targets"] = targets
show_month = None
for ws in wb.worksheets:
    raw = [list(r) for r in ws.iter_rows(values_only=True)]
    hi = next((k for k, r in enumerate(raw) if r and r[0] == "তারিখ"), None)
    if hi is None or len(raw) < 3 or raw[1][0] != "নাম": continue
    name = raw[1][1]
    if not name: continue
    role = str(raw[1][4] or "") if len(raw[1]) > 4 else ""
    if len(raw[1]) > 10 and iso(raw[1][10]): show_month = iso(raw[1][10])[:7]
    summ = raw[2]
    hdr = raw[hi]
    mcols = [(j, str(hdr[j])) for j in range(5, 11) if hdr[j] and str(hdr[j]) != "—"]
    days = []
    for r in raw[hi + 1:]:
        d = iso(r[0])
        if not d: continue
        if d > today.isoformat(): break
        days.append({"date": d, "in": hm(r[2]), "out": hm(r[3]), "hours": num(r[4]),
                     "m": {lab: num(r[j]) for j, lab in mcols},
                     "main": str(r[11] or "")[:200], "other": str(r[12] or "")[:200], "problem": str(r[13] or "")[:200], "plan": str(r[14] or "")[:200],
                     "report": str(r[15] or ""), "score": num(r[16]), "missed": num(r[17])})
    people.append({"name": name, "role": role, "metrics": [lab for _, lab in mcols],
                   "reports": num(summ[1]), "missed": num(summ[3]), "fine": num(summ[5]),
                   "hours": num(summ[7]), "avg_hours": num(summ[9]), "score": num(summ[11]), "days": days})
staff_doc = {"asof": NOW, "month": show_month or today.strftime("%Y-%m"), "office": office, "people": people}
put("sales_team", "staff", staff_doc)
# one doc per month too, so earlier months stay visible after the sheet moves on
put("sales_team", "staff_" + staff_doc["month"], dict(staff_doc))

# ---------- 4. Old sheets: Call System v6 + old Up-sales Tracker (merge) ----------
if len(sys.argv) > 6:
    import collections, glob
    v6x, uox = sys.argv[5], sys.argv[6]
    exdir = sys.argv[7] if len(sys.argv) > 7 else None
    BN = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")
    MO = {m: i for i, m in enumerate(["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"], 1)}
    def pdate(v):
        if isinstance(v, (datetime.datetime, datetime.date)):
            d = v.date() if isinstance(v, datetime.datetime) else v
        else:
            s_ = str(v or "").translate(BN).strip()
            if not s_: return None
            m = re.match(r"^(\d{4})-(\d{1,2})-(\d{1,2})", s_)
            try:
                if m: d = datetime.date(*map(int, m.groups()))
                else:
                    m = re.match(r"^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$", s_)
                    if m:
                        dd, mm, yy = map(int, m.groups()); d = datetime.date(yy + 2000 if yy < 100 else yy, mm, dd)
                    else:
                        m = re.match(r"^(\d{1,2})\s*([A-Za-z]{3})", s_)
                        if not m or m.group(2).lower() not in MO: return None
                        d = datetime.date(YEAR, MO[m.group(2).lower()], int(m.group(1)))
            except ValueError: return None
        if d < datetime.date(2026, 6, 1) or d > today: return None
        return d.isoformat()
    NOREC = ("no answer", "call not received", "call not recieve", "phone off", "number off", "wrong", "dead")
    agg = collections.defaultdict(lambda: {"calls": 0, "received": 0, "orders": 0, "tk": 0})
    wb6 = openpyxl.load_workbook(v6x, read_only=True, data_only=True)
    for rep in REPS:
        if rep not in wb6.sheetnames: continue
        it = wb6[rep].iter_rows(values_only=True); hdr = None
        for r in it:
            if r and "Customer ID" in r: hdr = list(r); break
        if not hdr: continue
        ix = {c: i for i, c in enumerate(hdr) if c}
        for r in it:
            if not r or len(r) <= ix["Call-3 Outcome"] or not r[ix["Customer ID"]]: continue
            last_ord = None
            for k in (1, 2, 3):
                dv, o = r[ix[f"Call-{k} Date"]], str(r[ix[f"Call-{k} Outcome"]] or "").strip()
                if dv in (None, "") and not o: continue
                d = pdate(dv)
                if not d: continue
                a = agg[(d, rep)]; a["calls"] += 1; ol = o.lower()
                if ol and not ol.startswith(NOREC): a["received"] += 1
                if "ordered" in ol: a["orders"] += 1; last_ord = d
            if last_ord and "New Order (৳)" in ix:
                _t = num(r[ix["New Order (৳)"]]) if len(r) > ix["New Order (৳)"] else 0
                agg[(last_ord, rep)]["tk"] += _t if 0 < _t < 50000 else 0
    # existing calls_daily (from db) for v7 numbers of older dates
    v7 = {}
    if exdir:
        for f in glob.glob(os.path.join(exdir, "*.json")):
            j = json.load(open(f)); j = j.get("data", j)
            if j.get("date"): v7[j["date"]] = j.get("src", {}).get("v7full") or j
    for w in writes:
        if w["collection"] == "calls_daily": v7[w["doc_id"]] = w["data"]
    writes[:] = [w for w in writes if w["collection"] != "calls_daily"]
    cutoff = (today - datetime.timedelta(days=30)).isoformat()
    cd = {}
    for d in sorted({k[0] for k in agg} | set(v7)):
        o = v7.get(d, {}); reps, rcv, ordr, otk, pick = {}, {}, {}, {}, {}
        for r in REPS:
            c7 = (o.get("reps") or {}).get(r, 0); s6 = agg.get((d, r))
            if s6 and s6["calls"] >= c7:
                reps[r] = s6["calls"]; rcv[r] = s6["received"]; ordr[r] = s6["orders"]; otk[r] = round(s6["tk"]); pick[r] = "v6"
            else:
                reps[r] = c7; pick[r] = "v7" if c7 else ""
                if s6:  # partial call-sheet rows: keep their receive/order rather than showing nothing
                    rcv[r] = s6["received"]; ordr[r] = s6["orders"]; otk[r] = round(s6["tk"])
        t6 = {k: sum(agg[(d, r)][k] for r in REPS if (d, r) in agg) for k in ("calls", "received", "orders")}
        v7full = {"date": d, "reps": o.get("reps", {}), "calls": o.get("calls", 0), "received": o.get("received", 0), "orders": o.get("orders", 0)}
        doc = {"date": d, "reps": reps, "rcv": rcv, "ord": ordr, "otk": otk, "order_tk": sum(otk.values()), "calls": sum(reps.values()),
               "received": max(o.get("received", 0), t6["received"]), "orders": max(o.get("orders", 0), t6["orders"]),
               "src": {"v6": t6, "v7": {k: o.get(k, 0) for k in ("calls", "received", "orders")}, "v7full": v7full, "pick": pick}, "asof": NOW}
        cd[d] = doc
        if d >= cutoff or os.environ.get("KC_ALLDAYS"): put("calls_daily", d, doc)
    def roll(days):
        rows = []
        for r in REPS + ["Total"]:
            c = rv = od = tk_ = 0; act = 0
            for d in days:
                j = cd[d]
                if r == "Total": cc, rr, oo, tt = j["calls"], j["received"], j["orders"], j.get("order_tk", 0)
                else: cc, rr, oo, tt = j["reps"][r], j["rcv"].get(r, 0), j["ord"].get(r, 0), j.get("otk", {}).get(r, 0)
                c += cc; rv += rr; od += oo; tk_ += tt; act += 1 if cc else 0
            n = act or 1
            rows.append({"name": r, "calls": c, "received": rv, "rcv_pct": round(rv * 100 / c, 1) if c else 0, "orders": od,
                         "conv_pct": round(od * 100 / rv, 1) if rv else 0, "order_tk": round(tk_), "avg_calls": round(c / n, 1), "avg_orders": round(od / n, 1), "days": act})
        return rows
    ds = sorted(cd); mo = today.strftime("%Y-%m"); l7 = (today - datetime.timedelta(days=6)).isoformat()
    live["month_v7"], live["last7_v7"] = live.get("month"), live.get("last7")
    live["month"] = roll([d for d in ds if d.startswith(mo)]); live["last7"] = roll([d for d in ds if d >= l7])
    live["months_hist"] = [{"month": m, "rows": roll([d for d in ds if d.startswith(m)])} for m in sorted({d[:7] for d in ds})]
    live["merged_note"] = "v6 (purono call sheet) + v7 milano: proti rep proti din jei sheet e beshi call, sheta nawa (double count hoy na)."
    # v6 Admin_Dashboard history (aggregates only)
    ad = [list(r) for r in wb6["Admin_Dashboard"].iter_rows(values_only=True)] if "Admin_Dashboard" in wb6.sheetnames else []
    h6 = {"asof": NOW, "reps": [], "baby_age": []}
    for r in ad:
        r = list(r) + [None] * 12
        if r[3] == "Customers": h6["customers"] = num(r[4])
        if r[3] == "Delivered/Sales": h6["delivered_sales"] = num(r[4])
        if r[3] and str(r[3]).startswith("Customer LTV"): h6["ltv_revenue"] = round(num(r[4]))
        if r[3] and str(r[3]).startswith("Avg Revenue/Customer"): h6["avg_rev_customer"] = round(num(r[4]))
        if r[3] and str(r[3]).startswith("Avg Orders/Customer"): h6["avg_orders_customer"] = round(num(r[4]), 2)
        if r[0] in REPS and isinstance(r[1], (int, float)) and r[1] > 100:
            h6["reps"].append({"name": r[0], "assigned": num(r[1]), "hist_sales": num(r[2]), "hist_rev": round(num(r[3]))})
        if isinstance(r[0], str) and re.search(r"month|Year|Unknown", r[0]) and isinstance(r[1], (int, float)) and r[0] != "Month":
            h6["baby_age"].append({"age": r[0], "c": num(r[1]), "rev": round(num(r[3]))})
    live["v6"] = h6
    # old up-sell tracker
    wo = openpyxl.load_workbook(uox, read_only=True, data_only=True)
    da = [list(r) for r in wo["Dashboard"].iter_rows(values_only=True)]
    lb, mrows, mode = [], [], None
    for r in da:
        if not r or r[0] is None: continue
        if r[0] == "Salesperson": mode = "lb"; continue
        if r[0] == "Month": mode = "m"; hdr_m = r; continue
        if mode == "lb" and r[0] in REPS:
            lb.append({"name": r[0], "sales": num(r[1]), "orders": num(r[2]), "commission": round(num(r[3])), "paid": round(num(r[4])), "pending": round(max(0, num(r[5]))), "hits": num(r[6]), "aov": round(num(r[7]))})
        if mode == "lb" and r[0] == "TOTAL": tot = {"sales": num(r[1]), "orders": num(r[2]), "commission": round(num(r[3])), "paid": round(num(r[4])), "pending": round(num(r[5]))}
        if mode == "m" and re.match(r"^\d{4}-\d{1,2}$", str(r[0])) and num(r[6]):
            y, m_ = map(int, str(r[0]).split("-")); lab = datetime.date(y, m_, 1).strftime("%Y %b")
            mrows.append({"month": lab, "reps": {hdr_m[k]: num(r[k]) for k in range(1, 6)}, "total": num(r[6])})
    lb.sort(key=lambda x: -x["sales"])
    for i, x in enumerate(lb): x["rank"] = i + 1
    ups["months_new"], ups["leaderboard_new"], ups["dues_new"] = ups.get("months"), ups.get("leaderboard"), ups.get("dues")
    newm = {m["month"]: m["total"] for m in ups["months_new"] or []}
    for m in mrows: m["old"] = m["total"]; m["new"] = newm.get(m["month"], 0)
    ups["months"] = mrows; ups["leaderboard"] = lb
    ups["dues"] = [{"name": x["name"], "new_rule": 0, "old_rule": x["commission"], "owed": x["commission"], "paid": x["paid"], "due": x["pending"]} for x in lb] + \
                  [{"name": "Total", "new_rule": 0, "old_rule": tot["commission"], "owed": tot["commission"], "paid": tot["paid"], "due": tot["pending"]}]
    ups["old_alltime"] = tot
    pay = []
    for r in list(wo["Payments"].iter_rows(values_only=True)):
        if r and iso(r[0]) and r[1] in REPS: pay.append({"date": iso(r[0]), "name": r[1], "amount": num(r[2]), "for": "", "note": str(r[3] or "")[:80]})
    ups["payments"] = pay
    per = []
    cur_h = f"{today.year}-{today.month}-H{1 if today.day <= 15 else 2}"
    for r in list(wo["Period Summary"].iter_rows(values_only=True)):
        if r and isinstance(r[0], str) and re.match(r"^\d{4}-\d{1,2}-H\d$", r[0]) and r[1] in REPS:
            y, m_, h = r[0].split("-"); key = (int(y), int(m_), h)
            if key <= (today.year, today.month, "H2") and (num(r[2]) or r[0] == cur_h):
                per.append({"period": r[0], "name": r[1], "sales": num(r[2]), "target": num(r[3]), "hit": str(r[4] or "") == "HIT", "commission": round(num(r[5]))})
    ups["periods"] = per
    ups["merged_note"] = "Mash-wise sale, commission, paid, baki: purono Up-sales Tracker (latest). Notun v4.2 er gula *_new e rakha."
    # daily up-sell: old tracker lines per rep per day, keep the bigger of old/new
    od = {}
    for rep in REPS:
        if rep not in wo.sheetnames: continue
        for r in wo[rep].iter_rows(values_only=True):
            d = iso(r[0]) if r else None
            if not d: continue
            x = od.setdefault(d, {}).setdefault(rep, {"sales": 0, "lines": 0, "delivered": 0, "cancel": 0, "pending": 0, "pending_tk": 0})
            x["lines"] += 1; dv = str(r[7] or "").strip().upper()
            if dv == "Y": x["sales"] += num(r[6]); x["delivered"] += 1
            elif dv == "N": x["cancel"] += 1
            else: x["pending"] += 1; x["pending_tk"] += num(r[6])
    for d, reps in od.items():
        cur = daily.setdefault(d, {})
        for rep, x in reps.items():
            if rep not in cur or (x["sales"], x["lines"]) > (cur[rep]["sales"], cur[rep]["lines"]): cur[rep] = x
    for w in writes:
        if w["doc_id"] == "upsell_daily":
            w["data"]["days"] = [{"date": d, "reps": daily[d], "total": sum(v["sales"] for v in daily[d].values())} for d in sorted(daily)]

json.dump(writes, open(os.path.join(out, "writes.json"), "w"), ensure_ascii=False)
# also one file per doc for file_path batches
for k, w in enumerate(writes):
    p = os.path.join(out, f"{w['collection']}__{w['doc_id']}.json")
    json.dump(w["data"], open(p, "w"), ensure_ascii=False)
print(len(writes), "docs ->", out)
print(json.dumps({"month": live["month"], "dues": ups["dues"]}, ensure_ascii=False)[:1500])
