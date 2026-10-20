"""Pull Kids Care orders from Nuport and build sales_daily rows (one per BD date).
Usage: NUPORT_API_KEY=... python3 nuport_sync.py <first_SO_number> <last_SO_number> 2026-10-18 2026-10-19 ...
Nuport API: GET https://api.nuport.io/integration/orders/SO-<n>  (header Authorization: <key>), 404 = no order.
"""
import json,os,sys,time,urllib.request,urllib.error
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime,timedelta,timezone
K=os.environ["NUPORT_API_KEY"]
def get(n):
    req=urllib.request.Request(f"https://api.nuport.io/integration/orders/SO-{n}",headers={"Authorization":K})
    for _ in range(3):
        try:
            with urllib.request.urlopen(req,timeout=30) as r: return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code==404: return None
            time.sleep(2)
        except Exception: time.sleep(2)
def slim(o):
    return {"id":o.get("internalId"),"created":o.get("createdAt"),"status":o.get("status"),"delivery_status":o.get("deliveryStatus"),
            "total":o.get("totalAmount"),"is_return":o.get("isReturn"),"delivered_at":o.get("deliveredAt")}
def bd(t): return (datetime.fromisoformat(t.replace('Z','+00:00'))+timedelta(hours=6)).strftime('%Y-%m-%d') if t else None
a,b=int(sys.argv[1]),int(sys.argv[2]); days=sys.argv[3:]
with ThreadPoolExecutor(4) as ex: r=[slim(o) for o in ex.map(get,range(a,b+1)) if o]
amt=lambda L:round(sum(float(o['total'] or 0) for o in L))
now=datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'); out=[]
for d in days:
    C=[o for o in r if bd(o['created'])==d]; can=[o for o in C if o['status']=='CANCELLED']
    sent=[o for o in C if o['status'] in('IN_TRANSIT','COMPLETED')]; tr=[o for o in sent if o['status']=='IN_TRANSIT']
    dl=[o for o in sent if o['status']=='COMPLETED' and not o.get('is_return')]; ret=[o for o in sent if o.get('is_return')]
    D=[o for o in r if bd(o.get('delivered_at'))==d]
    out.append({"id":"kidscare_"+d,"asof":now,"business":"kidscare","date":d,"source":"nuport","orders":len(C),"cancelled":len(can),
      "real_orders":len(C)-len(can),"in_progress":len(C)-len(can)-len(sent),"sent":len(sent),"sent_amount":amt(sent),
      "sent_delivered":len(dl),"sent_delivered_amount":amt(dl),"sent_in_transit":len(tr),"sent_in_transit_amount":amt(tr),
      "sent_returned":len(ret),"sent_other":len(sent)-len(dl)-len(tr)-len(ret),"delivered":len(D),"delivered_amount":amt(D),"cash_due":0})
print(json.dumps(out,ensure_ascii=False,indent=1))
